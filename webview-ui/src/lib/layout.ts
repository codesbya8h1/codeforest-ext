import dagre from "@dagrejs/dagre";
import { MarkerType } from "@xyflow/react";
import type { Node, Edge } from "@xyflow/react";
import type { GraphNode, GraphEdge } from "../types";

export type LayoutDirection = "TB" | "LR";

export const NODE_WIDTH = 176;
export const NODE_HEIGHT = 52;

// ─── Cluster visual constants ────────────────────────────────────────────────
const CLUSTER_GAP     = 240;  // horizontal gap between language clusters
const CLUSTER_PAD_X   = 72;   // padding left/right inside each cluster
const CLUSTER_PAD_Y   = 60;   // padding top/bottom inside each cluster
const CLUSTER_LABEL_H = 40;   // height reserved at top for the language label

export const LANG_CONFIG: Record<string, { label: string; color: string }> = {
  python:     { label: "Python",     color: "#3b82f6" },
  typescript: { label: "TypeScript", color: "#8b5cf6" },
  javascript: { label: "JavaScript", color: "#f59e0b" },
};
export function langConfig(type: string) {
  return LANG_CONFIG[type] ?? { label: type || "Other", color: "#64748b" };
}

// Language ordering for consistent left-to-right display
const LANG_ORDER = ["python", "typescript", "javascript"];

// ─── Sequence numbers (longest-path depth from roots) ────────────────────────
function computeSequenceNumbers(
  nodeIds: string[],
  edges: GraphEdge[]
): Map<string, number> {
  const adj = new Map<string, string[]>();
  const inDeg = new Map<string, number>();
  for (const id of nodeIds) { adj.set(id, []); inDeg.set(id, 0); }
  for (const e of edges) {
    if (adj.has(e.source) && adj.has(e.target)) {
      adj.get(e.source)!.push(e.target);
      inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
    }
  }
  // Kahn's topological sort
  const topoOrder: string[] = [];
  const inDegCopy = new Map(inDeg);
  const q: string[] = [];
  for (const [id, deg] of inDegCopy) if (deg === 0) q.push(id);
  while (q.length > 0) {
    const id = q.shift()!;
    topoOrder.push(id);
    for (const nb of adj.get(id) ?? []) {
      const d = (inDegCopy.get(nb) ?? 1) - 1;
      inDegCopy.set(nb, d);
      if (d === 0) q.push(nb);
    }
  }
  // Longest-path DP
  const dist = new Map<string, number>();
  for (const id of nodeIds) dist.set(id, 1);
  for (const id of topoOrder) {
    const d = dist.get(id)!;
    for (const nb of adj.get(id) ?? []) {
      if (d + 1 > (dist.get(nb) ?? 1)) dist.set(nb, d + 1);
    }
  }
  return dist;
}

// ─── Run dagre on a node/edge subset ─────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function runDagre(nodes: GraphNode[], edges: GraphEdge[], direction: LayoutDirection): any {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: 72,
    ranksep: 120,
    marginx: 40,
    marginy: 40,
    ranker: "network-simplex",
  });
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return g;
}

// ─── Build positioned ReactFlow nodes from a dagre result ────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dagreToNodes(
  graphNodes: GraphNode[],
  g: any,
  intraEdges: GraphEdge[],
  seqNums: Map<string, number>
): Node[] {
  const hasIncoming = new Set(intraEdges.map((e) => e.target));
  const rootIds = new Set(
    graphNodes.filter((n) => !hasIncoming.has(n.id)).map((n) => n.id)
  );
  return graphNodes.map((node) => {
    const dn = g.node(node.id);
    return {
      id: node.id,
      type: "codeNode",
      position: {
        x: dn.x - NODE_WIDTH / 2,
        y: dn.y - NODE_HEIGHT / 2,
      },
      data: {
        label: node.label,
        path: node.path,
        nodeType: node.type,
        isRoot: rootIds.has(node.id),
        seqNum: seqNums.get(node.id) ?? 1,
      },
    };
  });
}

// ─── Center a set of nodes so their bounding centroid is at (0,0) ─────────────
function centerNodes(nodes: Node[]): Node[] {
  if (nodes.length === 0) return nodes;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.position.x);
    maxX = Math.max(maxX, n.position.x + NODE_WIDTH);
    minY = Math.min(minY, n.position.y);
    maxY = Math.max(maxY, n.position.y + NODE_HEIGHT);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return nodes.map((n) => ({
    ...n,
    position: { x: n.position.x - cx, y: n.position.y - cy },
  }));
}

// ─── Connected-component finder (undirected BFS) ─────────────────────────────
function findConnectedComponents(
  graphNodes: GraphNode[],
  graphEdges: GraphEdge[]
): GraphNode[][] {
  const adj = new Map<string, Set<string>>();
  for (const n of graphNodes) adj.set(n.id, new Set());
  for (const e of graphEdges) {
    adj.get(e.source)?.add(e.target);
    adj.get(e.target)?.add(e.source);
  }
  const nodeById = new Map(graphNodes.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const components: GraphNode[][] = [];

  for (const node of graphNodes) {
    if (visited.has(node.id)) continue;
    const component: GraphNode[] = [];
    const q = [node.id];
    visited.add(node.id);
    while (q.length) {
      const id = q.shift()!;
      component.push(nodeById.get(id)!);
      for (const nb of adj.get(id) ?? []) {
        if (!visited.has(nb)) { visited.add(nb); q.push(nb); }
      }
    }
    components.push(component);
  }
  return components;
}

// ─── Single-language layout ───────────────────────────────────────────────────
// Strategy:
//   1. Split graph into connected components (undirected BFS).
//   2. Lay out each multi-node component independently with dagre.
//   3. Tile components in rows (largest first, wrap at a target width).
//   4. Pack isolated singleton nodes in a compact grid below.
//   5. Center the whole result around (0, 0).
function buildSingleLayout(
  graphNodes: GraphNode[],
  graphEdges: GraphEdge[],
  direction: LayoutDirection,
  seqNums: Map<string, number>
): { nodes: Node[]; edges: Edge[] } {
  if (graphNodes.length === 0) return { nodes: [], edges: buildEdges(graphEdges) };

  const COMP_GAP_X = 80;   // horizontal gap between tiled components
  const COMP_GAP_Y = 80;   // vertical gap between component rows
  const ISO_CELL_W = NODE_WIDTH + 36;
  const ISO_CELL_H = NODE_HEIGHT + 24;
  const ISO_GAP_Y  = 64;   // gap above the isolated-node grid

  // ── 1. Find components, sort largest first ──
  const components = findConnectedComponents(graphNodes, graphEdges)
    .sort((a, b) => b.length - a.length);

  const multiComps = components.filter((c) => c.length > 1);
  const singletons  = components.filter((c) => c.length === 1).map((c) => c[0]);

  // ── 2. Layout each multi-node component with dagre ──
  interface LayoutedComp { nodes: Node[]; w: number; h: number }
  const layoutedComps: LayoutedComp[] = multiComps.map((comp) => {
    const ids      = new Set(comp.map((n) => n.id));
    const compEdges = graphEdges.filter((e) => ids.has(e.source) && ids.has(e.target));
    const g        = runDagre(comp, compEdges, direction);
    const positioned = dagreToNodes(comp, g, compEdges, seqNums);

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of positioned) {
      minX = Math.min(minX, n.position.x);
      maxX = Math.max(maxX, n.position.x + NODE_WIDTH);
      minY = Math.min(minY, n.position.y);
      maxY = Math.max(maxY, n.position.y + NODE_HEIGHT);
    }
    // Normalize so top-left is (0, 0)
    const normalized = positioned.map((n) => ({
      ...n,
      position: { x: n.position.x - minX, y: n.position.y - minY },
    }));
    return { nodes: normalized, w: maxX - minX, h: maxY - minY };
  });

  // ── 3. Tile components in rows ──
  // Target row width: width of the largest component (min 900 px)
  const maxCompW   = layoutedComps.reduce((m, c) => Math.max(m, c.w), 900);
  const targetRowW = maxCompW;

  const allPositioned: Node[] = [];
  let rowX = 0, rowY = 0, rowH = 0;

  for (const comp of layoutedComps) {
    if (rowX > 0 && rowX + comp.w > targetRowW) {
      rowY += rowH + COMP_GAP_Y;
      rowX = 0;
      rowH = 0;
    }
    comp.nodes.forEach((n) =>
      allPositioned.push({ ...n, position: { x: n.position.x + rowX, y: n.position.y + rowY } })
    );
    rowH  = Math.max(rowH, comp.h);
    rowX += comp.w + COMP_GAP_X;
  }

  if (layoutedComps.length > 0) rowY += rowH;

  // ── 4. Pack singletons in a compact grid ──
  if (singletons.length > 0) {
    const gridY = rowY + (layoutedComps.length > 0 ? ISO_GAP_Y : 0);
    // Choose columns to keep the grid roughly 2:1 aspect
    const cols = Math.min(Math.ceil(Math.sqrt(singletons.length * 2.5)), 8);

    singletons.forEach((node, i) => {
      allPositioned.push({
        id: node.id,
        type: "codeNode",
        position: {
          x: (i % cols) * ISO_CELL_W,
          y: gridY + Math.floor(i / cols) * ISO_CELL_H,
        },
        data: {
          label:    node.label,
          path:     node.path,
          nodeType: node.type,
          isRoot:   true,
          seqNum:   seqNums.get(node.id) ?? 1,
        },
      });
    });
  }

  // ── 5. Center the whole layout ──
  const nodes = centerNodes(allPositioned);
  const edges = buildEdges(graphEdges);
  return { nodes, edges };
}

// ─── Multi-language cluster layout ───────────────────────────────────────────
function buildClusteredLayout(
  graphNodes: GraphNode[],
  graphEdges: GraphEdge[],
  direction: LayoutDirection,
  seqNums: Map<string, number>,
  groupMap: Map<string, GraphNode[]>
): { nodes: Node[]; edges: Edge[] } {
  // Sort groups in a consistent order
  const sortedGroups = [...groupMap.entries()].sort(([a], [b]) => {
    const ai = LANG_ORDER.indexOf(a);
    const bi = LANG_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const allCodeNodes: Node[] = [];
  const clusterBgNodes: Node[] = [];
  let xOffset = 0; // running x position for TB, stacked left-to-right

  for (const [lang, groupNodes] of sortedGroups) {
    const groupIds = new Set(groupNodes.map((n) => n.id));
    // Only intra-group edges influence this cluster's layout
    const intraEdges = graphEdges.filter(
      (e) => groupIds.has(e.source) && groupIds.has(e.target)
    );

    const g = runDagre(groupNodes, intraEdges, direction);
    const positioned = dagreToNodes(groupNodes, g, intraEdges, seqNums);

    // Bounding box of raw dagre output
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of positioned) {
      minX = Math.min(minX, n.position.x);
      maxX = Math.max(maxX, n.position.x + NODE_WIDTH);
      minY = Math.min(minY, n.position.y);
      maxY = Math.max(maxY, n.position.y + NODE_HEIGHT);
    }

    const clusterContentW = maxX - minX;
    const clusterContentH = maxY - minY;

    // Shift nodes so the cluster starts at xOffset with padding
    const shiftX = xOffset + CLUSTER_PAD_X - minX;
    const shiftY = CLUSTER_LABEL_H + CLUSTER_PAD_Y - minY;

    const shifted = positioned.map((n) => ({
      ...n,
      position: {
        x: n.position.x + shiftX,
        y: n.position.y + shiftY,
      },
    }));
    allCodeNodes.push(...shifted);

    // Cluster background panel
    const cfg = langConfig(lang);
    const bgW = clusterContentW + CLUSTER_PAD_X * 2;
    const bgH = clusterContentH + CLUSTER_PAD_Y * 2 + CLUSTER_LABEL_H;
    clusterBgNodes.push({
      id: `__cluster_${lang}`,
      type: "clusterBg",
      position: { x: xOffset, y: 0 },
      // @xyflow/react accepts plain style objects compatible with CSSProperties
      style: { width: bgW, height: bgH, pointerEvents: "none" } as Node["style"],
      data: { lang, label: cfg.label, color: cfg.color },
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: -1,
    });

    xOffset += bgW + CLUSTER_GAP;
  }

  // Center the combined layout around (0, 0).
  // The cluster bg panels span [0 .. xOffset - CLUSTER_GAP] × [0 .. maxBgH].
  // We already know the outer bounding box: x in [0, xOffset-CLUSTER_GAP],
  // y in [0, tallest cluster bg].  Compute from allCodeNodes for accuracy.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of allCodeNodes) {
    minX = Math.min(minX, n.position.x);
    maxX = Math.max(maxX, n.position.x + NODE_WIDTH);
    minY = Math.min(minY, n.position.y);
    maxY = Math.max(maxY, n.position.y + NODE_HEIGHT);
  }
  for (const n of clusterBgNodes) {
    // Cluster bg top-left is at n.position; bottom-right requires its stored size.
    // We add CLUSTER_PAD_Y * 2 + CLUSTER_LABEL_H to the node content bounding box,
    // and we know n.position.x/y so use the cluster end from xOffset.
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    // maxX / maxY are already covered by code nodes + padding
  }
  // Use the rightmost xOffset (before last gap) as maxX
  maxX = Math.max(maxX, xOffset - CLUSTER_GAP);
  const shiftX = -(minX + maxX) / 2;
  const shiftY = -(minY + maxY) / 2;

  const shiftNode = (n: Node): Node => ({
    ...n,
    position: { x: n.position.x + shiftX, y: n.position.y + shiftY },
  });

  // Cluster bg nodes go first so they render behind code nodes
  const nodes = [
    ...clusterBgNodes.map(shiftNode),
    ...allCodeNodes.map(shiftNode),
  ];
  const edges = buildEdges(graphEdges);
  return { nodes, edges };
}

// ─── Shared edge builder ──────────────────────────────────────────────────────
function buildEdges(graphEdges: GraphEdge[]): Edge[] {
  return graphEdges.map((edge, i) => ({
    id: `edge-${edge.source}-${edge.target}-${i}`,
    source: edge.source,
    target: edge.target,
    type: "flowEdge",
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "rgba(96,165,250,0.75)",
      width: 10,
      height: 10,
    },
  }));
}

// ─── Public API ───────────────────────────────────────────────────────────────
export function buildLayoutedGraph(
  graphNodes: GraphNode[],
  graphEdges: GraphEdge[],
  direction: LayoutDirection = "TB"
): { nodes: Node[]; edges: Edge[] } {
  if (graphNodes.length === 0) return { nodes: [], edges: [] };

  // Global sequence numbers (all edges, so cross-language ordering is correct)
  const seqNums = computeSequenceNumbers(
    graphNodes.map((n) => n.id),
    graphEdges
  );

  // Group by language type
  const groupMap = new Map<string, GraphNode[]>();
  for (const node of graphNodes) {
    const key = node.type || "other";
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(node);
  }

  if (groupMap.size <= 1) {
    return buildSingleLayout(graphNodes, graphEdges, direction, seqNums);
  }
  return buildClusteredLayout(graphNodes, graphEdges, direction, seqNums, groupMap);
}
