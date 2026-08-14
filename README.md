# CodeForest — VS Code Extension

**CodeForest** is a plugin from [VibeDecode](https://vibe-decode.com) for interactive, animated code-dependency graph visualization inside VS Code and Cursor.

One click — your entire workspace rendered as a live, explorable graph.

---

## What It Does

- **Top-level graph** — every source file as a node, import/require relationships as animated edges
- **Drill-down** — click any file node to see its functions, classes, and methods laid out in their own graph
- **Code preview** — click a method/function node to read its source code in a floating panel
- **Language tabs** — Python, TypeScript, and JavaScript analyzed separately with color-coded clusters
- **Layout modes** — toggle between top-down and left-to-right flow layouts
- **Minimap + scrollbars** — navigate large codebases without getting lost

---

## Requirements

| Requirement | Notes |
|---|---|
| **VS Code** `^1.85` | Also works in Cursor (VS Code-compatible) |
| **Python 3.9+** | Must be on your `PATH` as `python3` or `python` |
| **pip packages** | Installed automatically on first run |

---

## Installing in VS Code

Search **CodeForest** in the Extensions panel (`Ctrl+Shift+X`) and click Install — or visit the [Marketplace page](https://marketplace.visualstudio.com/items?itemName=vibedecode.codeforest) and click the Install button there.

---

## Installing in Cursor

Cursor does not yet list VS Code Marketplace extensions in its own extension search. Install manually using the terminal:

**Step 1 — Make sure the `cursor` CLI is available**

Open the Command Palette inside Cursor (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run:

> **Shell Command: Install 'cursor' command in PATH**

Or link it manually (macOS):
```bash
ln -sf "/Applications/Cursor.app/Contents/Resources/app/bin/cursor" ~/.local/bin/cursor
```

**Step 2 — Download and install the extension**

```bash
curl -sL "https://marketplace.visualstudio.com/_apis/public/gallery/publishers/vibedecode/vsextensions/codeforest/latest/vspackage" \
  -o /tmp/codeforest.vsix.gz
gunzip -f /tmp/codeforest.vsix.gz
mv /tmp/codeforest.vsix /tmp/codeforest-latest.vsix
cursor --install-extension /tmp/codeforest-latest.vsix
```

**Step 3 — Reload Cursor** when prompted, then open a project folder and press `Cmd+Shift+G`.

---

## Usage

1. **Open a folder** in VS Code or Cursor (`File → Open Folder`)
2. **Run the command**:
   - Press `Ctrl+Shift+G` (Windows/Linux) or `Cmd+Shift+G` (Mac)
   - Or open the Command Palette (`Ctrl+Shift+P`) → type **CodeForest: Visualize Workspace**
3. A panel opens — click your workspace to start analysis
4. Explore your graph:
   - **Pan** — click and drag, or scroll
   - **Zoom** — Ctrl/Cmd + scroll, or use the +/− controls
   - **Click a file node** → drill into its methods and opens the file in the editor
   - **Click a method node** → view its source code
   - **Tab bar** → switch between Python / TypeScript / JavaScript views
   - **TD / LR buttons** → toggle layout direction
   - **Refresh** → re-analyze after you make code changes

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  VS Code / Cursor                               │
│                                                 │
│  ┌───────────────────┐    postMessage()         │
│  │  Webview Panel    │◄────────────────────────►│
│  │  (React + Vite)   │                          │
│  └───────────────────┘                          │
│            │                                    │
│            │ extension host (Node.js)            │
│            │                                    │
│  ┌─────────▼─────────┐    HTTP (localhost)      │
│  │  extension.ts     │◄────────────────────────►│
│  │  (subprocess mgr) │                          │
│  └─────────┬─────────┘                          │
│            │ child_process.spawn()               │
│            │                                    │
│  ┌─────────▼─────────┐                          │
│  │  backend/main.py  │  reads local files       │
│  │  (FastAPI server) │──────────────────────►   │
│  └───────────────────┘                          │
└─────────────────────────────────────────────────┘
```

All analysis runs **entirely on-device**. No source code is uploaded anywhere.

---

## Supported Languages

> **Current support:** CodeForest analyzes **Python, TypeScript, and JavaScript only.** Files in any other language are skipped during analysis. Support for additional languages (Go, Rust, Java, C/C++, Ruby, etc.) is planned for future releases.

| Language | File types | Graph features |
|---|---|---|
| Python | `.py` | Imports, functions, classes, methods, call edges |
| TypeScript | `.ts`, `.tsx` | Imports, functions, classes, methods, arrow fns |
| JavaScript | `.js`, `.jsx` | Imports, functions, classes, methods, arrow fns |

Path aliases from `tsconfig.json` (`@/*`, `~/`) are resolved automatically.

Files in `node_modules/`, `dist/`, `build/`, `.git/`, and other common output directories are automatically excluded.

---

## Limitations

- Very large codebases (10,000+ files) may take a few seconds to analyze
- Minified or transpiled files in `dist/` / `build/` are ignored by default
- Dynamic `require()` with variable paths cannot be statically resolved

---

## About

CodeForest is part of the [VibeDecode](https://vibe-decode.com) suite — AI-powered code architecture visualization for developers.

**License:** MIT
