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
import { exportWebImage } from "../utils/webExport";
import { slugify, truncate } from "../utils/text";
import Aurora from "./reactbits/Aurora";
import Squares from "./reactbits/Squares";
import Dock from "./reactbits/Dock";
import ClickSpark from "./reactbits/ClickSpark";
import StageStepper from "./reactbits/StageStepper";
import GradientText from "./reactbits/GradientText";
import StarBorder from "./reactbits/StarBorder";
import Magnet from "./reactbits/Magnet";
import RotatingText from "./reactbits/RotatingText";
import CountUp from "./reactbits/CountUp";
import { SeedReviewPanel, IdeaWorkbench, StructureReviewPanel } from "./WorkflowPanel";
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

// Layout + zoom constants.
// Two density tiers. The compact set must stay in step with the <=768px rules in
// ThinkNode.css — the layout reserves space based on these numbers, so scaling
// the cards in CSS alone would make branches overlap.
const DEFAULT_HEADER_HEIGHT = 70; // desktop only — the real value is measured
const METRICS = {
  comfortable: {
    COL_W: 440,        // horizontal distance per depth level
    CARD_W: 300,       // widest a card can render
    LEAF_GAP: 48,      // vertical gap between stacked leaf cards
    ROUND_GAP: 300,    // vertical gap between successive rounds
    LINE_H: 20,
    PAD_V: 32,
    LABEL_H: 22,
    CHARS_ROOT: 20,
    CHARS_IDEA: 32
  },
  compact: {
    COL_W: 300,
    CARD_W: 220,
    LEAF_GAP: 34,
    ROUND_GAP: 210,
    LINE_H: 18,
    PAD_V: 26,
    LABEL_H: 19,
    CHARS_ROOT: 17,
    CHARS_IDEA: 26
  }
};
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 2.4;
const ZOOM_STEP = 1.15;
const MAX_CLUSTER_NODES = 80; // protect request size while supporting real sessions
const SESSION_STORAGE_KEY = "thinkstorm.session.v2";
const CAMERA_STORAGE_KEY = "thinkstorm.camera.v2";
const ERROR_TOAST_MS = 7000;
// Must match the breakpoint that moves .side-dock to the bottom in BrainCanvas.css
const DOCK_STACK_QUERY = "(max-width: 768px)";
const clampZoom = (value) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));

const DEFAULT_EVALUATION_CRITERIA = [
  { id: "impact", label: "Potential impact", weight: 3 },
  { id: "feasibility", label: "Feasibility", weight: 3 },
  { id: "confidence", label: "Evidence / confidence", weight: 2 }
];
const EMPTY_COMMITMENT = { first_step: "", success_metric: "", owner: "", due_date: "", status: "open" };
const createEmptyDirectionScores = (dirs = []) => dirs.reduce((scores, direction) => {
  scores[direction.direction_id] = {};
  return scores;
}, {});

// localStorage throws outright in some privacy modes; never let that reach render.
const safeStorage = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* quota or blocked */ }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* blocked */ }
  }
};

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

function getSubtreeIds(nodes, id) {
  const childrenMap = buildChildrenMap(nodes);
  const result = new Set([id]);
  const stack = [...(childrenMap.get(id) || [])];
  while (stack.length) {
    const node = stack.pop();
    if (result.has(node.id)) continue;
    result.add(node.id);
    (childrenMap.get(node.id) || []).forEach((child) => stack.push(child));
  }
  return result;
}

function filterFreshIdeas(ideas, existingNodes) {
  const seen = new Set(existingNodes.map((node) => String(node.content || "").trim().toLowerCase()).filter(Boolean));
  return (Array.isArray(ideas) ? ideas : []).filter((idea) => {
    const key = String(idea?.content || "").trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Estimate a card's rendered height so the layout reserves enough vertical room.
function estimateNodeHeight(node, m = METRICS.comfortable) {
  const isRoot = !!node.isRoot;
  const charsPerLine = isRoot ? m.CHARS_ROOT : m.CHARS_IDEA;
  const length = String(node.content || "").length;
  const lines = Math.min(7, Math.max(1, Math.ceil(length / charsPerLine)));
  const labelH = isRoot ? 0 : m.LABEL_H;
  return labelH + lines * m.LINE_H + m.PAD_V; // text + vertical padding
}

// Tidy, height-aware left-to-right forest layout. Each leaf reserves space for its
// own card height (so tall cards never overlap); parents centre on their children.
// Each round is its own tree, stacked vertically with a gap.
function computeForestLayout(nodes, m = METRICS.comfortable) {
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
        const h = estimateNodeHeight(node, m);
        y = cursorY + h / 2;
        cursorY += h + m.LEAF_GAP;
        maxY = Math.max(maxY, y + h / 2);
      } else {
        const ys = kids.map((k) => walk(k, depth + 1));
        y = (ys[0] + ys[ys.length - 1]) / 2;
        maxY = Math.max(maxY, y);
      }
      pos.set(node.id, { x: depth * m.COL_W, y, round: node.round || 1 });
      return y;
    };
    walk(root, 0);
    bandTop = maxY + m.ROUND_GAP;
  });

  return pos;
}

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
  const stored = safeStorage.get(SESSION_STORAGE_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    return parsed?.currentStage > STAGES.INPUT && Array.isArray(parsed?.allNodes)
      && (parsed.allNodes.length || parsed.seedData)
      ? parsed
      : null;
  } catch {
    safeStorage.remove(SESSION_STORAGE_KEY);
    return null;
  }
};

// Camera lives in its own key so panning does not re-serialize the whole graph.
const readSavedCamera = () => {
  const stored = safeStorage.get(CAMERA_STORAGE_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    return Number.isFinite(parsed?.zoom) && Number.isFinite(parsed?.viewOffset?.x) ? parsed : null;
  } catch {
    safeStorage.remove(CAMERA_STORAGE_KEY);
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
  // The header is 70px on desktop but wraps to ~130px under 768px. Measuring it
  // keeps `.canvas-area`'s offset and every camera calculation in agreement.
  const [headerHeight, setHeaderHeight] = useState(DEFAULT_HEADER_HEIGHT);
  const [isCompact, setIsCompact] = useState(
    () => typeof window.matchMedia === "function" && window.matchMedia(DOCK_STACK_QUERY).matches
  );

  const canvasRef = useRef(null);
  const headerRef = useRef(null);
  const nodeIdCounter = useRef(0);
  const viewRef = useRef({ zoom: 1, offset: { x: 0, y: 0 } });
  const headerHeightRef = useRef(DEFAULT_HEADER_HEIGHT);
  const dragPanStateRef = useRef({ isActive: false, pointerId: null, lastX: 0, lastY: 0 });
  const seedCacheRef = useRef(null);
  // Active pointers on the canvas, keyed by pointerId — drives two-finger pinch.
  const pointersRef = useRef(new Map());
  const pinchRef = useRef(null);

  // Structure & Synthesis
  const [directions, setDirections] = useState([]);
  const [synthesis, setSynthesis] = useState(null);
  const [showFinalOutput, setShowFinalOutput] = useState(false);
  // Set when ideas are added after clustering, so the dock can offer a re-run.
  const [structureStale, setStructureStale] = useState(false);
  const [selectedDirectionId, setSelectedDirectionId] = useState(null);
  const [evaluationCriteria, setEvaluationCriteria] = useState(DEFAULT_EVALUATION_CRITERIA);
  const [directionScores, setDirectionScores] = useState({});
  const [commitment, setCommitment] = useState(EMPTY_COMMITMENT);
  // A bounded workflow history makes regeneration, deletion, and edits reversible.
  const [workflowHistory, setWorkflowHistory] = useState([]);
  const directionEditHistoryRef = useRef(false);

  const createNodeId = useCallback((baseId = "idea") => {
    nodeIdCounter.current += 1;
    return `${baseId}_${nodeIdCounter.current}`;
  }, []);

  const pushWorkflowHistory = useCallback((label) => {
    const snapshot = {
      label,
      allNodes,
      directions,
      synthesis,
      structureStale,
      currentStage,
      activeNodeId,
      currentRound,
      selectedDirectionId,
      evaluationCriteria,
      directionScores,
      commitment
    };
    setWorkflowHistory((previous) => [...previous.slice(-9), snapshot]);
  }, [allNodes, directions, synthesis, structureStale, currentStage, activeNodeId, currentRound, selectedDirectionId, evaluationCriteria, directionScores, commitment]);

  const handleUndoWorkflow = useCallback(() => {
    const snapshot = workflowHistory[workflowHistory.length - 1];
    if (!snapshot) return;
    setAllNodes(snapshot.allNodes || []);
    setDirections(snapshot.directions || []);
    setSynthesis(snapshot.synthesis || null);
    setStructureStale(Boolean(snapshot.structureStale));
    setCurrentStage(snapshot.currentStage || STAGES.EXPAND);
    setActiveNodeId(snapshot.activeNodeId || null);
    setCurrentRound(snapshot.currentRound || 1);
    setSelectedDirectionId(snapshot.selectedDirectionId || null);
    setEvaluationCriteria(snapshot.evaluationCriteria?.length ? snapshot.evaluationCriteria : DEFAULT_EVALUATION_CRITERIA);
    setDirectionScores(snapshot.directionScores || createEmptyDirectionScores(snapshot.directions || []));
    setCommitment(snapshot.commitment || EMPTY_COMMITMENT);
    setShowFinalOutput(false);
    directionEditHistoryRef.current = false;
    setWorkflowHistory((previous) => previous.slice(0, -1));
    setError(`Undid ${snapshot.label || "last change"}.`);
  }, [workflowHistory]);

  // Density tier for the whole canvas. Must match ThinkNode.css's breakpoint.
  const metrics = isCompact ? METRICS.compact : METRICS.comfortable;

  // ---- Derived layout / edges ----
  const layoutMap = useMemo(() => computeForestLayout(allNodes, metrics), [allNodes, metrics]);

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

  // The dock flips to the bottom edge under 768px; the Dock component needs to
  // know so it magnifies along the correct axis.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const mql = window.matchMedia(DOCK_STACK_QUERY);
    const apply = (event) => setIsCompact(event.matches);
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, []);

  // Measure the header so the canvas offset survives the mobile wrap.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return undefined;
    const apply = () => {
      const next = Math.round(el.getBoundingClientRect().height) || DEFAULT_HEADER_HEIGHT;
      headerHeightRef.current = next;
      setHeaderHeight((prev) => (prev === next ? prev : next));
    };
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    apply();
    return () => observer.disconnect();
  }, [currentStage]);

  const getViewportCenter = useCallback(() => ({
    x: window.innerWidth / 2,
    y: (window.innerHeight - headerHeightRef.current) / 2
  }), []);

  // Centre the cluster (a node + its right-hand children) in the viewport.
  const panToPosition = useCallback((nodePos) => {
    if (!nodePos) return;
    setAnimateView(true);
    const viewport = getViewportCenter();
    const z = viewRef.current.zoom;
    const xAnchor = viewport.x - (metrics.COL_W / 2) * z;
    setViewOffset({
      x: xAnchor - nodePos.x * z,
      y: viewport.y - nodePos.y * z
    });
  }, [getViewportCenter, metrics]);

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
    const viewport = getViewportCenter();
    const pos = activeNodeId ? layoutMap.get(activeNodeId) : null;
    // With no active node, re-anchor on whatever is currently centred rather
    // than leaving the old offset behind (which pivoted on the world origin).
    const anchor = pos || {
      x: (viewport.x - viewRef.current.offset.x) / viewRef.current.zoom,
      y: (viewport.y - viewRef.current.offset.y) / viewRef.current.zoom
    };
    const nextOffset = {
      x: viewport.x - (pos ? metrics.COL_W / 2 : 0) - anchor.x,
      y: viewport.y - anchor.y
    };
    viewRef.current = { zoom: 1, offset: nextOffset };
    setZoom(1);
    setViewOffset(nextOffset);
  }, [activeNodeId, layoutMap, getViewportCenter, metrics]);

  const handleFitAllNodes = useCallback(() => {
    if (!allNodes.length) return;
    setAnimateView(true);
    const viewport = { width: window.innerWidth, height: window.innerHeight - headerHeightRef.current };
    const padding = 80;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    allNodes.forEach((n) => {
      const p = layoutMap.get(n.id);
      if (!p) return;
      // Bound the card box, not just its centre, so wide/tall cards stay in frame.
      const halfH = estimateNodeHeight(n, metrics) / 2;
      minX = Math.min(minX, p.x - metrics.CARD_W / 2); maxX = Math.max(maxX, p.x + metrics.CARD_W / 2);
      minY = Math.min(minY, p.y - halfH); maxY = Math.max(maxY, p.y + halfH);
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
  }, [allNodes, layoutMap, metrics]);

  // ---- Pointer pan + pinch ----
  const stopCanvasPan = useCallback((event) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;

    const drag = dragPanStateRef.current;
    if (drag.isActive && drag.pointerId === event.pointerId) {
      drag.isActive = false;
      drag.pointerId = null;
      setIsPanningCanvas(false);
    }
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    // Hand the drag over to whichever finger is still down.
    if (pointersRef.current.size === 1) {
      const [[pointerId, point]] = pointersRef.current.entries();
      dragPanStateRef.current = { isActive: true, pointerId, lastX: point.x, lastY: point.y };
      setIsPanningCanvas(true);
    }
  }, []);

  const handleCanvasPointerDown = useCallback((event) => {
    if (event.button !== 0 && event.pointerType !== "touch") return;
    const target = event.target;
    // Match the whole wrapper: the pulse ring and expand hint sit outside .think-node.
    if (target instanceof Element && target.closest(".think-node-wrapper")) return;

    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setAnimateView(false);

    if (pointersRef.current.size === 2) {
      // Second finger down — switch from panning to pinching.
      const [a, b] = Array.from(pointersRef.current.values());
      pinchRef.current = { distance: Math.hypot(a.x - b.x, a.y - b.y) };
      dragPanStateRef.current = { isActive: false, pointerId: null, lastX: 0, lastY: 0 };
      setIsPanningCanvas(false);
    } else if (pointersRef.current.size === 1) {
      dragPanStateRef.current = { isActive: true, pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
      setIsPanningCanvas(true);
    }

    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }, []);

  const handleCanvasPointerMove = useCallback((event) => {
    const pointers = pointersRef.current;
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    // Two fingers — pinch to zoom around the midpoint between them.
    if (pointers.size === 2 && pinchRef.current) {
      const [a, b] = Array.from(pointers.values());
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const previous = pinchRef.current.distance;
      if (previous > 0 && distance > 0) {
        zoomAround(distance / previous, {
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2 - headerHeightRef.current
        });
      }
      pinchRef.current = { distance };
      event.preventDefault();
      return;
    }

    const drag = dragPanStateRef.current;
    if (!drag.isActive || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    if (dx === 0 && dy === 0) return;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    setViewOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
    event.preventDefault();
  }, [zoomAround]);

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
        zoomAround(factor, { x: event.clientX, y: event.clientY - headerHeightRef.current });
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
  // Graph state. Deliberately excludes the camera: panning fires setState on
  // every pointermove, and re-serializing the whole forest each time was the
  // single most expensive thing a drag could trigger.
  useEffect(() => {
    if (currentStage <= STAGES.INPUT || (!allNodes.length && !seedData)) return undefined;
    const payload = {
      currentStage, inputValue, seedData, allNodes, activeNodeId,
      thinkingChain, currentRound, hintDismissed, directions, synthesis,
      selectedDirectionId, evaluationCriteria, directionScores, commitment
    };
    const timer = window.setTimeout(() => {
      safeStorage.set(SESSION_STORAGE_KEY, JSON.stringify(payload));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [currentStage, inputValue, seedData, allNodes, activeNodeId, thinkingChain, currentRound, hintDismissed, directions, synthesis, selectedDirectionId, evaluationCriteria, directionScores, commitment]);

  // Camera state — its own tiny key, and a longer debounce.
  useEffect(() => {
    if (currentStage <= STAGES.INPUT) return undefined;
    const timer = window.setTimeout(() => {
      safeStorage.set(CAMERA_STORAGE_KEY, JSON.stringify({ viewOffset, zoom }));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [currentStage, viewOffset, zoom]);

  const handleResumeSession = useCallback(() => {
    if (!savedSession) return;
    const camera = readSavedCamera();
    const nextOffset = camera?.viewOffset || savedSession.viewOffset || { x: 0, y: 0 };
    const nextZoom = camera?.zoom || savedSession.zoom || 1;
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
    setStructureStale(false);
    setDirections(savedSession.directions || []);
    setSynthesis(savedSession.synthesis || null);
    setSelectedDirectionId(savedSession.selectedDirectionId || savedSession.directions?.[0]?.direction_id || null);
    setEvaluationCriteria(savedSession.evaluationCriteria?.length ? savedSession.evaluationCriteria : DEFAULT_EVALUATION_CRITERIA);
    setDirectionScores(savedSession.directionScores || createEmptyDirectionScores(savedSession.directions || []));
    setCommitment(savedSession.commitment || EMPTY_COMMITMENT);
    setWorkflowHistory([]);
    setShowFinalOutput(Boolean(savedSession.synthesis && savedSession.currentStage === STAGES.SYNTHESIZE));
    setError("");
    nodeIdCounter.current = getHighestNodeCounter(savedSession.allNodes);
    viewRef.current = { zoom: nextZoom, offset: nextOffset };
    setSavedSession(null);
  }, [savedSession]);

  const handleDiscardSession = useCallback(() => {
    safeStorage.remove(SESSION_STORAGE_KEY);
    safeStorage.remove(CAMERA_STORAGE_KEY);
    setSavedSession(null);
  }, []);

  // ---- Error toast auto-dismiss (bug: it used to hang around forever) ----
  useEffect(() => {
    if (!error) return undefined;
    const timer = window.setTimeout(() => setError(""), ERROR_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [error]);

  // ---- Stage 1: frame the brief; generation waits for user confirmation ----
  const handleStart = async () => {
    if (!inputValue.trim() || isLoading) return;
    setError("");
    setIsLoading(true);
    try {
      // Cache the seed against the exact input so a retry after a failed
      // idea-generation call does not pay for interpretSeed a second time.
      let seed = seedCacheRef.current?.input === inputValue ? seedCacheRef.current.seed : null;
      if (!seed) {
        seed = await interpretSeed(inputValue);
        seedCacheRef.current = { input: inputValue, seed };
      }

      setSeedData({ userInput: inputValue, ...seed });
      setAllNodes([]);
      setActiveNodeId(null);
      setCurrentRound(1);
      setThinkingChain([inputValue]);
      setDirections([]);
      setSynthesis(null);
      setSelectedDirectionId(null);
      setEvaluationCriteria(DEFAULT_EVALUATION_CRITERIA);
      setDirectionScores({});
      setCommitment(EMPTY_COMMITMENT);
      setWorkflowHistory([]);
      setCurrentStage(STAGES.SEED);
    } catch (err) {
      setError(err?.message || "Failed to start brainstorming. Please try again.");
      console.error(err);
    }
    setIsLoading(false);
  };

  const handleConfirmSeed = async () => {
    if (!seedData?.objective?.trim() || isLoading) return;
    setError("");
    setIsLoading(true);
    try {
      const rootId = "root-r1";
      const root = {
        id: rootId,
        content: seedData.userInput || inputValue,
        type: "root",
        parentId: null,
        isRoot: true,
        round: 1,
        expanded: false,
        origin: "human"
      };
      setAllNodes([root]);
      setActiveNodeId(rootId);
      setCurrentRound(1);
      setThinkingChain([root.content]);
      setCurrentStage(STAGES.EXPAND);
      setHintDismissed(false);
      setWorkflowHistory([]);
      panToPosition(computeForestLayout([root], metrics).get(rootId));
    } catch (err) {
      setError(err?.message || "Failed to open the idea canvas. Please try again.");
      console.error(err);
    }
    setIsLoading(false);
  };

  const handleBackToInput = () => {
    if (isLoading) return;
    setCurrentStage(STAGES.INPUT);
    setSeedData(null);
    setAllNodes([]);
    setActiveNodeId(null);
    setError("");
  };

  const handleGenerateStarters = async () => {
    if (isLoading || !seedData) return;
    const root = allNodes.find((node) => node.isRoot && (node.round || 1) === currentRound);
    const focus = activeNode && !activeNode.isRoot ? activeNode : root;
    if (!focus) return;
    setError("");
    setIsLoading(true);
    try {
      const parentChain = getPathContents(allNodes, focus.id);
      const ideas = await generateIdeaNodes(focus.content, {
        objective: seedData.objective,
        guiding_questions: seedData.guiding_questions,
        parentChain
      });
      pushWorkflowHistory("generate AI ideas");
      const children = filterFreshIdeas(ideas, allNodes).map((idea) => ({
        id: createNodeId("idea"),
        content: idea.content,
        type: idea.type,
        parentId: focus.id,
        isRoot: false,
        round: currentRound,
        expanded: false,
        origin: "ai",
        status: "new"
      }));
      const next = allNodes
        .map((node) => (node.id === focus.id ? { ...node, expanded: true } : node))
        .concat(children);
      setAllNodes(next);
      setStructureStale(directions.length > 0);
      panToPosition(computeForestLayout(next, metrics).get(focus.id));
    } catch (err) {
      setError(err?.message || "Failed to generate starter ideas. Please try again.");
      console.error(err);
    }
    setIsLoading(false);
  };

  // ---- Stage 2: click a node (expand if a leaf, else just focus) ----
  const handleNodeClick = async (nodeId) => {
    const node = allNodes.find((n) => n.id === nodeId);
    if (!node || isLoading) return;

    setActiveNodeId(node.id);
    setThinkingChain(getPathContents(allNodes, node.id));
    // Follow the clicked node's web. Without this, expanding a node from an
    // earlier round produced ideas that `currentRoundIdeas` silently ignored,
    // so they never reached clustering or the report.
    const nodeRound = node.round || 1;
    if (nodeRound !== currentRound) setCurrentRound(nodeRound);

    if (node.expanded) {
      panToPosition(layoutMap.get(node.id));
      return;
    }

    setError("");
    setIsLoading(true);
    setStructureStale(directions.length > 0);
    panToPosition(layoutMap.get(node.id));

    try {
      const parentChain = getPathContents(allNodes, node.id);
      const ideas = await generateIdeaNodes(node.content, {
        objective: seedData?.objective,
        guiding_questions: seedData?.guiding_questions,
        parentChain
      });
      const children = filterFreshIdeas(ideas, allNodes).map((idea) => ({
        id: createNodeId("idea"),
        content: idea.content,
        type: idea.type,
        parentId: node.id,
        isRoot: false,
        round: nodeRound,
        expanded: false,
        origin: "ai",
        status: "new"
      }));
      pushWorkflowHistory("expand idea");
      const next = allNodes
        .map((n) => (n.id === node.id ? { ...n, expanded: true } : n))
        .concat(children);
      setAllNodes(next);
      panToPosition(computeForestLayout(next, metrics).get(node.id));
    } catch (err) {
      setError(err?.message || "Failed to expand idea. Please try again.");
      console.error(err);
    }
    setIsLoading(false);
  };

  // Stable identity for ThinkNode's onSelect. handleNodeClick closes over
  // freshly-rendered state every pass, so route through a "latest ref":
  // memo(ThinkNode) then holds across the setState storm that panning produces.
  const nodeClickRef = useRef(null);
  useEffect(() => {
    nodeClickRef.current = handleNodeClick;
  });

  const handleSelectNode = useCallback((nodeId) => {
    nodeClickRef.current?.(nodeId);
  }, []);

  const handleAddIdea = (content, type = "opportunity") => {
    const currentRoot = allNodes.find((node) => node.isRoot && (node.round || 1) === currentRound);
    const parent = allNodes.find((node) => node.id === activeNodeId) || currentRoot;
    if (!parent) return;
    const normalizedContent = content.trim().toLowerCase();
    if (allNodes.some((node) => !node.isRoot && (node.round || 1) === currentRound && String(node.content || "").trim().toLowerCase() === normalizedContent)) {
      setError("That idea is already on this web. Try adding a sharper variation instead.");
      return;
    }
    pushWorkflowHistory("add an idea");
    const node = {
      id: createNodeId("human"),
      content: content.trim(),
      type,
      parentId: parent.id,
      isRoot: false,
      round: currentRound,
      expanded: false,
      origin: "human",
      status: "new"
    };
    const next = allNodes
      .map((existing) => (existing.id === parent.id ? { ...existing, expanded: true } : existing))
      .concat(node);
    setAllNodes(next);
    setActiveNodeId(node.id);
    setThinkingChain(getPathContents(next, node.id));
    setStructureStale(directions.length > 0);
    setSynthesis(null);
    panToPosition(computeForestLayout(next, metrics).get(node.id));
  };

  const handleSaveNode = (nodeId, content, type) => {
    const normalized = content.trim();
    if (!normalized) return;
    const node = allNodes.find((item) => item.id === nodeId);
    if (!node || node.isRoot) return;
    pushWorkflowHistory("edit an idea");
    setAllNodes((previous) => previous.map((item) => (
      item.id === nodeId ? { ...item, content: normalized, type } : item
    )));
    setStructureStale(directions.length > 0);
    setSynthesis(null);
  };

  const handleSetNodeStatus = (nodeId, status) => {
    const node = allNodes.find((item) => item.id === nodeId);
    if (!node || node.isRoot) return;
    pushWorkflowHistory(`${status === "shortlisted" ? "shortlist" : "park"} an idea`);
    setAllNodes((previous) => previous.map((item) => (
      item.id === nodeId ? { ...item, status: item.status === status ? "new" : status } : item
    )));
  };

  const handleDeleteNode = (nodeId) => {
    const node = allNodes.find((item) => item.id === nodeId);
    if (!node || node.isRoot) return;
    const hasChildren = allNodes.some((item) => item.parentId === nodeId);
    const message = hasChildren
      ? "Delete this idea and its whole branch? You can undo this."
      : "Delete this idea? You can undo this.";
    if (typeof window !== "undefined" && !window.confirm(message)) return;
    pushWorkflowHistory("delete an idea");
    const removed = getSubtreeIds(allNodes, nodeId);
    const next = allNodes.filter((item) => !removed.has(item.id));
    setAllNodes(next);
    const fallback = next.find((item) => item.isRoot && (item.round || 1) === currentRound) || next[0] || null;
    setActiveNodeId(fallback?.id || null);
    setThinkingChain(fallback ? getPathContents(next, fallback.id) : []);
    setStructureStale(directions.length > 0);
    setSynthesis(null);
  };

  // Generate an alternative branch without deleting the existing one.
  const handleRegenerate = async () => {
    const active = allNodes.find((n) => n.id === activeNodeId);
    if (!active || isLoading) return;

    setError("");
    setIsLoading(true);
    try {
      const parentChain = getPathContents(allNodes, active.id);
      const ideas = await generateIdeaNodes(active.content, {
        objective: seedData?.objective,
        guiding_questions: seedData?.guiding_questions,
        parentChain
      });
      const children = filterFreshIdeas(ideas, allNodes).map((idea) => ({
        id: createNodeId("idea"),
        content: idea.content,
        type: idea.type,
        parentId: active.id,
        isRoot: false,
        round: active.round || currentRound,
        expanded: false,
        origin: "ai",
        status: "new",
        variantOf: active.id
      }));
      pushWorkflowHistory("generate an alternative branch");
      const next = allNodes
        .map((node) => (node.id === active.id ? { ...node, expanded: true } : node))
        .concat(children);
      setAllNodes(next);
      panToPosition(computeForestLayout(next, metrics).get(active.id));
    } catch (err) {
      setError(err?.message || "Failed to regenerate. Please try again.");
      console.error(err);
    }
    setIsLoading(false);
  };

  // ---- Stage 3: structure (re-runnable — new ideas can be folded back in) ----
  const handleStructure = async () => {
    if (isLoading) return;
    // The button stays enabled so this message can actually explain itself,
    // instead of leaving a silently-dead control on the dock.
    if (currentRoundIdeas.length < 3) {
      setError(`Expand a few more nodes first — this web has ${currentRoundIdeas.length} of the 3 ideas needed to structure.`);
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
      pushWorkflowHistory("structure ideas");
      setDirections(dirs);
      directionEditHistoryRef.current = false;
      setSelectedDirectionId(dirs[0]?.direction_id || null);
      setEvaluationCriteria(DEFAULT_EVALUATION_CRITERIA);
      setDirectionScores(createEmptyDirectionScores(dirs));
      setStructureStale(false);
      // Re-clustering invalidates any report built from the old grouping.
      setSynthesis(null);
      setCurrentStage(STAGES.STRUCTURE);
      if (currentRoundIdeas.length > MAX_CLUSTER_NODES) {
        setError(`Structured the first ${MAX_CLUSTER_NODES} ideas of ${currentRoundIdeas.length} — the rest were left out of the grouping.`);
      }
    } catch (err) {
      setError(err?.message || "Failed to structure ideas. Please try again.");
      console.error(err);
    }
    setIsLoading(false);
  };

  const handleChangeDirection = (directionId, changes) => {
    if (!directionEditHistoryRef.current) {
      pushWorkflowHistory("edit a direction");
      directionEditHistoryRef.current = true;
    }
    setDirections((previous) => previous.map((direction) => (
      direction.direction_id === directionId ? { ...direction, ...changes } : direction
    )));
    setSynthesis(null);
  };

  const handleMoveIdea = (ideaId, targetDirectionId) => {
    pushWorkflowHistory("move an idea between directions");
    setDirections((previous) => previous.map((direction) => {
      const withoutIdea = (direction.idea_ids || []).filter((id) => id !== ideaId);
      if (direction.direction_id !== targetDirectionId) return { ...direction, idea_ids: withoutIdea };
      return { ...direction, idea_ids: [...withoutIdea, ideaId] };
    }));
    setSynthesis(null);
  };

  const handleAddDirection = () => {
    const usedIds = new Set(directions.map((direction) => direction.direction_id));
    let suffix = directions.length + 1;
    while (usedIds.has(`D${suffix}`)) suffix += 1;
    const direction = {
      direction_id: `D${suffix}`,
      title: "New direction",
      summary: "Add a direction for ideas that do not fit the initial grouping.",
      idea_ids: []
    };
    pushWorkflowHistory("add a direction");
    setDirections((previous) => [...previous, direction]);
    setSelectedDirectionId(direction.direction_id);
    setDirectionScores((previous) => ({ ...previous, [direction.direction_id]: {} }));
    setSynthesis(null);
  };

  const handleChangeCriterion = (criterionId, changes) => {
    setEvaluationCriteria((previous) => previous.map((criterion) => (
      criterion.id === criterionId ? { ...criterion, ...changes } : criterion
    )));
    setSynthesis(null);
  };

  const handleChangeScore = (directionId, criterionId, score) => {
    setDirectionScores((previous) => ({
      ...previous,
      [directionId]: { ...(previous[directionId] || {}), [criterionId]: score }
    }));
    setSynthesis(null);
  };

  const handleAddCriterion = () => {
    const id = `criterion_${Date.now()}`;
    setEvaluationCriteria((previous) => [...previous, { id, label: "Custom criterion", weight: 2 }]);
    setDirectionScores((previous) => Object.fromEntries(
      Object.entries(previous).map(([directionId, scoreMap]) => [directionId, { ...scoreMap, [id]: null }])
    ));
  };

  const handleRemoveCriterion = (criterionId) => {
    setEvaluationCriteria((previous) => previous.filter((criterion) => criterion.id !== criterionId));
    setDirectionScores((previous) => Object.fromEntries(
      Object.entries(previous).map(([directionId, scoreMap]) => {
        const next = { ...scoreMap };
        delete next[criterionId];
        return [directionId, next];
      })
    ));
    setSynthesis(null);
  };

  const handleBackToExpand = () => {
    setShowFinalOutput(false);
    setCurrentStage(STAGES.EXPAND);
    setStructureStale(true);
    directionEditHistoryRef.current = false;
  };

  // ---- Stage 4: synthesize (Pro deep summary) ----
  const handleSynthesize = async () => {
    if (!selectedDirectionId || !evaluationCriteria.length) {
      setError("Choose a direction and at least one evaluation criterion first.");
      return;
    }
    const selectedDirection = directions.find((direction) => direction.direction_id === selectedDirectionId);
    if (!selectedDirection?.title?.trim() || !(selectedDirection.idea_ids || []).length) {
      setError("Give your selected direction a title and move at least one idea into it before generating the report.");
      return;
    }
    const missingScore = directions.some((direction) => evaluationCriteria.some((criterion) => {
      const score = directionScores?.[direction.direction_id]?.[criterion.id];
      return !Number.isFinite(score) || score < 1 || score > 5;
    }));
    if (missingScore) {
      setError("Score every direction against each criterion before generating the report.");
      return;
    }
    setError("");
    setIsLoading(true);
    try {
      const sample = currentRoundIdeas.slice(0, MAX_CLUSTER_NODES);
      const synth = await generateSynthesis(
        seedData?.objective || thinkingChain[0],
        directions,
        sample.map((n) => ({ id: n.id, type: n.type, content: n.content })),
        {
          selected_direction_id: selectedDirectionId,
          criteria: evaluationCriteria.map(({ id, label, weight }) => ({ id, label, weight })),
          scores: directionScores
        }
      );
      // The user owns the decision. Keep the AI's analysis, but anchor the
      // report's selected direction to the explicit choice made in the panel.
      const anchored = {
        ...synth,
        comparison: { ...(synth?.comparison || {}), most_promising: selectedDirectionId },
        user_evaluation: { selected_direction_id: selectedDirectionId, criteria: evaluationCriteria }
      };
      pushWorkflowHistory("generate decision report");
      directionEditHistoryRef.current = false;
      setSynthesis(anchored);
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
      const root = { id: rootId, content: newTopic, type: "root", parentId: null, isRoot: true, round: nextRound, expanded: false, origin: "human" };

      const next = [...allNodes, root];
      pushWorkflowHistory("start a follow-up web");
      setAllNodes(next);
      setCurrentRound(nextRound);
      setActiveNodeId(rootId);
      setSeedData((prev) => ({ ...(prev || {}), objective: newObjective, currentTopic: newTopic }));
      setThinkingChain([newTopic]);
      setDirections([]);
      setSynthesis(null);
    setSelectedDirectionId(null);
    setDirectionScores({});
    setCommitment(EMPTY_COMMITMENT);
      setStructureStale(false);
      setShowFinalOutput(false);
      setCurrentStage(STAGES.EXPAND);
      panToPosition(computeForestLayout(next, metrics).get(rootId));
    } catch (err) {
      setError(err?.message || "Failed to grow the next web. Please try again.");
      console.error(err);
    }
    setIsLoading(false);
  };

  // ---- Export the whole web as an image ----
  // Rethrows after surfacing the error: FinalOutput awaits this to decide
  // between a success and a failure toast, and swallowing the rejection made
  // it report "downloaded" on top of the red error banner.
  const handleExportImage = useCallback(async () => {
    if (!allNodes.length) return;
    try {
      await exportWebImage(
        allNodes,
        layoutMap,
        TYPE_COLORS,
        seedData?.userInput || "ThinkStorm",
        `thinkstorm-${slugify(seedData?.userInput)}`
      );
    } catch (err) {
      setError(err?.message || "Failed to export web image.");
      console.error(err);
      throw err;
    }
  }, [allNodes, layoutMap, seedData]);

  // ---- Reset ----
  const handleReset = () => {
    if (allNodes.length && typeof window !== "undefined" && !window.confirm("Start over and clear this brainstorm? You can cancel to keep your work.")) return;
    safeStorage.remove(SESSION_STORAGE_KEY);
    safeStorage.remove(CAMERA_STORAGE_KEY);
    setSavedSession(null);
    setStructureStale(false);
    seedCacheRef.current = null;
    pointersRef.current.clear();
    pinchRef.current = null;
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
    setSelectedDirectionId(null);
    setEvaluationCriteria(DEFAULT_EVALUATION_CRITERIA);
    setDirectionScores({});
    setCommitment(EMPTY_COMMITMENT);
    setWorkflowHistory([]);
    directionEditHistoryRef.current = false;
    setShowFinalOutput(false);
    setError("");
    setIsPanningCanvas(false);
    dragPanStateRef.current = { isActive: false, pointerId: null, lastX: 0, lastY: 0 };
    nodeIdCounter.current = 0;
  };

  const activeNode = activeNodeId ? allNodes.find((n) => n.id === activeNodeId) : null;
  const canRegenerate = Boolean(activeNode) && !isLoading;
  const expandedHint = currentStage === STAGES.EXPAND && currentRoundIdeas.length > 0 && !hintDismissed && !isLoading;

  // Built inline rather than memoized: the action handlers close over fresh
  // state every render, so caching this array would capture stale ones.
  const dockItems = [
    ...(currentStage === STAGES.EXPAND ? [{
      key: "ai-starters",
      label: "Ask AI for five fresh angles",
      icon: <SparklesIcon size={18} />,
      onClick: handleGenerateStarters,
      disabled: isLoading,
      className: "primary"
    }] : []),
    ...(currentStage === STAGES.EXPAND && synthesis ? [{
      key: "previous-report",
      label: structureStale ? "View previous report" : "View report",
      icon: <SparklesIcon size={18} />,
      onClick: () => setShowFinalOutput(true),
      disabled: isLoading
    }] : []),
    {
      key: "regenerate",
      label: "Generate alternative branch",
      icon: <RefreshIcon size={18} />,
      onClick: handleRegenerate,
      disabled: !canRegenerate
    },
    {
      key: "export",
      label: "Save web image",
      icon: <DownloadIcon size={18} />,
      onClick: handleExportImage,
      disabled: isLoading
    },
    {
      // Available in both EXPAND and STRUCTURE so ideas added after the first
      // clustering can be folded back in instead of being silently dropped.
      key: "structure",
      label: structureStale
        ? "Restructure (new ideas added)"
        : currentStage === STAGES.EXPAND ? "Structure ideas" : "Restructure ideas",
      icon: <LayersIcon size={18} />,
      onClick: handleStructure,
      disabled: isLoading,
      className: `structure ${structureStale ? "is-stale" : ""}`
    },
    ...(currentStage === STAGES.STRUCTURE ? [{
      key: "synthesize",
      label: "Synthesize report",
      icon: <SparklesIcon size={18} />,
      onClick: handleSynthesize,
      disabled: isLoading,
      className: "primary"
    }] : []),
    ...(currentStage === STAGES.SYNTHESIZE ? [{
      key: "view-report",
      label: "View report",
      icon: <SparklesIcon size={18} />,
      onClick: () => setShowFinalOutput(true),
      disabled: isLoading,
      className: "primary"
    }, {
      key: "revisit",
      label: "Revisit ideas",
      icon: <LayersIcon size={18} />,
      onClick: handleBackToExpand,
      disabled: isLoading
    }] : []),
    ...(workflowHistory.length > 0 ? [{
      key: "undo",
      label: "Undo last workflow change",
      icon: <RefreshIcon size={18} />,
      onClick: handleUndoWorkflow,
      disabled: isLoading
    }] : []),
    { key: "reset", label: "Reset", icon: <TrashIcon size={18} />, onClick: handleReset, className: "reset" },
    { divider: true },
    { key: "zoom-in", label: "Zoom in", icon: <PlusIcon size={18} />, onClick: handleZoomIn },
    {
      key: "zoom-level",
      label: "Reset zoom",
      icon: `${Math.round(zoom * 100)}%`,
      onClick: handleZoomReset,
      className: "zoom-level"
    },
    { key: "zoom-out", label: "Zoom out", icon: <MinusIcon size={18} />, onClick: handleZoomOut },
    {
      key: "recenter",
      label: "Recenter",
      icon: <CrosshairIcon size={18} />,
      onClick: () => panToPosition(layoutMap.get(activeNodeId))
    },
    { key: "fit", label: "Fit all", icon: <MaximizeIcon size={18} />, onClick: handleFitAllNodes }
  ];

  return (
    <div className="brain-canvas-container">
      {/* Ambient aurora background — one WebGL pass replaces three blurred divs */}
      <div className="aurora-bg" aria-hidden="true">
        <Aurora colorStops={["#60a5fa", "#22d3ee", "#2dd4bf"]} amplitude={0.9} blend={0.55} speed={0.55} />
      </div>

      {/* Header — only once a topic has been submitted; the landing page is
          deliberately chrome-free so the hero carries the whole screen. */}
      {currentStage > STAGES.INPUT && (
      <Motion.header className="canvas-header" ref={headerRef} initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
        <h1 className="logo">
          <span className="logo-icon"><ZapIcon size={19} /></span>
          ThinkStorm
        </h1>

        <div className="header-info">
          <StageStepper steps={STAGE_LABELS.slice(1)} current={currentStage} />

          <div className="thinking-chain">
            {thinkingChain.map((item, i) => (
              <span key={i} className="chain-item" title={item}>
                {truncate(item, 20)}
                {i < thinkingChain.length - 1 && <span className="chain-arrow">→</span>}
              </span>
            ))}
          </div>
        </div>

        {seedData && currentStage >= STAGES.EXPAND && (
          <div className="header-right">
            <span className="node-counter" title="Ideas in this web">
              <CountUp to={currentRoundIdeas.length} duration={0.9} />
              <em>ideas</em>
            </span>
            {currentRound > 1 && <span className="round-badge">Web {currentRound}</span>}
            <div className="seed-badge" title={seedData.objective}>
              <TargetIcon size={14} />
              <span>{truncate(seedData.objective, 38)}</span>
            </div>
          </div>
        )}
      </Motion.header>
      )}

      {/* Landing */}
      {currentStage === STAGES.INPUT && (
        <Motion.div className="initial-input-container" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1 }}>
          {/* The h1 lives here on the landing page — the header logo is hidden
              until a topic exists, so the hero owns the top-level heading. */}
          <h1 className="input-title">
            {/* Every stop stays dark enough to read on the light background —
                the brand cyan (#18c6d6) only reaches ~1.9:1 here. */}
            <GradientText colors={["#0f172a", "#1a4fb0", "#0e7490", "#1a4fb0", "#0f172a"]} animationSpeed={11}>
              What do you want to brainstorm?
            </GradientText>
          </h1>
          <p className="input-subtitle">Frame the question, capture your own thoughts, then use AI to widen and test the possibilities.</p>
          <div className="input-wrapper">
            <div className="input-field">
              <div className="main-input-shell">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleStart()}
                  aria-label="Brainstorming topic"
                  className="main-input"
                  autoFocus
                />
                {/* Live placeholder — cycles the examples so the field reads as active */}
                {!inputValue && (
                  <span className="main-input-placeholder" aria-hidden="true">
                    e.g.&nbsp;<RotatingText texts={EXAMPLES} rotationInterval={3600} staggerDuration={0.012} />
                  </span>
                )}
              </div>
              {/* Magnet renders the wrapping div, so it — not the button —
                  is the flex item .input-field lays out. */}
              <Magnet className="start-magnet" padding={70} magnetStrength={5} disabled={isLoading || !inputValue.trim()}>
                <StarBorder
                  className="start-btn-star"
                  color="#18c6d6"
                  speed="5s"
                  onClick={handleStart}
                  disabled={!inputValue.trim() || isLoading}
                  aria-label={isLoading ? "Generating ideas" : "Start brainstorming"}
                >
                  {/* Icon-only: the arrow carries the meaning, and the label
                      lives on aria-label so it stays announced. */}
                  <span className="start-btn">
                    {isLoading
                      ? <span className="start-btn-spinner" aria-hidden="true" />
                      : <ArrowRightIcon size={20} />}
                  </span>
                </StarBorder>
              </Magnet>
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

      {currentStage === STAGES.SEED && (
        <SeedReviewPanel
          seedData={seedData}
          onChange={setSeedData}
          onConfirm={handleConfirmSeed}
          onBack={handleBackToInput}
          isLoading={isLoading}
        />
      )}

      {/* Canvas */}
      {currentStage >= STAGES.EXPAND && (
        <div
          className={`canvas-area ${isPanningCanvas ? "panning" : ""}`}
          ref={canvasRef}
          style={{ top: headerHeight }}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={stopCanvasPan}
          onPointerCancel={stopCanvasPan}
        >
          {/* Canvas grid locked to world space. Reads the camera from viewRef,
              so it repaints without ever re-rendering React. */}
          <Squares cameraRef={viewRef} squareSize={26} />

          <ClickSpark sparkColor="#2575e6" sparkCount={10} sparkRadius={26} duration={460}>
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
                    nodeId={node.id}
                    topic={node.content}
                    nodeType={node.type}
                    isRoot={node.isRoot}
                    isActive={node.id === activeNodeId}
                    isInChain={chainIds.has(node.id)}
                    isExpanded={node.expanded}
                    x={pos.x}
                    y={pos.y}
                    onSelect={handleSelectNode}
                    typeColor={TYPE_COLORS[node.type]}
                  />
                );
              })}
            </AnimatePresence>
          </div>
          </ClickSpark>

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
                {/* Touch devices get the short version — no cursor, no ⌘+scroll. */}
                <span>
                  {isCompact
                    ? <><strong>Tap a node</strong> to expand · <strong>pinch</strong> to zoom</>
                    : <><strong>Click any node</strong> to expand it · go back and branch others · <strong>⌘/Ctrl + scroll</strong> to zoom</>}
                </span>
                <button className="hint-close" onClick={() => setHintDismissed(true)} aria-label="Dismiss hint"><CloseIcon size={14} /></button>
              </Motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Combined dock — actions + view controls, with proximity magnification */}
      {currentStage >= STAGES.EXPAND && !showFinalOutput && (
        <Motion.div
          className={`side-dock ${isCompact ? "is-horizontal" : ""}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <Dock
            items={dockItems}
            orientation={isCompact ? "horizontal" : "vertical"}
            baseSize={isCompact ? 40 : 44}
            magnification={isCompact ? 40 : 58}
            distance={isCompact ? 0 : 130}
          />
        </Motion.div>
      )}

      {currentStage === STAGES.EXPAND && !showFinalOutput && (
        <IdeaWorkbench
          key={activeNode?.id || "no-active-node"}
          activeNode={activeNode}
          ideaCount={currentRoundIdeas.length}
          onAddIdea={handleAddIdea}
          onGenerateStarters={handleGenerateStarters}
          onSaveNode={handleSaveNode}
          onSetNodeStatus={handleSetNodeStatus}
          onDeleteNode={handleDeleteNode}
          isLoading={isLoading}
        />
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

      {currentStage === STAGES.STRUCTURE && !showFinalOutput && directions.length > 0 && (
        <StructureReviewPanel
          directions={directions}
          ideaNodes={currentRoundIdeas}
          selectedDirectionId={selectedDirectionId}
          onSelectDirection={setSelectedDirectionId}
          onChangeDirection={handleChangeDirection}
          onMoveIdea={handleMoveIdea}
          onAddDirection={handleAddDirection}
          criteria={evaluationCriteria}
          scores={directionScores}
          onChangeScore={handleChangeScore}
          onChangeCriterion={handleChangeCriterion}
          onAddCriterion={handleAddCriterion}
          onRemoveCriterion={handleRemoveCriterion}
          onBack={handleBackToExpand}
          onSynthesize={handleSynthesize}
          isLoading={isLoading}
        />
      )}

      {/* Error toast — announced to screen readers, self-dismissing */}
      <AnimatePresence>
        {error && (
          <Motion.div
            className="error-toast"
            role="alert"
            aria-live="assertive"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
          >
            <span>{error}</span>
            <button className="error-close" onClick={() => setError("")} aria-label="Dismiss message">×</button>
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
            evaluation={synthesis.user_evaluation}
            commitment={commitment}
            onChangeCommitment={setCommitment}
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
