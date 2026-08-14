export interface GraphNode {
  id: string;
  label: string;
  path: string;
  type: string;
  code?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface FileGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface AnalyzeResponse {
  top_level_graph?: FileGraph;
  file_graphs?: Record<string, FileGraph>;
  workspace_name?: string;
  error?: string;
}

export interface WorkspaceInfo {
  name: string;
  path: string;
}
