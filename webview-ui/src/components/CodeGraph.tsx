import React, { useCallback, useMemo, useEffect, useState, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  Handle,
  Position,
  getBezierPath,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useStore,
  useViewport,
  PanOnScrollMode,
  type NodeProps,
  type EdgeProps,
  type Node,
  type Edge,
} from "@xyflow/react";
import { NODE_WIDTH, NODE_HEIGHT } from "../lib/layout";
import "@xyflow/react/dist/style.css";
import type { FileGraph } from "../types";
import { buildLayoutedGraph, type LayoutDirection } from "../lib/layout";

interface CodeNodeData extends Record<string, unknown> {
  label: string;
  path: string;
  nodeType: string;
  isRoot?: boolean;
  isSelected?: boolean;
  seqNum?: number;
  isHovered?: boolean;
  isDimmed?: boolean;
}

interface EdgeData extends Record<string, unknown> {
  isHighlighted?: boolean;
  isDimmed?: boolean;
}

const typeColors: Record<string, string> = {
  python: "#3b82f6",
  typescript: "#8b5cf6",
  javascript: "#f59e0b",
  module: "#10b981",
  function: "#6366f1",
  class: "#ec4899",
  variable: "#14b8a6",
  import: "#94a3b8",
  file: "#64748b",
};

function CodeNode({ data, selected }: NodeProps) {
  const nodeData = data as CodeNodeData;
  const color = typeColors[nodeData.nodeType] || typeColors.file;
  const isRoot = nodeData.isRoot;
  const seqNum = nodeData.seqNum ?? 1;
  const isHovered = nodeData.isHovered;
  const isDimmed = nodeData.isDimmed;

  return (
    <div
      draggable={false}
      style={{
        cursor: "grab",
        userSelect: "none",
        opacity: isDimmed ? 0.12 : 1,
        borderColor: isHovered
          ? color + "ee"
          : selected
            ? "rgba(96,165,250,0.9)"
            : isRoot
              ? color + "99"
              : color + "44",
        boxShadow: isHovered
          ? `0 0 28px ${color}88, 0 0 0 2px ${color}cc, 0 4px 16px rgba(0,0,0,0.5)`
          : selected
            ? `0 0 16px ${color}66, 0 0 0 1.5px rgba(96,165,250,0.8)`
            : isRoot
              ? `0 0 14px ${color}44, 0 2px 8px rgba(0,0,0,0.4)`
              : `0 0 6px ${color}22, 0 2px 6px rgba(0,0,0,0.3)`,
        background: isRoot
          ? `linear-gradient(135deg, hsl(222,22%,16%), hsl(222,22%,18%))`
          : `linear-gradient(135deg, hsl(222,20%,12%), hsl(222,20%,14%))`,
        position: "relative",
        transition: "opacity 0.2s ease, box-shadow 0.15s ease, border-color 0.15s ease",
      }}
      className="px-3 py-2.5 rounded-xl border text-sm font-mono min-w-[110px] max-w-[190px]"
    >
      {/* Sequence number badge — top-right corner */}
      <div
        style={{
          position: "absolute",
          top: -8,
          right: -8,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: isRoot
            ? color
            : `hsl(222,20%,22%)`,
          border: `1.5px solid ${color}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 9,
          fontWeight: 700,
          color: isRoot ? "#fff" : color,
          boxShadow: `0 0 6px ${color}66`,
          zIndex: 10,
          letterSpacing: "-0.5px",
        }}
        title={`Execution sequence: ${seqNum}`}
      >
        {seqNum}
      </div>

      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />

      <div className="flex items-center gap-2">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{
            backgroundColor: color,
            boxShadow: `0 0 6px ${color}88`,
          }}
        />
        <span
          className="truncate text-xs font-semibold leading-tight"
          style={{ color: isRoot ? "rgba(220,230,255,0.95)" : "rgba(200,215,240,0.82)" }}
          title={nodeData.path}
        >
          {nodeData.label}
        </span>
      </div>

      {isRoot && (
        <div
          className="text-[9px] font-medium mt-1 pl-4 tracking-widest uppercase"
          style={{ color: color + "bb" }}
        >
          entry
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

function FlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps) {
  const edgeData = (data ?? {}) as EdgeData;
  const isHighlighted = edgeData.isHighlighted;
  const isDimmed = edgeData.isDimmed;

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.45,
  });

  const pathId = `vd-p-${id}`;

  const charCode = id.charCodeAt(5) || 0;
  const charCode2 = id.charCodeAt(9) || 0;
  const delay = `${((charCode * 7 + charCode2 * 3) % 28) / 10}s`;
  const dur = `${2.0 + (charCode % 12) / 10}s`;

  const trackStroke = isDimmed
    ? "rgba(96,165,250,0.03)"
    : isHighlighted
      ? "rgba(96,165,250,0.30)"
      : "rgba(96,165,250,0.12)";

  const lineStroke = isDimmed
    ? "rgba(96,165,250,0.06)"
    : isHighlighted
      ? "rgba(96,165,250,1.0)"
      : "rgba(96,165,250,0.6)";

  const lineWidth = isHighlighted ? 2.5 : 1.5;

  return (
    <g style={{ transition: "opacity 0.2s ease" }}>
      <path
        d={edgePath}
        fill="none"
        stroke={trackStroke}
        strokeWidth={isHighlighted ? 10 : 7}
        strokeLinecap="round"
      />
      <path
        id={pathId}
        d={edgePath}
        fill="none"
        stroke={lineStroke}
        strokeWidth={lineWidth}
        strokeLinecap="round"
        markerEnd={markerEnd}
      />
      {!isDimmed && (
        <circle r={2.8} fill={isHighlighted ? "#ffffff" : "#bfdbfe"}>
          <animateMotion
            dur={dur}
            begin={delay}
            repeatCount="indefinite"
            keyPoints="0;1"
            keyTimes="0;1"
            calcMode="linear"
          >
            <mpath href={`#${pathId}`} />
          </animateMotion>
          <animate
            attributeName="opacity"
            values="0;0;1;1;0"
            keyTimes="0;0.06;0.18;0.88;1"
            dur={dur}
            begin={delay}
            repeatCount="indefinite"
          />
          <animate
            attributeName="r"
            values="1.5;2.8;2.8;1.5"
            keyTimes="0;0.15;0.85;1"
            dur={dur}
            begin={delay}
            repeatCount="indefinite"
          />
        </circle>
      )}
    </g>
  );
}

interface ClusterBgData extends Record<string, unknown> {
  lang: string;
  label: string;
  color: string;
}

function ClusterBgNode({ data }: NodeProps) {
  const { label, color } = data as ClusterBgData;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        borderRadius: 20,
        border: `1.5px solid ${color}28`,
        background: `linear-gradient(145deg, ${color}0a 0%, ${color}04 60%, transparent 100%)`,
        pointerEvents: "none",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Subtle corner glow */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 120,
          height: 120,
          borderRadius: "0 0 100% 0",
          background: `radial-gradient(circle at top left, ${color}14, transparent 70%)`,
          pointerEvents: "none",
        }}
      />
      {/* Language label */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 14,
          color: color + "99",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          fontFamily: "monospace",
          pointerEvents: "none",
        }}
      >
        {label}
      </div>
    </div>
  );
}

// ─── Custom scrollbars ───────────────────────────────────────────────────────
const SB = 10; // scrollbar track thickness (px)
const SB_MIN_THUMB = 36; // minimum thumb length (px)

interface ScrollBounds {
  minX: number; maxX: number; minY: number; maxY: number;
}

function ScrollBarOverlay({ bounds }: { bounds: ScrollBounds }) {
  const { x, y, zoom } = useViewport();
  const rfW = useStore((s) => s.width);
  const rfH = useStore((s) => s.height);
  const { setViewport } = useReactFlow();

  const drag = useRef<{
    axis: "v" | "h";
    startMouse: number;
    startPan: number;
    trackRange: number;
    contentRange: number;
    otherPan: number;
  } | null>(null);

  const cW = (bounds.maxX - bounds.minX) * zoom;
  const cH = (bounds.maxY - bounds.minY) * zoom;

  const showV = cH > rfH;
  const showH = cW > rfW;

  // Vertical thumb
  const vTrack = rfH - (showH ? SB : 0);
  const vThumbH = showV ? Math.max((rfH / cH) * vTrack, SB_MIN_THUMB) : vTrack;
  const vRatio  = showV ? Math.max(0, Math.min(1, -(y + bounds.minY * zoom) / (cH - rfH))) : 0;
  const vThumbY = vRatio * (vTrack - vThumbH);

  // Horizontal thumb
  const hTrack = rfW - (showV ? SB : 0);
  const hThumbW = showH ? Math.max((rfW / cW) * hTrack, SB_MIN_THUMB) : hTrack;
  const hRatio  = showH ? Math.max(0, Math.min(1, -(x + bounds.minX * zoom) / (cW - rfW))) : 0;
  const hThumbX = hRatio * (hTrack - hThumbW);

  const startDrag = (axis: "v" | "h", e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const trackRange = axis === "v" ? vTrack - vThumbH : hTrack - hThumbW;
    const contentRange = axis === "v" ? cH - rfH : cW - rfW;
    drag.current = {
      axis,
      startMouse: axis === "v" ? e.clientY : e.clientX,
      startPan: axis === "v" ? y : x,
      trackRange,
      contentRange,
      otherPan: axis === "v" ? x : y,
    };

    const onMove = (me: MouseEvent) => {
      if (!drag.current) return;
      const { axis, startMouse, startPan, trackRange, contentRange, otherPan } = drag.current;
      const delta = (axis === "v" ? me.clientY : me.clientX) - startMouse;
      const newPan = Math.min(0, Math.max(startPan - (delta / trackRange) * contentRange, -(contentRange)));
      if (axis === "v") setViewport({ x: otherPan, y: newPan, zoom });
      else              setViewport({ x: newPan, y: otherPan, zoom });
    };
    const onUp = () => {
      drag.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const jumpV = (e: React.MouseEvent<HTMLDivElement>) => {
    const t = e.currentTarget.getBoundingClientRect();
    const r = Math.max(0, Math.min(1, (e.clientY - t.top - vThumbH / 2) / (vTrack - vThumbH)));
    setViewport({ x, y: -(r * (cH - rfH) + bounds.minY * zoom), zoom }, { duration: 120 });
  };
  const jumpH = (e: React.MouseEvent<HTMLDivElement>) => {
    const t = e.currentTarget.getBoundingClientRect();
    const r = Math.max(0, Math.min(1, (e.clientX - t.left - hThumbW / 2) / (hTrack - hThumbW)));
    setViewport({ x: -(r * (cW - rfW) + bounds.minX * zoom), y, zoom }, { duration: 120 });
  };

  const track = "rgba(12,18,32,0.72)";
  const thumb = "rgba(96,165,250,0.45)";
  const thumbHover = "rgba(96,165,250,0.65)";

  return (
    <>
      {showV && (
        <div
          onClick={jumpV}
          style={{ position: "absolute", right: 0, top: 0, width: SB, height: vTrack,
            background: track, zIndex: 200, cursor: "pointer", borderRadius: "0 0 0 4px" }}
        >
          <div
            onMouseDown={(e) => startDrag("v", e)}
            onClick={(e) => e.stopPropagation()}
            style={{ position: "absolute", right: 1, top: vThumbY, width: SB - 2, height: vThumbH,
              borderRadius: 4, background: thumb, cursor: "grab",
              transition: "background 0.15s" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = thumbHover; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = thumb; }}
          />
        </div>
      )}
      {showH && (
        <div
          onClick={jumpH}
          style={{ position: "absolute", bottom: 0, left: 0, width: hTrack, height: SB,
            background: track, zIndex: 200, cursor: "pointer", borderRadius: "4px 0 0 0" }}
        >
          <div
            onMouseDown={(e) => startDrag("h", e)}
            onClick={(e) => e.stopPropagation()}
            style={{ position: "absolute", bottom: 1, left: hThumbX, width: hThumbW, height: SB - 2,
              borderRadius: 4, background: thumb, cursor: "grab",
              transition: "background 0.15s" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = thumbHover; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = thumb; }}
          />
        </div>
      )}
      {showV && showH && (
        <div style={{ position: "absolute", right: 0, bottom: 0, width: SB, height: SB,
          background: track, zIndex: 201 }} />
      )}
    </>
  );
}

const nodeTypes = { codeNode: CodeNode, clusterBg: ClusterBgNode };
const edgeTypes = { flowEdge: FlowEdge };

interface CodeGraphProps {
  graph: FileGraph;
  direction: LayoutDirection;
  onNodeClick?: (nodeId: string, label: string) => void;
  selectedNodeId?: string;
}

export function CodeGraph({
  graph,
  direction,
  onNodeClick,
  selectedNodeId,
}: CodeGraphProps) {
  const { setViewport } = useReactFlow();
  const rfWidth = useStore((s) => s.width);
  const rfHeight = useStore((s) => s.height);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Raw content bounding box from the most recent layout run.
  const [contentBounds, setContentBounds] = useState<{
    minX: number; maxX: number; minY: number; maxY: number;
  } | null>(null);

  // Effect 1: re-run dagre layout whenever the graph or direction changes.
  useEffect(() => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = buildLayoutedGraph(
      graph.nodes,
      graph.edges,
      direction
    );
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);

    if (layoutedNodes.length === 0) { setContentBounds(null); return; }

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (const n of layoutedNodes) {
      minX = Math.min(minX, n.position.x);
      maxX = Math.max(maxX, n.position.x + NODE_WIDTH);
      minY = Math.min(minY, n.position.y);
      maxY = Math.max(maxY, n.position.y + NODE_HEIGHT);
    }
    setContentBounds({ minX, maxX, minY, maxY });
  }, [graph, direction, setNodes, setEdges]);

  // Effect 2: set the initial viewport whenever the layout or container changes.
  //
  // Strategy: start zoomed in at a comfortable reading level (MIN_ZOOM) with
  // entry-point nodes near the top of the screen. If the graph is small enough
  // to fit entirely at MIN_ZOOM we use that natural fit instead. Users scroll
  // (via the custom scrollbars or mouse drag) to explore the rest.
  //
  // ReactFlow coordinate relationship:  screenX = flowX * zoom + panX
  useEffect(() => {
    if (!contentBounds || rfWidth === 0 || rfHeight === 0) return;

    const { minX, maxX, minY, maxY } = contentBounds;
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const PAD = 0.10;
    const MIN_ZOOM = 0.72; // comfortable reading threshold

    // Natural fit zoom (shows entire graph)
    const naturalZoom = Math.min(
      (rfWidth  * (1 - 2 * PAD)) / contentW,
      (rfHeight * (1 - 2 * PAD)) / contentH,
      2.0
    );
    // Use at least MIN_ZOOM so nodes are always readable
    const zoom = Math.max(naturalZoom, MIN_ZOOM);

    // Horizontal: root centroid is at flow x=0 → screen horizontal center
    const panX = rfWidth / 2;

    // Vertical: show entry-point row near the top (8% padding from top edge)
    const panY = rfHeight * 0.08 - minY * zoom;

    setViewport({ x: panX, y: panY, zoom }, { duration: 500 });
  }, [contentBounds, rfWidth, rfHeight, setViewport]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type === "clusterBg") return;
      const nodeData = node.data as CodeNodeData;
      onNodeClick?.(node.id, nodeData.label);
    },
    [onNodeClick]
  );

  const handleNodeMouseEnter = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === "clusterBg") return;
    setHoveredNodeId(node.id);
  }, []);

  const handleNodeMouseLeave = useCallback(() => {
    setHoveredNodeId(null);
  }, []);

  // Sets of node/edge IDs directly connected to the hovered node.
  const connectedNodeIds = useMemo(() => {
    if (!hoveredNodeId) return null;
    const ids = new Set<string>([hoveredNodeId]);
    for (const e of edges) {
      if (e.source === hoveredNodeId) ids.add(e.target);
      if (e.target === hoveredNodeId) ids.add(e.source);
    }
    return ids;
  }, [hoveredNodeId, edges]);

  const connectedEdgeIds = useMemo(() => {
    if (!hoveredNodeId) return null;
    return new Set(
      edges
        .filter((e) => e.source === hoveredNodeId || e.target === hoveredNodeId)
        .map((e) => e.id)
    );
  }, [hoveredNodeId, edges]);

  const styledNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          isSelected: n.id === selectedNodeId,
          isHovered: hoveredNodeId ? n.id === hoveredNodeId : false,
          isDimmed:
            hoveredNodeId && n.type !== "clusterBg"
              ? !connectedNodeIds?.has(n.id)
              : false,
        },
        selected: n.id === selectedNodeId,
      })),
    [nodes, selectedNodeId, hoveredNodeId, connectedNodeIds]
  );

  const styledEdges = useMemo(
    () =>
      edges.map((e) => ({
        ...e,
        data: {
          ...(e.data ?? {}),
          isHighlighted: hoveredNodeId ? connectedEdgeIds?.has(e.id) : false,
          isDimmed: hoveredNodeId ? !connectedEdgeIds?.has(e.id) : false,
        },
      })),
    [edges, hoveredNodeId, connectedEdgeIds]
  );

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <ReactFlow
        nodes={styledNodes}
        edges={styledEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        minZoom={0.05}
        maxZoom={3}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnDrag={true}
        panOnScroll={true}
        panOnScrollMode={PanOnScrollMode.Free}
        zoomOnScroll={false}
        zoomOnPinch={true}
        selectNodesOnDrag={false}
        nodeDragThreshold={2}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="hsl(220, 14%, 20%)"
        />
        <Controls
          style={{
            background: "hsl(222, 20%, 14%)",
            border: "1px solid hsl(220, 15%, 22%)",
            borderRadius: "10px",
          }}
        />
        <MiniMap
          nodeColor={(n) => {
            if (n.type === "clusterBg") return "transparent";
            const nd = n.data as CodeNodeData;
            return typeColors[nd.nodeType] || typeColors.file;
          }}
          maskColor="rgba(10,14,26,0.75)"
          style={{
            background: "hsl(222, 20%, 11%)",
            border: "1px solid hsl(220, 15%, 20%)",
            borderRadius: "10px",
          }}
        />
      </ReactFlow>

      {/* Custom scrollbars — positioned over the ReactFlow container */}
      {contentBounds && <ScrollBarOverlay bounds={contentBounds} />}
    </div>
  );
}
