import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { motion as Motion, AnimatePresence } from "motion/react";
import ThinkNode from "./ThinkNode";
import ConnectionLine, { ConnectionGradients } from "./ConnectionLine";
import FinalOutput from "./FinalOutput";
import {
  interpretSeed,
  generateIdeaNodes,
  clusterIntoDirections,
  generateSynthesis
} from "../services/gemini";
import { buildWebSvg, downloadWebImage } from "../utils/webExport";
import {
  ZapIcon, SparklesIcon, PlusIcon, MinusIcon, CrosshairIcon, MaximizeIcon,
  RefreshIcon, LayersIcon, TrashIcon, TargetIcon, ArrowRightIcon,
  MouseIcon, CloseIcon, DownloadIcon
} from "./Icons";
import "./BrainCanvas.css";

// Stage constants
const STAGES = {
  INPUT: 0,
  SEED: 1,
  EXPAND: 2,
  STRUCTURE: 3,
  SYNTHESIZE: 4
};

const STAGE_LABELS = ["Input", "Seed", "Expand", "Structure", "Synthesize"];

const EXAMPLES = [
  "AI in healthcare",
  "Launch a side project",
  "Improve team productivity",
  "Sustainable packaging"
];

// Type colors for idea nodes (Aurora Light palette)
const TYPE_COLORS = {
  problem: "#f4a8a0",
  method: "#a6c8f0",
  application: "#9bdcc4",
  assumption: "#f6d58c",
  opportunity: "#efb0d2"
};

const TYPE_LEGEND = [
  { type: "problem", label: "Problem" },
  { type: "method", label: "Method" },
  { type: "application", label: "Application" },
  { type: "assumption", label: "Assumption" },
  { type: "opportunity", label: "Opportunity" }
];

// Layout + zoom constants
const HEADER_HEIGHT = 70;
const COL_W = 440;       // horizontal distance per depth level
const LEAF_GAP = 48;     // vertical gap between stacked leaf cards
const ROUND_GAP = 300;   // vertical gap between successive rounds
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 2.4;
const ZOOM_STEP = 1.15;
const MAX_CLUSTER_NODES = 40; // cap nodes sent to clustering/synthesis
const SESSION_STORAGE_KEY = "thinkstorm.session.v2";
const clampZoom = (value) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));

// ---- Pure tree helpers ----
function buildChildrenMap(nodes) {
  const map = new Map();
  nodes.forEach((n) => {
    const key = n.parentId ?? "__root__";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(n);
  });
  return map;
}

function getPathContents(nodes, id) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = [];
  let cur = byId.get(id);
  let guard = 0;
  while (cur && guard++ < 500) {
    out.push(cur.content);
    cur = cur.parentId ? byId.get(cur.parentId) : null;
  }
  return out.reverse();
}

function getPathIds(nodes, id) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ids = [];
  let cur = byId.get(id);
  let guard = 0;
  while (cur && guard++ < 500) {
    ids.push(cur.id);
    cur = cur.parentId ? byId.get(cur.parentId) : null;
  }
  return ids;
}

function getDescendantIds(nodes, id) {
  const childrenMap = buildChildrenMap(nodes);
  const result = new Set();
  const stack = [...(childrenMap.get(id) || [])];
  while (stack.length) {
    const n = stack.pop();
    if (result.has(n.id)) continue;
    result.add(n.id);
    (childrenMap.get(n.id) || []).forEach((c) => stack.push(c));
  }
  return result;
}

// Estimate a card's rendered height so the layout reserves enough vertical room.
function estimateNodeHeight(node) {
  const isRoot = !!node.isRoot;
  const charsPerLine = isRoot ? 20 : 32;
  const length = String(node.content || "").length;
  const lines = Math.min(7, Math.max(1, Math.ceil(length / charsPerLine)));
  const labelH = isRoot ? 0 : 22;
  return labelH + lines * 20 + 32; // text + vertical padding
}

// Tidy, height-aware left-to-right forest layout. Each leaf reserves space for its
// own card height (so tall cards never overlap); parents centre on their children.
// Each round is its own tree, stacked vertically with a gap.
function computeForestLayout(nodes) {
  const pos = new Map();
  if (!nodes.length) return pos;

  const childrenMap = buildChildrenMap(nodes);
  const roots = nodes
    .filter((n) => n.isRoot || n.parentId == null)
    .sort((a, b) => (a.round || 1) - (b.round || 1));

  let bandTop = 0;
  roots.forEach((root) => {
    let cursorY = bandTop;
    let maxY = bandTop;
    const walk = (node, depth) => {
      const kids = childrenMap.get(node.id) || [];
      let y;
      if (!kids.length) {
        const h = estimateNodeHeight(node);
        y = cursorY + h / 2;
        cursorY += h + LEAF_GAP;
        maxY = Math.max(maxY, y + h / 2);
      } else {
        const ys = kids.map((k) => walk(k, depth + 1));
        y = (ys[0] + ys[ys.length - 1]) / 2;
        maxY = Math.max(maxY, y);
      }
      pos.set(node.id, { x: depth * COL_W, y, round: node.round || 1 });
      return y;
    };
    walk(root, 0);
    bandTop = maxY + ROUND_GAP;
  });

  return pos;
}

const slugify = (value) =>
  String(value || "web").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "web";

const getHighestNodeCounter = (nodes) => {
  if (!Array.isArray(nodes)) return 0;
  return nodes.reduce((max, node) => {
    const match = typeof node?.id === "string" ? node.id.match(/_(\d+)$/) : null;
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
};

const getHighestRound = (nodes) => {
  if (!Array.isArray(nodes)) return 1;
  return nodes.reduce((max, n) => Math.max(max, n?.round || 1), 1);
};

const readSavedSession = () => {
  try {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return parsed?.currentStage > STAGES.INPUT && Array.isArray(parsed?.allNodes) && parsed.allNodes.length
      ? parsed
      : null;
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
};

export default function BrainCanvas() {
  // Core state
  const [currentStage, setCurrentStage] = useState(STAGES.INPUT);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const [seedData, setSeedData] = useState(null);

  // Web state
  const [allNodes, setAllNodes] = useState([]);
  const [activeNodeId, setActiveNodeId] = useState(null);
  const [thinkingChain, setThinkingChain] = useState([]);
  const [currentRound, setCurrentRound] = useState(1);

  // Camera state
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanningCanvas, setIsPanningCanvas] = useState(false);
  // true only for programmatic camera moves (expand/recenter/fit/zoom buttons) so
  // they glide smoothly; drag + wheel keep it false for instant 1:1 tracking.
  const [animateView, setAnimateView] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);
  const [savedSession, setSavedSession] = useState(readSavedSession);

  const canvasRef = useRef(null);
  const nodeIdCounter = useRef(0);
  const viewRef = useRef({ zoom: 1, offset: { x: 0, y: 0 } });
  const dragPanStateRef = useRef({ isActive: false, pointerId: null, lastX: 0, lastY: 0 });

  // Structure & Synthesis
  const [directions, setDirections] = useState([]);
  const [synthesis, setSynthesis] = useState(null);
  const [showFinalOutput, setShowFinalOutput] = useState(false);

  const createNodeId = useCallback((baseId = "idea") => {
    nodeIdCounter.current += 1;
    return `${baseId}_${nodeIdCounter.current}`;
  }, []);

  // ---- Derived layout / edges ----
  const layoutMap = useMemo(() => computeForestLayout(allNodes), [allNodes]);

  const chainIds = useMemo(() => {
    if (!activeNodeId) return new Set();
    return new Set(getPathIds(allNodes, activeNodeId));
  }, [activeNodeId, allNodes]);

  const edges = useMemo(() => {
    const result = [];
    const byId = new Map(allNodes.map((n) => [n.id, n]));
    allNodes.forEach((n) => {
      if (!n.parentId || !byId.has(n.parentId)) return;
      const from = layoutMap.get(n.parentId);
      const to = layoutMap.get(n.id);
      if (!from || !to) return;
      result.push({
        id: `edge-${n.id}`,
        from,
        to,
        color: TYPE_COLORS[n.type],
        isInChain: chainIds.has(n.id) && chainIds.has(n.parentId)
      });
    });

    // Round-to-round lineage links (dashed)
    const roots = allNodes.filter((n) => n.isRoot).sort((a, b) => (a.round || 1) - (b.round || 1));
    for (let i = 1; i < roots.length; i += 1) {
      const from = layoutMap.get(roots[i - 1].id);
      const to = layoutMap.get(roots[i].id);
      if (from && to) {
        result.push({ id: `lineage-${roots[i].id}`, from, to, color: "#18c6d6", dashed: true, isInChain: false });
      }
    }
    return result;
  }, [allNodes, layoutMap, chainIds]);

  const currentRoundIdeas = useMemo(
    () => allNodes.filter((n) => !n.isRoot && (n.round || 1) === currentRound),
    [allNodes, currentRound]
  );

  // ---- Camera ----
  useEffect(() => {
    viewRef.current = { zoom, offset: viewOffset };
  }, [zoom, viewOffset]);

  const getViewportCenter = useCallback(() => ({
    x: window.innerWidth / 2,
    y: (window.innerHeight - HEADER_HEIGHT) / 2
  }), []);

  // Centre the cluster (a node + its right-hand children) in the viewport.
  const panToPosition = useCallback((nodePos) => {
    if (!nodePos) return;
    setAnimateView(true);
    const viewport = getViewportCenter();
    const z = viewRef.current.zoom;
    const xAnchor = viewport.x - (COL_W / 2) * z;
    setViewOffset({
      x: xAnchor - nodePos.x * z,
      y: viewport.y - nodePos.y * z
    });
  }, [getViewportCenter]);

  const zoomAround = useCallback((factor, pivot) => {
    const { zoom: currentZoom, offset } = viewRef.current;
    const nextZoom = clampZoom(currentZoom * factor);
    const realFactor = nextZoom / currentZoom;
    if (realFactor === 1) return;
    const nextOffset = {
      x: pivot.x - realFactor * (pivot.x - offset.x),
      y: pivot.y - realFactor * (pivot.y - offset.y)
    };
    viewRef.current = { zoom: nextZoom, offset: nextOffset };
    setZoom(nextZoom);
    setViewOffset(nextOffset);
  }, []);

  const handleZoomIn = useCallback(() => { setAnimateView(true); zoomAround(ZOOM_STEP, getViewportCenter()); }, [zoomAround, getViewportCenter]);
  const handleZoomOut = useCallback(() => { setAnimateView(true); zoomAround(1 / ZOOM_STEP, getViewportCenter()); }, [zoomAround, getViewportCenter]);

  const handleZoomReset = useCallback(() => {
    setAnimateView(true);
    const pos = activeNodeId ? layoutMap.get(activeNodeId) : null;
    viewRef.current = { ...viewRef.current, zoom: 1 };
    setZoom(1);
    if (pos) {
      const viewport = getViewportCenter();
      const nextOffset = { x: viewport.x - (COL_W / 2) - pos.x, y: viewport.y - pos.y };
      viewRef.current = { zoom: 1, offset: nextOffset };
      setViewOffset(nextOffset);
    }
  }, [activeNodeId, layoutMap, getViewportCenter]);

  const handleFitAllNodes = useCallback(() => {
    if (!allNodes.length) return;
    setAnimateView(true);
    const viewport = { width: window.innerWidth, height: window.innerHeight - HEADER_HEIGHT };
    const padding = 240;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    allNodes.forEach((n) => {
      const p = layoutMap.get(n.id);
      if (!p) return;
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
    if (!Number.isFinite(minX)) return;
    const boundsWidth = Math.max(1, maxX - minX + padding * 2);
    const boundsHeight = Math.max(1, maxY - minY + padding * 2);
    const nextZoom = clampZoom(Math.min(viewport.width / boundsWidth, viewport.height / boundsHeight));
    const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    const nextOffset = { x: viewport.width / 2 - center.x * nextZoom, y: viewport.height / 2 - center.y * nextZoom };
    viewRef.current = { zoom: nextZoom, offset: nextOffset };
    setZoom(nextZoom);
    setViewOffset(nextOffset);
  }, [allNodes, layoutMap]);

  // ---- Pointer pan ----
  const stopCanvasPan = useCallback((event) => {
    const drag = dragPanStateRef.current;
    if (!drag.isActive || drag.pointerId !== event.pointerId) return;
    drag.isActive = false;
    drag.pointerId = null;
    setIsPanningCanvas(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  const handleCanvasPointerDown = useCallback((event) => {
    if (event.button !== 0 && event.pointerType !== "touch") return;
    const target = event.target;
    if (target instanceof Element && target.closest(".think-node")) return;
    dragPanStateRef.current = { isActive: true, pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
    setAnimateView(false);
    setIsPanningCanvas(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }, []);

  const handleCanvasPointerMove = useCallback((event) => {
    const drag = dragPanStateRef.current;
    if (!drag.isActive || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    if (dx === 0 && dy === 0) return;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    setViewOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
    event.preventDefault();
  }, []);

  // Native, NON-passive wheel listener. React's onWheel is passive, so
  // preventDefault() there can't stop the browser's ctrl/⌘+wheel page zoom.
  // Attaching directly lets us zoom the canvas instead of the whole window.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || currentStage < STAGES.EXPAND) return undefined;

    const onWheel = (event) => {
      setAnimateView(false);
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
        zoomAround(factor, { x: event.clientX, y: event.clientY - HEADER_HEIGHT });
        return;
      }
      if (event.deltaX === 0 && event.deltaY === 0) return;
      event.preventDefault();
      setViewOffset((prev) => ({ x: prev.x - event.deltaX, y: prev.y - event.deltaY }));
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAround, currentStage]);

  // ---- Persistence ----
  useEffect(() => {
    if (currentStage <= STAGES.INPUT || allNodes.length === 0) return undefined;
    const payload = {
      currentStage, inputValue, seedData, allNodes, activeNodeId,
      thinkingChain, currentRound, viewOffset, zoom, hintDismissed, directions, synthesis
    };
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload)); } catch { /* quota */ }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [currentStage, inputValue, seedData, allNodes, activeNodeId, thinkingChain, currentRound, viewOffset, zoom, hintDismissed, directions, synthesis]);

  const handleResumeSession = useCallback(() => {
    if (!savedSession) return;
    const nextOffset = savedSession.viewOffset || { x: 0, y: 0 };
    const nextZoom = savedSession.zoom || 1;
    setCurrentStage(savedSession.currentStage || STAGES.EXPAND);
    setInputValue(savedSession.inputValue || savedSession.seedData?.userInput || "");
    setSeedData(savedSession.seedData || null);
    setAllNodes(savedSession.allNodes || []);
    setActiveNodeId(savedSession.activeNodeId || null);
    setThinkingChain(savedSession.thinkingChain || []);
    setCurrentRound(savedSession.currentRound || getHighestRound(savedSession.allNodes));
    setViewOffset(nextOffset);
    setZoom(nextZoom);
    setHintDismissed(true);
    setDirections(savedSession.directions || []);
    setSynthesis(savedSession.synthesis || null);
    setShowFinalOutput(Boolean(savedSession.synthesis && savedSession.currentStage === STAGES.SYNTHESIZE));
    setError("");
    nodeIdCounter.current = getHighestNodeCounter(savedSession.allNodes);
    viewRef.current = { zoom: nextZoom, offset: nextOffset };
    setSavedSession(null);
  }, [savedSession]);

  const handleDiscardSession = useCallback(() => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setSavedSession(null);
  }, []);

  // ---- Stage 1: start (round 1) ----
  const handleStart = async () => {
    if (!inputValue.trim() || isLoading) return;
    setError("");
    setIsLoading(true);
    try {
      const seed = await interpretSeed(inputValue);
      setSeedData({ userInput: inputValue, ...seed });

      const rootId = "root-r1";
      const root = { id: rootId, content: inputValue, type: "root", parentId: null, isRoot: true, round: 1, expanded: true };

      const ideas = await generateIdeaNodes(inputValue, {
        objective: seed.objective,
        guiding_questions: seed.guiding_questions
      });
      const children = ideas.map((idea) => ({
        id: createNodeId("idea"),
        content: idea.content,
        type: idea.type,
        parentId: rootId,
        isRoot: false,
        round: 1,
        expanded: false
      }));

      const next = [root, ...children];
      setAllNodes(next);
      setActiveNodeId(rootId);
      setCurrentRound(1);
      setThinkingChain([inputValue]);
      setCurrentStage(STAGES.EXPAND);
      panToPosition(computeForestLayout(next).get(rootId));
    } catch (err) {
      setError(err?.message || "Failed to start brainstorming. Please try again.");
      console.error(err);
    }
    setIsLoading(false);
  };

  // ---- Stage 2: click a node (expand if a leaf, else just focus) ----
  const handleNodeClick = async (node) => {
    if (isLoading) return;

    setActiveNodeId(node.id);
    setThinkingChain(getPathContents(allNodes, node.id));

    if (node.expanded) {
      panToPosition(layoutMap.get(node.id));
      return;
    }

    setError("");
    setIsLoading(true);
    panToPosition(layoutMap.get(node.id));

    try {
      const parentChain = getPathContents(allNodes, node.id);
      const ideas = await generateIdeaNodes(node.content, {
        objective: seedData?.objective,
        guiding_questions: seedData?.guiding_questions,
        parentChain
      });
      const children = ideas.map((idea) => ({
        id: createNodeId("idea"),
        content: idea.content,
        type: idea.type,
        parentId: node.id,
        isRoot: false,
        round: node.round || currentRound,
        expanded: false
      }));
      const next = allNodes
        .map((n) => (n.id === node.id ? { ...n, expanded: true } : n))
        .concat(children);
      setAllNodes(next);
      panToPosition(computeForestLayout(next).get(node.id));
    } catch (err) {
      setError(err?.message || "Failed to expand idea. Please try again.");
      console.error(err);
    }
    setIsLoading(false);
  };

  // Regenerate children of the active node (replaces its whole subtree)
  const handleRegenerate = async () => {
    const active = allNodes.find((n) => n.id === activeNodeId);
    if (!active || isLoading) return;

    setError("");
    setIsLoading(true);
    try {
      const descendants = getDescendantIds(allNodes, active.id);
      const pruned = allNodes
        .filter((n) => !descendants.has(n.id))
        .map((n) => (n.id === active.id ? { ...n, expanded: true } : n));

      const parentChain = getPathContents(allNodes, active.id);
      const ideas = await generateIdeaNodes(active.content, {
        objective: seedData?.objective,
        guiding_questions: seedData?.guiding_questions,
        parentChain
      });
      const children = ideas.map((idea) => ({
        id: createNodeId("idea"),
        content: idea.content,
        type: idea.type,
        parentId: active.id,
        isRoot: false,
        round: active.round || currentRound,
        expanded: false
      }));
      const next = [...pruned, ...children];
      setAllNodes(next);
      panToPosition(computeForestLayout(next).get(active.id));
    } catch (err) {
      setError(err?.message || "Failed to regenerate. Please try again.");
      console.error(err);
    }
    setIsLoading(false);
  };

  // ---- Stage 3: structure ----
  const handleStructure = async () => {
    if (currentRoundIdeas.length < 3) {
      setError("Add a few more ideas to this web before structuring.");
      return;
    }
    setError("");
    setIsLoading(true);
    try {
      const sample = currentRoundIdeas.slice(0, MAX_CLUSTER_NODES);
      const dirs = await clusterIntoDirections(
        sample.map((n) => ({ id: n.id, type: n.type, content: n.content })),
        seedData?.objective || thinkingChain[0] || inputValue
      );
      setDirections(dirs);
      setCurrentStage(STAGES.STRUCTURE);
    } catch (err) {
      setError(err?.message || "Failed to structure ideas. Please try again.");
      console.error(err);
    }
    setIsLoading(false);
  };

  // ---- Stage 4: synthesize (Pro deep summary) ----
  const handleSynthesize = async () => {
    setError("");
    setIsLoading(true);
    try {
      const sample = currentRoundIdeas.slice(0, MAX_CLUSTER_NODES);
      const synth = await generateSynthesis(
        seedData?.objective || thinkingChain[0],
        directions,
        sample.map((n) => ({ id: n.id, type: n.type, content: n.content }))
      );
      setSynthesis(synth);
      setCurrentStage(STAGES.SYNTHESIZE);
      setShowFinalOutput(true);
    } catch (err) {
      setError(err?.message || "Failed to synthesize. Please try again.");
      console.error(err);
    }
    setIsLoading(false);
  };

  // ---- Grow the next web from the Pro summary (keeps the previous web) ----
  const handleGrowNextWeb = async () => {
    if (!synthesis || isLoading) return;
    setError("");
    setIsLoading(true);
    try {
      const nextRound = getHighestRound(allNodes) + 1;
      const newObjective = synthesis?.problem_statement?.interpreted_goal || seedData?.objective || "";
      const promo = directions.find((d) => d.direction_id === synthesis?.comparison?.most_promising);
      const newTopic = promo?.title || newObjective || seedData?.userInput || "Next exploration";

      const rootId = `root-r${nextRound}`;
      const root = { id: rootId, content: newTopic, type: "root", parentId: null, isRoot: true, round: nextRound, expanded: true };

      const guiding = (synthesis?.next_actions?.questions_to_answer || []).slice(0, 3);
      const ideas = await generateIdeaNodes(newTopic, {
        objective: newObjective,
        guiding_questions: guiding.length ? guiding : seedData?.guiding_questions
      });
      const children = ideas.map((idea) => ({
        id: createNodeId("idea"),
        content: idea.content,
        type: idea.type,
        parentId: rootId,
        isRoot: false,
        round: nextRound,
        expanded: false
      }));

      const next = [...allNodes, root, ...children];
      setAllNodes(next);
      setCurrentRound(nextRound);
      setActiveNodeId(rootId);
      setSeedData((prev) => ({ ...(prev || {}), userInput: newTopic, objective: newObjective }));
      setThinkingChain([newTopic]);
      setDirections([]);
      setSynthesis(null);
      setShowFinalOutput(false);
      setCurrentStage(STAGES.EXPAND);
      panToPosition(computeForestLayout(next).get(rootId));
    } catch (err) {
      setError(err?.message || "Failed to grow the next web. Please try again.");
      console.error(err);
    }
    setIsLoading(false);
  };

  // ---- Export the whole web as an image ----
  const handleExportImage = useCallback(async () => {
    if (!allNodes.length) return;
    try {
      const { svg, width, height } = buildWebSvg(allNodes, layoutMap, TYPE_COLORS, seedData?.userInput || "ThinkStorm");
      await downloadWebImage(svg, width, height, `thinkstorm-${slugify(seedData?.userInput)}`);
    } catch (err) {
      setError(err?.message || "Failed to export web image.");
      console.error(err);
    }
  }, [allNodes, layoutMap, seedData]);

  // ---- Reset ----
  const handleReset = () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setSavedSession(null);
    setCurrentStage(STAGES.INPUT);
    setInputValue("");
    setSeedData(null);
    setAllNodes([]);
    setActiveNodeId(null);
    setThinkingChain([]);
    setCurrentRound(1);
    setViewOffset({ x: 0, y: 0 });
    setZoom(1);
    setHintDismissed(false);
    viewRef.current = { zoom: 1, offset: { x: 0, y: 0 } };
    setDirections([]);
    setSynthesis(null);
    setShowFinalOutput(false);
    setError("");
    setIsPanningCanvas(false);
    dragPanStateRef.current = { isActive: false, pointerId: null, lastX: 0, lastY: 0 };
    nodeIdCounter.current = 0;
  };

  const activeNode = activeNodeId ? allNodes.find((n) => n.id === activeNodeId) : null;
  const canRegenerate = Boolean(activeNode) && !isLoading;
  const expandedHint = currentStage === STAGES.EXPAND && currentRoundIdeas.length > 0 && !hintDismissed && !isLoading;

  return (
    <div className="brain-canvas-container">
      {/* Ambient aurora background */}
      <div className="aurora-bg" aria-hidden="true">
        <span className="aurora-blob blob-1" />
        <span className="aurora-blob blob-2" />
        <span className="aurora-blob blob-3" />
      </div>

      {/* Header */}
      <Motion.header className="canvas-header" initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
        <h1 className="logo">
          <span className="logo-icon"><ZapIcon size={19} /></span>
          ThinkStorm
        </h1>

        {currentStage > STAGES.INPUT && (
          <div className="header-info">
            <div className="stage-progress">
              {STAGE_LABELS.slice(1).map((label, i) => (
                <div key={label} className={`stage-dot ${i + 1 <= currentStage ? "active" : ""} ${i + 1 === currentStage ? "current" : ""}`}>
                  <span className="stage-num">{i + 1}</span>
                  {i < 3 && <span className="stage-line" />}
                </div>
              ))}
            </div>

            <div className="thinking-chain">
              {thinkingChain.map((item, i) => (
                <span key={i} className="chain-item">
                  {item.length > 20 ? item.slice(0, 20) + "…" : item}
                  {i < thinkingChain.length - 1 && <span className="chain-arrow">→</span>}
                </span>
              ))}
            </div>
          </div>
        )}

        {seedData && currentStage >= STAGES.EXPAND && (
          <div className="header-right">
            {currentRound > 1 && <span className="round-badge">Web {currentRound}</span>}
            <div className="seed-badge" title={seedData.objective}>
              <TargetIcon size={14} />
              <span>{seedData.objective?.slice(0, 38)}…</span>
            </div>
          </div>
        )}
      </Motion.header>

      {/* Landing */}
      {currentStage === STAGES.INPUT && (
        <Motion.div className="initial-input-container" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1 }}>
          <div className="hero-badge"><SparklesIcon size={14} /> AI-powered brainstorming</div>
          <h2 className="input-title">What do you want to brainstorm?</h2>
          <p className="input-subtitle">Drop in a topic and grow a living web of ideas — expand any node, structure it, then let AI seed the next web.</p>
          <div className="input-wrapper">
            <div className="input-field">
              <span className="input-leading-icon"><SparklesIcon size={20} /></span>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleStart()}
                placeholder="e.g., AI research, startup ideas, product features…"
                className="main-input"
                autoFocus
              />
              <Motion.button className="start-btn" onClick={handleStart} disabled={!inputValue.trim() || isLoading} whileHover={{ scale: isLoading ? 1 : 1.03 }} whileTap={{ scale: 0.97 }}>
                {isLoading ? "Generating…" : <>Start <ArrowRightIcon size={18} /></>}
              </Motion.button>
            </div>
            <div className="example-chips">
              <span className="example-label">Try:</span>
              {EXAMPLES.map((ex) => (
                <button key={ex} className="example-chip" onClick={() => setInputValue(ex)} disabled={isLoading}>{ex}</button>
              ))}
            </div>
          </div>
          {savedSession && (
            <Motion.div className="resume-session" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <div>
                <strong>Resume previous session?</strong>
                <span>{savedSession.seedData?.userInput || savedSession.inputValue || "Untitled brainstorm"}</span>
              </div>
              <div className="resume-actions">
                <button type="button" onClick={handleResumeSession}>Resume</button>
                <button type="button" onClick={handleDiscardSession}>Discard</button>
              </div>
            </Motion.div>
          )}
        </Motion.div>
      )}

      {/* Canvas */}
      {currentStage >= STAGES.EXPAND && (
        <div
          className={`canvas-area ${isPanningCanvas ? "panning" : ""}`}
          ref={canvasRef}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={stopCanvasPan}
          onPointerCancel={stopCanvasPan}
        >
          <div
            className="canvas-grid"
            aria-hidden="true"
            style={{
              backgroundSize: `${26 * zoom}px ${26 * zoom}px`,
              backgroundPosition: `${viewOffset.x}px ${viewOffset.y}px`,
              transition: animateView
                ? "background-position 0.5s cubic-bezier(0.22, 1, 0.36, 1), background-size 0.5s cubic-bezier(0.22, 1, 0.36, 1)"
                : "none"
            }}
          />

          <div
            className="canvas-viewport"
            style={{
              transform: `translate3d(${viewOffset.x}px, ${viewOffset.y}px, 0) scale(${zoom})`,
              transformOrigin: "0 0",
              transition: animateView ? "transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)" : "none"
            }}
          >
            <svg className="connections-layer">
              <ConnectionGradients />
              <AnimatePresence>
                {edges.map((edge) => (
                  <ConnectionLine
                    key={edge.id}
                    from={edge.from}
                    to={edge.to}
                    isInChain={edge.isInChain}
                    color={edge.color}
                    dashed={edge.dashed}
                  />
                ))}
              </AnimatePresence>
            </svg>

            <AnimatePresence>
              {allNodes.map((node) => {
                const pos = layoutMap.get(node.id);
                if (!pos) return null;
                return (
                  <ThinkNode
                    key={node.id}
                    topic={node.content}
                    nodeType={node.type}
                    isRoot={node.isRoot}
                    isActive={node.id === activeNodeId}
                    isInChain={chainIds.has(node.id)}
                    isExpanded={node.expanded}
                    position={pos}
                    onClick={() => handleNodeClick(node)}
                    typeColor={TYPE_COLORS[node.type]}
                  />
                );
              })}
            </AnimatePresence>
          </div>

          <AnimatePresence>
            {isLoading && (
              <Motion.div
                className="loading-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="thinking-orb">
                  <span className="orb-core"><SparklesIcon size={20} /></span>
                </div>
                <span className="thinking-text">
                  AI is thinking
                  <span className="thinking-dots"><i /><i /><i /></span>
                </span>
              </Motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {expandedHint && (
              <Motion.div
                className="canvas-hint"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <span className="hint-icons"><MouseIcon size={15} /></span>
                <span><strong>Click any node</strong> to expand it · go back and branch others · <strong>⌘/Ctrl + scroll</strong> to zoom</span>
                <button className="hint-close" onClick={() => setHintDismissed(true)} aria-label="Dismiss hint"><CloseIcon size={14} /></button>
              </Motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Combined dock — actions + view controls (icon-only, hover tooltips) */}
      {currentStage >= STAGES.EXPAND && !showFinalOutput && (
        <Motion.div className="side-dock" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <button className="dock-btn" onClick={handleRegenerate} disabled={!canRegenerate} data-tip="Regenerate branch" aria-label="Regenerate branch">
            <RefreshIcon size={18} />
          </button>
          <button className="dock-btn" onClick={handleExportImage} disabled={isLoading} data-tip="Save web image" aria-label="Save web image">
            <DownloadIcon size={18} />
          </button>
          {currentStage === STAGES.EXPAND && (
            <button className="dock-btn structure" onClick={handleStructure} disabled={isLoading || currentRoundIdeas.length < 3} data-tip="Structure ideas" aria-label="Structure ideas">
              <LayersIcon size={18} />
            </button>
          )}
          {currentStage === STAGES.STRUCTURE && (
            <button className="dock-btn primary" onClick={handleSynthesize} disabled={isLoading} data-tip="Synthesize report" aria-label="Synthesize report">
              <SparklesIcon size={18} />
            </button>
          )}
          {currentStage === STAGES.SYNTHESIZE && (
            <button className="dock-btn primary" onClick={() => setShowFinalOutput(true)} disabled={isLoading} data-tip="View report" aria-label="View report">
              <SparklesIcon size={18} />
            </button>
          )}
          <button className="dock-btn reset" onClick={handleReset} data-tip="Reset" aria-label="Reset">
            <TrashIcon size={18} />
          </button>

          <span className="dock-divider" />

          <button className="dock-btn" onClick={handleZoomIn} data-tip="Zoom in" aria-label="Zoom in"><PlusIcon size={18} /></button>
          <button className="dock-btn zoom-level" onClick={handleZoomReset} data-tip="Reset zoom" aria-label="Reset zoom">{Math.round(zoom * 100)}%</button>
          <button className="dock-btn" onClick={handleZoomOut} data-tip="Zoom out" aria-label="Zoom out"><MinusIcon size={18} /></button>
          <button className="dock-btn" onClick={() => panToPosition(layoutMap.get(activeNodeId))} data-tip="Recenter" aria-label="Recenter"><CrosshairIcon size={18} /></button>
          <button className="dock-btn" onClick={handleFitAllNodes} data-tip="Fit all" aria-label="Fit all"><MaximizeIcon size={18} /></button>
        </Motion.div>
      )}

      {/* Legend */}
      {currentStage >= STAGES.EXPAND && (
        <Motion.div className="node-legend" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {TYPE_LEGEND.map((item) => (
            <span className="legend-item" key={item.type}>
              <span className="legend-dot" style={{ background: TYPE_COLORS[item.type] }} />
              {item.label}
            </span>
          ))}
        </Motion.div>
      )}

      {/* Directions overview (structure stage) */}
      <AnimatePresence>
        {currentStage === STAGES.STRUCTURE && !showFinalOutput && directions.length > 0 && (
          <Motion.div className="directions-panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <h3><LayersIcon size={15} /> Directions Found</h3>
            <div className="directions-list">
              {directions.map((dir) => (
                <div key={dir.direction_id} className="direction-chip">
                  <span className="dir-id">{dir.direction_id}</span>
                  <span className="dir-name">{dir.title}</span>
                </div>
              ))}
            </div>
          </Motion.div>
        )}
      </AnimatePresence>

      {/* Error toast */}
      <AnimatePresence>
        {error && (
          <Motion.div className="error-toast" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {error}
            <button className="error-close" onClick={() => setError("")}>×</button>
          </Motion.div>
        )}
      </AnimatePresence>

      {/* Final output */}
      <AnimatePresence>
        {showFinalOutput && synthesis && (
          <FinalOutput
            synthesis={synthesis}
            seedData={seedData}
            directions={directions}
            ideaNodes={currentRoundIdeas}
            round={currentRound}
            onClose={() => setShowFinalOutput(false)}
            onReset={handleReset}
            onContinue={handleGrowNextWeb}
            onExportImage={handleExportImage}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
