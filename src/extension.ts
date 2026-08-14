import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as http from "http";
import * as net from "net";
import { ChildProcess, spawn } from "child_process";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address() as net.AddressInfo;
      srv.close(() => resolve(addr.port));
    });
    srv.on("error", reject);
  });
}

function httpGet(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => resolve(res.statusCode ?? 0));
    req.on("error", reject);
    req.setTimeout(1500, () => { req.destroy(); reject(new Error("timeout")); });
  });
}

async function waitForBackend(port: number, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const code = await httpGet(`http://127.0.0.1:${port}/health`);
      if (code === 200) return;
    } catch { /* keep polling */ }
    await new Promise((r) => setTimeout(r, 600));
  }
  throw new Error("CodeForest backend failed to start within 30 s");
}

function findPython(): string {
  for (const candidate of ["python3", "python", "py"]) {
    try {
      const result = require("child_process").spawnSync(candidate, ["--version"], { timeout: 2000 });
      if (result.status === 0) return candidate;
    } catch { /* try next */ }
  }
  return "python3";
}

async function fetchJson(url: string, body: object): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = new URL(url);
    const req = http.request(
      { hostname: options.hostname, port: options.port, path: options.pathname, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          try { resolve(JSON.parse(raw)); }
          catch (e) { reject(e); }
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// ─── Venv + Dependency installer ─────────────────────────────────────────────

/** Returns the Python binary path inside a venv (cross-platform). */
function getVenvPython(venvPath: string): string {
  return process.platform === "win32"
    ? path.join(venvPath, "Scripts", "python.exe")
    : path.join(venvPath, "bin", "python");
}

function createVenv(
  systemPython: string,
  venvPath: string,
  outputChannel: vscode.OutputChannel
): Promise<void> {
  return new Promise((resolve, reject) => {
    outputChannel.appendLine(`[CodeForest] Creating virtual environment at ${venvPath} …`);
    const proc = spawn(systemPython, ["-m", "venv", venvPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    proc.stdout?.on("data", (d) => outputChannel.appendLine(`[venv] ${d.toString().trim()}`));
    proc.stderr?.on("data", (d) => outputChannel.appendLine(`[venv] ${d.toString().trim()}`));
    proc.on("exit", (code) => {
      if (code === 0) {
        outputChannel.appendLine("[CodeForest] Virtual environment created.");
        resolve();
      } else {
        reject(new Error(`python -m venv failed with exit code ${code}`));
      }
    });
    proc.on("error", reject);
  });
}

function installPythonDeps(
  venvPython: string,
  backendDir: string,
  outputChannel: vscode.OutputChannel
): Promise<void> {
  return new Promise((resolve, reject) => {
    outputChannel.appendLine("[CodeForest] Installing Python dependencies into virtual environment…");
    const pip = spawn(venvPython, ["-m", "pip", "install", "-r", "requirements.txt", "--quiet"], {
      cwd: backendDir,
      stdio: ["ignore", "pipe", "pipe"],
    });
    pip.stdout?.on("data", (d) => outputChannel.appendLine(`[pip] ${d.toString().trim()}`));
    pip.stderr?.on("data", (d) => outputChannel.appendLine(`[pip] ${d.toString().trim()}`));
    pip.on("exit", (code) => {
      if (code === 0) {
        outputChannel.appendLine("[CodeForest] pip install completed successfully.");
        resolve();
      } else {
        reject(new Error(`pip install failed with exit code ${code}`));
      }
    });
    pip.on("error", reject);
  });
}

function checkPythonDepsInstalled(venvPython: string): boolean {
  try {
    const result = require("child_process").spawnSync(
      venvPython,
      ["-c", "import fastapi, uvicorn, pydantic, tree_sitter"],
      { timeout: 5000 }
    );
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Ensures a venv exists at `venvPath` with all backend deps installed.
 * Returns the path to the venv's Python binary.
 */
async function ensurePythonDeps(
  systemPython: string,
  venvPath: string,
  backendDir: string,
  outputChannel: vscode.OutputChannel
): Promise<string> {
  const venvPython = getVenvPython(venvPath);
  const flagFile = path.join(venvPath, ".deps_installed");

  if (fs.existsSync(venvPython) && fs.existsSync(flagFile)) {
    if (checkPythonDepsInstalled(venvPython)) {
      return venvPython;
    }
    outputChannel.appendLine("[CodeForest] Dependency check failed — reinstalling…");
    fs.unlinkSync(flagFile);
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Setting up CodeForest…",
      cancellable: false,
    },
    async (progress) => {
      if (!fs.existsSync(venvPython)) {
        progress.report({ message: "Creating virtual environment…" });
        await createVenv(systemPython, venvPath, outputChannel);
      }
      progress.report({ message: "Installing Python dependencies…" });
      await installPythonDeps(venvPython, backendDir, outputChannel);
      fs.writeFileSync(flagFile, new Date().toISOString(), "utf-8");
    }
  );

  return venvPython;
}

// ─── Backend process manager ──────────────────────────────────────────────────

class BackendServer {
  private proc: ChildProcess | null = null;
  public port = 0;

  async start(extensionPath: string, globalStoragePath: string, outputChannel: vscode.OutputChannel): Promise<void> {
    if (this.proc) return; // already running
    this.port = await getFreePort();
    const backendDir = path.join(extensionPath, "backend");
    const backendMain = path.join(backendDir, "main.py");
    const systemPython = findPython();
    const venvPath = path.join(globalStoragePath, "codeforest-venv");

    // Ensure venv exists and deps are installed; get the venv's python binary.
    let venvPython = systemPython;
    let depsReady = false;
    while (!depsReady) {
      try {
        venvPython = await ensurePythonDeps(systemPython, venvPath, backendDir, outputChannel);
        depsReady = true;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        outputChannel.appendLine(`[CodeForest] Dependency install failed: ${errMsg}`);
        const choice = await vscode.window.showErrorMessage(
          "CodeForest couldn't install Python dependencies. Check the logs for details.",
          "Retry",
          "Open Logs"
        );
        if (choice === "Retry") {
          // Loop and try again.
        } else {
          if (choice === "Open Logs") {
            outputChannel.show();
          }
          throw err;
        }
      }
    }

    outputChannel.appendLine(`[CodeForest] Starting backend: ${venvPython} ${backendMain} --port ${this.port}`);

    this.proc = spawn(venvPython, [backendMain, "--port", String(this.port)], {
      cwd: backendDir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.proc.stdout?.on("data", (d) => outputChannel.appendLine(`[backend] ${d.toString().trim()}`));
    this.proc.stderr?.on("data", (d) => outputChannel.appendLine(`[backend] ${d.toString().trim()}`));
    this.proc.on("exit", (code) => {
      outputChannel.appendLine(`[CodeForest] Backend exited with code ${code}`);
      this.proc = null;
    });

    await waitForBackend(this.port);
    outputChannel.appendLine(`[CodeForest] Backend ready on port ${this.port}`);
  }

  stop(): void {
    if (this.proc) {
      this.proc.kill("SIGTERM");
      this.proc = null;
    }
  }
}

// ─── Webview panel ────────────────────────────────────────────────────────────

class CodeForestPanel {
  private static instance: CodeForestPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly backend: BackendServer;
  private readonly extensionUri: vscode.Uri;
  private readonly output: vscode.OutputChannel;

  static createOrShow(
    extensionUri: vscode.Uri,
    backend: BackendServer,
    output: vscode.OutputChannel
  ): void {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
    if (CodeForestPanel.instance) {
      CodeForestPanel.instance.panel.reveal(column);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "codeforest",
      "CodeForest",
      column,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "media", "webview")],
        retainContextWhenHidden: true,
      }
    );
    CodeForestPanel.instance = new CodeForestPanel(panel, extensionUri, backend, output);
  }

  static dispose(): void {
    CodeForestPanel.instance?.panel.dispose();
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    backend: BackendServer,
    output: vscode.OutputChannel
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.backend = backend;
    this.output = output;

    this.panel.webview.html = this.getHtml();
    this.panel.onDidDispose(() => { CodeForestPanel.instance = undefined; });

    this.panel.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case "ready":
          this.sendWorkspaceInfo();
          break;
        case "analyze":
          await this.runAnalysis(msg.workspacePath as string);
          break;
        case "openFile":
          this.openFile(msg.path as string, msg.workspaceRoot as string);
          break;
      }
    });
  }

  private sendWorkspaceInfo(): void {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) {
      this.panel.webview.postMessage({ type: "noWorkspace" });
      return;
    }
    const workspaces = folders.map((f) => ({ name: f.name, path: f.uri.fsPath }));
    this.panel.webview.postMessage({ type: "workspaceInfo", workspaces });
  }

  private async runAnalysis(workspacePath: string): Promise<void> {
    this.panel.webview.postMessage({ type: "loading" });
    try {
      await this.backend.start(this.extensionUri.fsPath, globalStoragePath, this.output);
      const result = await fetchJson(
        `http://127.0.0.1:${this.backend.port}/analyze`,
        { path: workspacePath }
      );
      this.panel.webview.postMessage({ type: "graphData", data: result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.output.appendLine(`[CodeForest] Analysis error: ${message}`);
      this.panel.webview.postMessage({ type: "error", message });
    }
  }

  private openFile(relPath: string, workspaceRoot: string): void {
    const abs = path.join(workspaceRoot, relPath);
    if (fs.existsSync(abs)) {
      vscode.workspace.openTextDocument(abs).then((doc) =>
        vscode.window.showTextDocument(doc, { preview: true })
      );
    }
  }

  private getHtml(): string {
    const webviewDir = vscode.Uri.joinPath(this.extensionUri, "media", "webview");
    const indexPath = path.join(webviewDir.fsPath, "index.html");

    if (!fs.existsSync(indexPath)) {
      return this.getFallbackHtml();
    }

    let html = fs.readFileSync(indexPath, "utf-8");

    // Inject webview CSP source (replaces ${cspSource} placeholder from Vite template)
    const csp = this.panel.webview.cspSource;
    html = html.replace(/\$\{cspSource\}/g, csp);

    // Rewrite relative asset paths to VS Code webview URIs
    // Matches both `./assets/foo.js` and bare `assets/foo.js`
    html = html.replace(
      /(src|href)="(\.\/[^"]+|assets\/[^"]+)"/g,
      (_, attr, filename) => {
        const clean = filename.startsWith("./") ? filename.slice(2) : filename;
        const uri = this.panel.webview.asWebviewUri(
          vscode.Uri.joinPath(webviewDir, clean)
        );
        return `${attr}="${uri}"`;
      }
    );

    return html;
  }

  private getFallbackHtml(): string {
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
body{font-family:system-ui;display:flex;align-items:center;justify-content:center;
height:100vh;margin:0;background:#0d1117;color:#8b949e;}
.msg{text-align:center}.title{color:#e6edf3;font-size:1.2rem;margin-bottom:8px}
</style></head><body><div class="msg">
<div class="title">CodeForest — Webview not built</div>
<p>Run <code>npm run build</code> at the repository root to build the UI.</p>
</div></body></html>`;
  }
}

// ─── Activation ───────────────────────────────────────────────────────────────

let backend: BackendServer;
let output: vscode.OutputChannel;
let globalStoragePath: string;

export function activate(context: vscode.ExtensionContext): void {
  globalStoragePath = context.globalStorageUri.fsPath;
  fs.mkdirSync(globalStoragePath, { recursive: true });

  output = vscode.window.createOutputChannel("CodeForest");
  backend = new BackendServer();

  const cmd = vscode.commands.registerCommand("codeforest.analyze", () => {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) {
      vscode.window.showWarningMessage(
        "CodeForest: Open a workspace folder first."
      );
      return;
    }
    CodeForestPanel.createOrShow(context.extensionUri, backend, output);
  });

  context.subscriptions.push(cmd, output);
}

export function deactivate(): void {
  backend?.stop();
  CodeForestPanel.dispose();
}
