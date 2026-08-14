import React, { useState, useCallback, useMemo } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { CodeGraph } from "../components/CodeGraph";
import { CodeModal } from "../components/CodeModal";
import { postMessage } from "../vscode";
import type { AnalyzeResponse, FileGraph, GraphNode, GraphEdge } from "../types";
import type { LayoutDirection } from "../lib/layout";
import { LANG_CONFIG } from "../lib/layout";

interface GraphViewProps {
  data: AnalyzeResponse;
  workspacePath: string;
}

interface CodePopup {
  node: GraphNode;
}

function getLangMeta(lang: string) {
  return LANG_CONFIG[lang] ?? { label: lang.charAt(0).toUpperCase() + lang.slice(1), color: "#64748b" };
}

function getLangFromPath(path?: string): string {
  const ext = path?.split(".").pop()?.toLowerCase();
  if (ext === "py") return "python";
  if (ext === "ts" || ext === "tsx") return "typescript";
  if (ext === "js" || ext === "jsx") return "javascript";
  return "javascript";
}

function buildLangGroups(nodes: GraphNode[], edges: GraphEdge[]) {
  const groups = new Map<string, { nodes: GraphNode[]; edges: GraphEdge[] }>();
  for (const n of nodes) {
    const key = n.type || "other";
    if (!groups.has(key)) groups.set(key, { nodes: [], edges: [] });
    groups.get(key)!.nodes.push(n);
  }
  for (const [, group] of groups) {
    const ids = new Set(group.nodes.map((n) => n.id));
    group.edges = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  }
  const ORDER = ["python", "typescript", "javascript"];
  return new Map(
    [...groups.entries()].sort(([a], [b]) => {
      const ai = ORDER.indexOf(a);
      const bi = ORDER.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    })
  );
}

interface TabBarProps {
  langs: string[];
  active: string;
  langGroups: Map<string, { nodes: GraphNode[]; edges: GraphEdge[] }>;
  onChange: (lang: string) => void;
}

function TabBar({ langs, active, langGroups, onChange }: TabBarProps) {
  return (
    <div className="flex items-end gap-0 px-4 border-b border-[hsl(220,15%,16%)] bg-[hsl(222,20%,9%)] flex-shrink-0 overflow-x-auto">
      {langs.map((lang) => {
        const meta = getLangMeta(lang);
        const count = langGroups.get(lang)?.nodes.length ?? 0;
        const isActive = lang === active;
        return (
          <button
            key={lang}
            onClick={() => onChange(lang)}
            className={`
              group relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium
              transition-colors whitespace-nowrap select-none flex-shrink-0
              ${isActive
                ? "text-[hsl(210,20%,90%)] border-b-2 -mb-px"
                : "text-[hsl(215,15%,50%)] hover:text-[hsl(210,20%,75%)] border-b-2 border-transparent"
              }
            `}
            style={isActive ? { borderColor: meta.color } : undefined}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: meta.color, opacity: isActive ? 1 : 0.5 }}
            />
            {meta.label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-normal ${
              isActive
                ? "bg-[hsl(220,15%,20%)] text-[hsl(215,15%,65%)]"
                : "bg-[hsl(220,15%,16%)] text-[hsl(215,15%,40%)]"
            }`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function GraphView({ data, workspacePath }: GraphViewProps) {
  const [direction, setDirection] = useState<LayoutDirection>("TB");
  const [selectedFile, setSelectedFile] = useState<{
    id: string;
    label: string;
    graph: FileGraph;
  } | null>(null);
  const [codePopup, setCodePopup] = useState<CodePopup | null>(null);

  const langGroups = useMemo(() => {
    if (!data.top_level_graph) return new Map<string, { nodes: GraphNode[]; edges: GraphEdge[] }>();
    return buildLangGroups(data.top_level_graph.nodes, data.top_level_graph.edges);
  }, [data.top_level_graph]);

  const langList = useMemo(() => [...langGroups.keys()], [langGroups]);
  const showTabs = langList.length > 1;
  const [activeTab, setActiveTab] = useState<string>(() => langList[0] ?? "");

  const handleTabChange = useCallback((lang: string) => {
    setActiveTab(lang);
    setSelectedFile(null);
    setCodePopup(null);
  }, []);

  const currentGraph = useMemo((): FileGraph | undefined => {
    if (selectedFile) return selectedFile.graph;
    if (!data.top_level_graph) return undefined;
    if (!showTabs) return data.top_level_graph;
    const group = langGroups.get(activeTab);
    return group ? { nodes: group.nodes, edges: group.edges } : undefined;
  }, [selectedFile, data.top_level_graph, showTabs, langGroups, activeTab]);

  const handleTopLevelNodeClick = useCallback(
    (nodeId: string, label: string) => {
      // Try to open file in VS Code editor
      postMessage({ type: "openFile", path: nodeId, workspaceRoot: workspacePath });
      // Also drill into file graph if available
      if (!data.file_graphs) return;
      const fileGraph = data.file_graphs[nodeId];
      if (fileGraph && fileGraph.nodes.length > 0) {
        setSelectedFile({ id: nodeId, label, graph: fileGraph });
        setCodePopup(null);
      }
    },
    [data.file_graphs, workspacePath]
  );

  const handleFileNodeClick = useCallback(
    (nodeId: string) => {
      if (!selectedFile) return;
      const node = selectedFile.graph.nodes.find((n) => n.id === nodeId);
      if (node && node.code) setCodePopup({ node });
    },
    [selectedFile]
  );

  const handleBack = useCallback(() => {
    if (codePopup) { setCodePopup(null); return; }
    if (selectedFile) setSelectedFile(null);
  }, [codePopup, selectedFile]);

  if (!currentGraph) return null;

  const workspaceName = data.workspace_name ?? workspacePath.split("/").pop() ?? workspacePath;
  const fileCount = currentGraph.nodes.length;
  const edgeCount = currentGraph.edges.length;
  const methodCount = selectedFile
    ? selectedFile.graph.nodes.filter((n) => n.type === "function").length
    : 0;
  const activeLangMeta = showTabs && !selectedFile ? getLangMeta(activeTab) : null;

  return (
    <div className="h-screen flex flex-col bg-[hsl(222,20%,9%)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[hsl(220,15%,16%)] bg-[hsl(222,20%,10%)] flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {(selectedFile || codePopup) && (
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 text-xs text-[hsl(215,15%,55%)] hover:text-[hsl(210,20%,85%)] transition-colors flex-shrink-0"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 11L5 7L9 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {codePopup ? "Graph" : "Top Level"}
            </button>
          )}
          {(selectedFile || codePopup) && <span className="text-[hsl(220,15%,25%)]">/</span>}

          <span className="text-xs text-[hsl(210,20%,75%)] font-mono truncate max-w-[200px]">
            {workspaceName}
          </span>

          {selectedFile && (
            <>
              <span className="text-[hsl(220,15%,25%)]">/</span>
              <span className="text-xs text-[hsl(210,20%,75%)] font-mono truncate max-w-[200px]">
                {selectedFile.label}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {!selectedFile && (
            <div className="hidden sm:flex items-center gap-3 text-xs text-[hsl(215,15%,45%)]">
              {activeLangMeta && (
                <span className="px-2 py-0.5 rounded text-[10px] font-medium"
                  style={{ background: activeLangMeta.color + "22", color: activeLangMeta.color }}>
                  {activeLangMeta.label}
                </span>
              )}
              <span><span className="text-[hsl(210,20%,75%)] font-medium">{fileCount}</span> files</span>
              <span><span className="text-[hsl(210,20%,75%)] font-medium">{edgeCount}</span> deps</span>
            </div>
          )}
          {selectedFile && (
            <div className="hidden sm:flex items-center gap-3 text-xs text-[hsl(215,15%,45%)]">
              <span><span className="text-[hsl(210,20%,75%)] font-medium">{methodCount}</span> methods</span>
              <span className="text-[hsl(60,70%,60%)] font-medium text-[11px]">click a node to view code</span>
            </div>
          )}

          {/* Re-analyze button */}
          <button
            onClick={() => postMessage({ type: "analyze", workspacePath })}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-colors"
            style={{ background: "hsl(220,15%,18%)", border: "1px solid hsl(220,15%,24%)", color: "hsl(215,15%,65%)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(220,230,255,0.9)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "hsl(215,15%,65%)"; }}
            title="Re-analyze workspace"
          >
            ↺ Refresh
          </button>

          {/* Direction toggle */}
          <div className="flex rounded-md border border-[hsl(220,15%,20%)] overflow-hidden">
            {(["TB", "LR"] as LayoutDirection[]).map((d) => (
              <button
                key={d}
                onClick={() => setDirection(d)}
                className={`px-2.5 py-1 text-xs transition-colors ${d === "LR" ? "border-l border-[hsl(220,15%,20%)]" : ""} ${
                  direction === d
                    ? "bg-[hsl(217,91%,60%)] text-[hsl(222,84%,5%)] font-medium"
                    : "text-[hsl(215,15%,55%)] hover:text-[hsl(210,20%,75%)] hover:bg-[hsl(220,15%,15%)]"
                }`}
              >
                {d === "TB" ? "↓ TD" : "→ LR"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {showTabs && !selectedFile && (
        <TabBar langs={langList} active={activeTab} langGroups={langGroups} onChange={handleTabChange} />
      )}

      {!selectedFile && data.file_graphs && (
        <div className="px-4 py-1.5 bg-[hsl(217,50%,15%,0.4)] border-b border-[hsl(217,50%,20%,0.4)]">
          <p className="text-[10px] text-[hsl(217,70%,65%)]">
            Click any file node to drill in and explore its methods — also opens the file in the editor
          </p>
        </div>
      )}

      <div className="flex-1 min-h-0">
        <ReactFlowProvider>
          <CodeGraph
            key={selectedFile ? selectedFile.id + direction : (showTabs ? activeTab : "top") + "-" + direction}
            graph={currentGraph}
            direction={direction}
            onNodeClick={selectedFile ? (nodeId) => handleFileNodeClick(nodeId) : handleTopLevelNodeClick}
          />
        </ReactFlowProvider>
      </div>

      {codePopup && (
        <CodeModal
          name={codePopup.node.label}
          nodeType={codePopup.node.type}
          code={codePopup.node.code ?? "// No source available"}
          language={getLangFromPath(codePopup.node.path)}
          onClose={() => setCodePopup(null)}
        />
      )}
    </div>
  );
}
