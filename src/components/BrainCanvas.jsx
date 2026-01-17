import { useState, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import ThinkNode from "./ThinkNode";
import ConnectionLine, { ConnectionGradients } from "./ConnectionLine";
import FinalOutput from "./FinalOutput";
import {
  interpretSeed,
  generateIdeaNodes,
  clusterIntoDirections,
  generateSynthesis
} from "../services/gemini";
import "./BrainCanvas.css";

// Canvas coordinate system - centered at origin
const CANVAS_CENTER = { x: 0, y: 0 };

// Stage constants
const STAGES = {
  INPUT: 0,
  SEED: 1,
  EXPAND: 2,
  STRUCTURE: 3,
  SYNTHESIZE: 4
};

const STAGE_LABELS = ["Input", "Seed", "Expand", "Structure", "Synthesize"];

// Type colors for idea nodes
const TYPE_COLORS = {
  problem: "#ef4444",
  method: "#3b82f6",
  application: "#10b981",
  assumption: "#f59e0b",
  opportunity: "#8b5cf6"
};

export default function BrainCanvas() {
  // Core state
  const [currentStage, setCurrentStage] = useState(STAGES.INPUT);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // Seed data
  const [seedData, setSeedData] = useState(null);

  // Canvas state (spider-web)
  const [allNodes, setAllNodes] = useState([]);
  const [connections, setConnections] = useState([]);
  const [activeNodeId, setActiveNodeId] = useState(null);
  const [thinkingChain, setThinkingChain] = useState([]);
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
  const canvasRef = useRef(null);

  // Structure & Synthesis
  const [directions, setDirections] = useState([]);
  const [synthesis, setSynthesis] = useState(null);
  const [showFinalOutput, setShowFinalOutput] = useState(false);

  // Get viewport center
  const getViewportCenter = useCallback(() => {
    const width = window.innerWidth;
    const height = window.innerHeight - 70;
    return { x: width / 2, y: height / 2 };
  }, []);

  // Pan camera to center on a node
  const panToNode = useCallback((nodePos) => {
    const viewport = getViewportCenter();
    setViewOffset({
      x: viewport.x - nodePos.x,
      y: viewport.y - nodePos.y
    });
  }, [getViewportCenter]);

  // Calculate radial positions around a parent node
  const calculateRadialPositions = useCallback((parentPos, count, startAngle = 0) => {
    const positions = [];
    const radius = 260 + count * 24;
    const angleSpread = Math.min(Math.PI * 1.2, Math.max(Math.PI * 0.7, count * 0.35));
    const baseAngle = startAngle + Math.PI / 2;

    for (let i = 0; i < count; i++) {
      const angle = baseAngle - angleSpread / 2 + (i * angleSpread) / (count - 1 || 1);
      positions.push({
        x: parentPos.x + Math.cos(angle) * radius,
        y: parentPos.y + Math.sin(angle) * radius,
        angle
      });
    }
    return positions;
  }, []);

  const MIN_NODE_DISTANCE = 190;

  const getPlacementObstacles = useCallback((activeId) => {
    if (!activeId) return [];
    const chain = new Set();
    let currentId = activeId;
    while (currentId) {
      const current = allNodes.find(n => n.id === currentId);
      if (!current) break;
      chain.add(current.id);
      currentId = current.parentId;
    }
    return allNodes.filter(n => chain.has(n.id));
  }, [allNodes]);

  const resolvePositions = useCallback((basePositions, obstacles) => {
    const occupied = obstacles.map(n => n.position);
    const resolved = [];
    const isFarEnough = (pos) => {
      return [...occupied, ...resolved].every(p => {
        const dx = p.x - pos.x;
        const dy = p.y - pos.y;
        return Math.hypot(dx, dy) >= MIN_NODE_DISTANCE;
      });
    };

    basePositions.forEach((base) => {
      let radiusBoost = 0;
      let angleShift = 0;
      let candidate = { x: base.x, y: base.y };
      let attempts = 0;
      while (!isFarEnough(candidate) && attempts < 18) {
        radiusBoost += 28;
        angleShift += 0.15;
        candidate = {
          x: base.x + Math.cos(base.angle + angleShift) * radiusBoost,
          y: base.y + Math.sin(base.angle + angleShift) * radiusBoost
        };
        attempts += 1;
      }
      resolved.push(candidate);
    });
    return resolved;
  }, []);

  // Get direction angle from parent's parent to parent
  const getParentAngle = useCallback((nodeId) => {
    const node = allNodes.find(n => n.id === nodeId);
    if (!node || !node.parentId) return 0;

    const parent = allNodes.find(n => n.id === node.parentId);
    if (!parent) return 0;

    return Math.atan2(node.position.y - parent.position.y, node.position.x - parent.position.x);
  }, [allNodes]);

  const chainNodeIds = useMemo(() => {
    if (!activeNodeId) return new Set();
    const ids = new Set();
    let currentId = activeNodeId;
    while (currentId) {
      ids.add(currentId);
      const current = allNodes.find(n => n.id === currentId);
      currentId = current?.parentId || null;
    }
    return ids;
  }, [activeNodeId, allNodes]);

  const visibleNodeIds = useMemo(() => {
    if (!activeNodeId) return new Set();
    const ids = new Set(chainNodeIds);
    allNodes
      .filter(n => n.parentId === activeNodeId && !chainNodeIds.has(n.id))
      .forEach(n => ids.add(n.id));
    return ids;
  }, [activeNodeId, allNodes, chainNodeIds]);

  // --- Stage 1: Start with Seed Interpretation ---
  const handleStart = async () => {
    if (!inputValue.trim()) return;

    setError("");
    setIsLoading(true);

    try {
      // First interpret the seed
      const seed = await interpretSeed(inputValue);
      setSeedData({
        userInput: inputValue,
        ...seed
      });

      // Create root node
      const rootNode = {
        id: "root",
        topic: inputValue,
        content: inputValue,
        type: "root",
        position: CANVAS_CENTER,
        isRoot: true,
        isInChain: true,
        parentId: null
      };

      setAllNodes([rootNode]);
      setActiveNodeId("root");
      setThinkingChain([inputValue]);
      panToNode(CANVAS_CENTER);

      // Generate initial idea nodes
      const ideaNodes = await generateIdeaNodes(inputValue, {
        objective: seed.objective,
        guiding_questions: seed.guiding_questions
      });

      const basePositions = calculateRadialPositions(CANVAS_CENTER, ideaNodes.length, 0);
      const positions = resolvePositions(basePositions, [rootNode]);

      const newNodes = ideaNodes.map((idea, i) => ({
        id: idea.id,
        topic: idea.content,
        content: idea.content,
        type: idea.type,
        position: positions[i],
        isRoot: false,
        isInChain: false,
        parentId: "root",
        expandable: idea.expandable
      }));

      const newConnections = newNodes.map(node => ({
        id: `conn-${node.id}`,
        from: CANVAS_CENTER,
        to: node.position,
        fromId: "root",
        toId: node.id,
        isInChain: false
      }));

      setAllNodes([rootNode, ...newNodes]);
      setConnections(newConnections);
      setCurrentStage(STAGES.EXPAND);
    } catch (err) {
      setError("Failed to start brainstorming. Please try again.");
      console.error(err);
    }

    setIsLoading(false);
  };

  // --- Stage 2: Handle clicking on a node to expand ---
  const handleNodeClick = async (clickedNode) => {
    if (isLoading || clickedNode.isInChain) return;

    setError("");
    setIsLoading(true);

    // Add to thinking chain
    const newChain = [...thinkingChain, clickedNode.content];
    setThinkingChain(newChain);

    // Mark this node as in-chain
    setAllNodes(prev => prev.map(n =>
      n.id === clickedNode.id ? { ...n, isInChain: true } : n
    ));

    // Mark connection to this node as in-chain
    setConnections(prev => prev.map(c =>
      c.toId === clickedNode.id ? { ...c, isInChain: true } : c
    ));

    setActiveNodeId(clickedNode.id);
    panToNode(clickedNode.position);

    const parentAngle = getParentAngle(clickedNode.id);
    const obstacles = getPlacementObstacles(clickedNode.id);

    try {
      const ideaNodes = await generateIdeaNodes(clickedNode.content, {
        objective: seedData?.objective,
        guiding_questions: seedData?.guiding_questions,
        parentChain: newChain
      });

      const basePositions = calculateRadialPositions(clickedNode.position, ideaNodes.length, parentAngle);
      const positions = resolvePositions(basePositions, obstacles);

      const timestamp = Date.now();
      const newNodes = ideaNodes.map((idea, i) => ({
        id: `${idea.id}_${timestamp}_${i}`,
        topic: idea.content,
        content: idea.content,
        type: idea.type,
        position: positions[i],
        isRoot: false,
        isInChain: false,
        parentId: clickedNode.id,
        expandable: idea.expandable
      }));

      const newConnections = newNodes.map(node => ({
        id: `conn-${node.id}`,
        from: clickedNode.position,
        to: node.position,
        fromId: clickedNode.id,
        toId: node.id,
        isInChain: false
      }));

      setAllNodes(prev => [...prev, ...newNodes]);
      setConnections(prev => [...prev, ...newConnections]);
    } catch (err) {
      setError("Failed to expand idea. Please try again.");
      console.error(err);
    }

    setIsLoading(false);
  };

  // Regenerate subtopics for active node
  const handleRegenerate = async () => {
    const activeNode = allNodes.find(n => n.id === activeNodeId);
    if (!activeNode || isLoading) return;

    setError("");
    setIsLoading(true);

    // Remove old non-chain children of active node
    const childIds = allNodes.filter(n => n.parentId === activeNodeId && !n.isInChain).map(n => n.id);

    setAllNodes(prev => prev.filter(n => !childIds.includes(n.id)));
    setConnections(prev => prev.filter(c => !childIds.includes(c.toId)));

    const parentAngle = getParentAngle(activeNodeId);
    const obstacles = getPlacementObstacles(activeNodeId);

    try {
      const ideaNodes = await generateIdeaNodes(activeNode.content, {
        objective: seedData?.objective,
        guiding_questions: seedData?.guiding_questions,
        parentChain: thinkingChain
      });

      const basePositions = calculateRadialPositions(activeNode.position, ideaNodes.length, parentAngle);
      const positions = resolvePositions(basePositions, obstacles);

      const timestamp = Date.now();
      const newNodes = ideaNodes.map((idea, i) => ({
        id: `${idea.id}_${timestamp}_${i}`,
        topic: idea.content,
        content: idea.content,
        type: idea.type,
        position: positions[i],
        isRoot: false,
        isInChain: false,
        parentId: activeNodeId,
        expandable: idea.expandable
      }));

      const newConnections = newNodes.map(node => ({
        id: `conn-${node.id}`,
        from: activeNode.position,
        to: node.position,
        fromId: activeNodeId,
        toId: node.id,
        isInChain: false
      }));

      setAllNodes(prev => [...prev, ...newNodes]);
      setConnections(prev => [...prev, ...newConnections]);
    } catch (err) {
      setError("Failed to regenerate. Please try again.");
      console.error(err);
    }

    setIsLoading(false);
  };

  // --- Stage 3: Structure into Directions ---
  const handleStructure = async () => {
    if (thinkingChain.length < 2) {
      setError("Please explore at least one idea before structuring.");
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      // Get all nodes in the thinking chain
      const chainNodes = allNodes.filter(n => n.isInChain && !n.isRoot);

      const dirs = await clusterIntoDirections(
        chainNodes.map(n => ({ id: n.id, type: n.type, content: n.content })),
        seedData?.objective || thinkingChain[0]
      );

      setDirections(dirs);
      setCurrentStage(STAGES.STRUCTURE);
    } catch (err) {
      setError("Failed to structure ideas. Please try again.");
      console.error(err);
    }

    setIsLoading(false);
  };

  // --- Stage 4: Synthesize ---
  const handleSynthesize = async () => {
    setError("");
    setIsLoading(true);

    try {
      const chainNodes = allNodes.filter(n => n.isInChain && !n.isRoot);

      const synth = await generateSynthesis(
        seedData?.objective || thinkingChain[0],
        directions,
        chainNodes.map(n => ({ id: n.id, type: n.type, content: n.content }))
      );

      setSynthesis(synth);
      setCurrentStage(STAGES.SYNTHESIZE);
      setShowFinalOutput(true);
    } catch (err) {
      setError("Failed to synthesize. Please try again.");
      console.error(err);
    }

    setIsLoading(false);
  };

  // Reset everything
  const handleReset = () => {
    setCurrentStage(STAGES.INPUT);
    setInputValue("");
    setSeedData(null);
    setAllNodes([]);
    setConnections([]);
    setActiveNodeId(null);
    setThinkingChain([]);
    setViewOffset({ x: 0, y: 0 });
    setDirections([]);
    setSynthesis(null);
    setShowFinalOutput(false);
    setError("");
  };

  const connectionOffsets = useMemo(() => {
    const offsets = new Map();
    const groupCounts = new Map();
    const groupCounters = new Map();

    connections.forEach(conn => {
      groupCounts.set(conn.fromId, (groupCounts.get(conn.fromId) || 0) + 1);
    });

    connections.forEach(conn => {
      const index = groupCounters.get(conn.fromId) || 0;
      groupCounters.set(conn.fromId, index + 1);
      const count = groupCounts.get(conn.fromId) || 1;
      const spread = 40;
      const offset = count === 1 ? 0 : (index - (count - 1) / 2) * (spread / Math.max(1, count - 1));
      offsets.set(conn.id, offset);
    });

    return offsets;
  }, [connections]);

  // Get clustered nodes for final output
  const clusteredNodes = useMemo(() => {
    return allNodes.filter(n => n.isInChain && !n.isRoot);
  }, [allNodes]);

  return (
    <div className="brain-canvas-container">
      {/* Cosmic Background */}
      <div className="cosmic-bg">
        <div className="stars" />
        <div className="stars-2" />
        <div className="nebula" />
      </div>

      {/* Header */}
      <motion.header
        className="canvas-header"
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
      >
        <h1 className="logo">
          <span className="logo-icon">⚡</span>
          ThinkStorm
        </h1>

        {currentStage > STAGES.INPUT && (
          <div className="header-info">
            {/* Stage Progress */}
            <div className="stage-progress">
              {STAGE_LABELS.slice(1).map((label, i) => (
                <div
                  key={label}
                  className={`stage-dot ${i + 1 <= currentStage ? 'active' : ''} ${i + 1 === currentStage ? 'current' : ''}`}
                >
                  <span className="stage-num">{i + 1}</span>
                  {i < 3 && <span className="stage-line" />}
                </div>
              ))}
            </div>

            {/* Thinking Chain */}
            <div className="thinking-chain">
              {thinkingChain.map((item, i) => (
                <span key={i} className="chain-item">
                  {item.length > 20 ? item.slice(0, 20) + "..." : item}
                  {i < thinkingChain.length - 1 && <span className="chain-arrow">→</span>}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Seed Info Badge */}
        {seedData && currentStage >= STAGES.EXPAND && (
          <div className="seed-badge" title={seedData.objective}>
            🎯 {seedData.objective?.slice(0, 40)}...
          </div>
        )}
      </motion.header>

      {/* Initial Input */}
      {currentStage === STAGES.INPUT && (
        <motion.div
          className="initial-input-container"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <h2 className="input-title">What do you want to brainstorm?</h2>
          <p className="input-subtitle">Enter a topic and let AI expand your thinking</p>
          <div className="input-wrapper">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleStart()}
              placeholder="e.g., AI research, Startup ideas, Product features..."
              className="main-input"
              autoFocus
            />
            <motion.button
              className="start-btn"
              onClick={handleStart}
              disabled={!inputValue.trim() || isLoading}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              {isLoading ? "Generating..." : "Start Brainstorming"}
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* Canvas Area with Spider-Web Nodes */}
      {currentStage >= STAGES.EXPAND && currentStage < STAGES.SYNTHESIZE && (
        <div className="canvas-area" ref={canvasRef}>
          <motion.div
            className="canvas-viewport"
            animate={{
              x: viewOffset.x,
              y: viewOffset.y
            }}
            transition={{
              type: "spring",
              stiffness: 100,
              damping: 20
            }}
          >
            {/* Connection Lines */}
            <svg className="connections-layer">
              <ConnectionGradients />
              <AnimatePresence>
                {connections
                  .filter(conn => visibleNodeIds.has(conn.fromId) && visibleNodeIds.has(conn.toId))
                  .map((conn) => (
                    <ConnectionLine
                      key={conn.id}
                      from={conn.from}
                      to={conn.to}
                      isInChain={conn.isInChain}
                      curveOffset={connectionOffsets.get(conn.id) || 0}
                    />
                  ))}
              </AnimatePresence>
            </svg>

            {/* Nodes */}
            <AnimatePresence>
              {allNodes
                .filter(node => visibleNodeIds.has(node.id))
                .map((node) => (
                  <ThinkNode
                    key={node.id}
                    topic={node.topic}
                    nodeType={node.type}
                    isRoot={node.isRoot}
                    isActive={node.id === activeNodeId}
                    isInChain={node.isInChain}
                    position={node.position}
                    onClick={() => handleNodeClick(node)}
                    typeColor={TYPE_COLORS[node.type]}
                    delay={0}
                  />
                ))}
            </AnimatePresence>
          </motion.div>

          {/* Loading Overlay */}
          {isLoading && (
            <motion.div
              className="loading-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="loading-spinner" />
              <span>AI is thinking...</span>
            </motion.div>
          )}
        </div>
      )}

      {/* Control Panel */}
      {currentStage >= STAGES.EXPAND && !showFinalOutput && (
        <motion.div
          className="control-panel-wrap"
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
        >
          <div className="control-panel">
            <button
              className="control-btn regenerate"
              onClick={handleRegenerate}
              disabled={isLoading}
            >
              🔄 Regenerate
            </button>

            {currentStage === STAGES.EXPAND && (
              <button
                className="control-btn structure"
                onClick={handleStructure}
                disabled={isLoading || thinkingChain.length < 2}
              >
                📊 Structure Ideas
              </button>
            )}

            {currentStage === STAGES.STRUCTURE && (
              <button
                className="control-btn generate"
                onClick={handleSynthesize}
                disabled={isLoading}
              >
                ✨ Synthesize Report
              </button>
            )}

            <button
              className="control-btn reset"
              onClick={handleReset}
            >
              🗑️ Reset
            </button>
          </div>

          {/* Directions Overview for Structure Stage */}
          {currentStage === STAGES.STRUCTURE && directions.length > 0 && (
            <motion.div
              className="directions-panel"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <h3>📂 Directions Found</h3>
              <div className="directions-list">
                {directions.map(dir => (
                  <div key={dir.direction_id} className="direction-chip">
                    <span className="dir-id">{dir.direction_id}</span>
                    <span className="dir-name">{dir.title}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </motion.div>
      )}

      {/* Error Display */}
      <AnimatePresence>
        {error && (
          <motion.div
            className="error-toast"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
          >
            {error}
            <button className="error-close" onClick={() => setError("")}>×</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Final Output */}
      <AnimatePresence>
        {showFinalOutput && synthesis && (
          <FinalOutput
            synthesis={synthesis}
            seedData={seedData}
            directions={directions}
            ideaNodes={clusteredNodes}
            onClose={() => setShowFinalOutput(false)}
            onReset={handleReset}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
