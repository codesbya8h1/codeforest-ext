import React, { useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { postMessage } from "./vscode";
import { GraphView } from "./pages/GraphView";
import type { AnalyzeResponse, WorkspaceInfo } from "./types";

type AppState =
  | { phase: "idle"; workspaces: WorkspaceInfo[] }
  | { phase: "analyzing"; workspacePath: string }
  | { phase: "graph"; data: AnalyzeResponse; workspacePath: string }
  | { phase: "error"; message: string; workspaces: WorkspaceInfo[] }
  | { phase: "noWorkspace" };

export default function App() {
  const [state, setState] = useState<AppState>({ phase: "idle", workspaces: [] });

  useEffect(() => {
    // Tell the extension host we're ready
    postMessage({ type: "ready" });

    const handler = (event: MessageEvent) => {
      const msg = event.data as { type: string } & Record<string, unknown>;
      switch (msg.type) {
        case "workspaceInfo":
          setState({ phase: "idle", workspaces: msg.workspaces as WorkspaceInfo[] });
          break;
        case "loading":
          setState((prev) => ({
            phase: "analyzing",
            workspacePath: prev.phase === "idle" ? (prev.workspaces[0]?.path ?? "") : "...",
          }));
          break;
        case "graphData":
          setState((prev) => ({
            phase: "graph",
            data: msg.data as AnalyzeResponse,
            workspacePath:
              prev.phase === "analyzing"
                ? prev.workspacePath
                : prev.phase === "graph"
                ? prev.workspacePath
                : "",
          }));
          break;
        case "error":
          setState((prev) => ({
            phase: "error",
            message: msg.message as string,
            workspaces:
              prev.phase === "idle" ? prev.workspaces :
              prev.phase === "error" ? prev.workspaces : [],
          }));
          break;
        case "noWorkspace":
          setState({ phase: "noWorkspace" });
          break;
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // ── No workspace ──────────────────────────────────────────────────────────
  if (state.phase === "noWorkspace") {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState
          icon="📂"
          title="No workspace open"
          desc="Open a folder in VS Code, then run CodeForest to visualize its code graph."
        />
      </div>
    );
  }

  // ── Idle landing ──────────────────────────────────────────────────────────
  if (state.phase === "idle" || state.phase === "error") {
    const workspaces = state.workspaces;
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 px-8">
        <Logo />
        <p
          className="text-xs font-mono text-center max-w-xs leading-relaxed"
          style={{ color: "rgba(148,163,184,0.7)" }}
        >
          Analyze your workspace and explore an interactive code-dependency graph.
        </p>

        {state.phase === "error" && (
          <div
            className="w-full max-w-md px-4 py-3 rounded-xl text-sm"
            style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              color: "#fca5a5",
            }}
          >
            <span className="font-semibold">Error: </span>
            {state.message}
          </div>
        )}

        <div className="flex flex-col gap-3 w-full max-w-md">
          {workspaces.map((ws) => (
            <button
              key={ws.path}
              onClick={() => {
                postMessage({ type: "analyze", workspacePath: ws.path });
              }}
              className="flex flex-col gap-1 px-5 py-4 rounded-2xl text-left transition-all duration-150"
              style={{
                background: "hsl(222,20%,13%)",
                border: "1px solid hsl(220,15%,22%)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "hsl(222,20%,16%)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(96,165,250,0.4)";
                (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 18px rgba(96,165,250,0.08)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "hsl(222,20%,13%)";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "hsl(220,15%,22%)";
                (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
              }}
            >
              <div className="flex items-center gap-3">
                <span style={{ fontSize: 18 }}>🗂</span>
                <span
                  className="font-semibold text-sm"
                  style={{ color: "rgba(220,230,255,0.9)" }}
                >
                  {ws.name}
                </span>
                <span
                  className="ml-auto text-xs font-mono px-2 py-0.5 rounded-lg"
                  style={{
                    background: "rgba(96,165,250,0.12)",
                    color: "rgba(96,165,250,0.8)",
                    border: "1px solid rgba(96,165,250,0.2)",
                  }}
                >
                  Analyze →
                </span>
              </div>
              <div
                className="text-[10px] font-mono truncate pl-9"
                style={{ color: "rgba(148,163,184,0.5)" }}
              >
                {ws.path}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Analyzing ─────────────────────────────────────────────────────────────
  if (state.phase === "analyzing") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Logo />
        <div className="flex items-center gap-3 mt-4">
          <Spinner />
          <span className="text-sm" style={{ color: "rgba(148,163,184,0.8)" }}>
            Analyzing workspace…
          </span>
        </div>
        <div
          className="text-[10px] font-mono mt-1"
          style={{ color: "rgba(148,163,184,0.4)" }}
        >
          {state.workspacePath}
        </div>
      </div>
    );
  }

  // ── Graph view ────────────────────────────────────────────────────────────
  return (
    <ReactFlowProvider>
      <GraphView data={state.data} workspacePath={state.workspacePath} />
    </ReactFlowProvider>
  );
}

// ─── Reusable bits ────────────────────────────────────────────────────────────

function Logo() {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="text-2xl font-bold tracking-tight"
        style={{
          background: "linear-gradient(135deg, #60a5fa, #818cf8)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        CodeForest
      </div>
      <div className="text-[10px] tracking-widest uppercase" style={{ color: "rgba(148,163,184,0.45)" }}>
        from VibeDecode
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div
      style={{
        width: 18,
        height: 18,
        border: "2px solid rgba(96,165,250,0.25)",
        borderTopColor: "rgba(96,165,250,0.9)",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }}
    />
  );
}

function EmptyState({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center px-8">
      <span style={{ fontSize: 40 }}>{icon}</span>
      <p className="text-sm font-semibold" style={{ color: "rgba(220,230,255,0.7)" }}>
        {title}
      </p>
      <p className="text-xs leading-relaxed" style={{ color: "rgba(148,163,184,0.55)" }}>
        {desc}
      </p>
    </div>
  );
}
