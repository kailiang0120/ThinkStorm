import { useState, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import ThinkNode from "./ThinkNode";
import ConnectionLine, { ConnectionGradients } from "./ConnectionLine";
import FinalOutput from "./FinalOutput";
import { generateSubtopics, generateFinalContent } from "../services/gemini";
import "./BrainCanvas.css";

// Canvas coordinate system - centered at origin
const CANVAS_CENTER = { x: 0, y: 0 };

export default function BrainCanvas() {
  const [rootTopic, setRootTopic] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [allNodes, setAllNodes] = useState([]); // All nodes in the web
  const [connections, setConnections] = useState([]); // All connections
  const [activeNodeId, setActiveNodeId] = useState(null);
  const [thinkingChain, setThinkingChain] = useState([]);
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [showFinalOutput, setShowFinalOutput] = useState(false);
  const [finalContent, setFinalContent] = useState("");
  const [customInput, setCustomInput] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [error, setError] = useState("");
  const canvasRef = useRef(null);

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

  // Start brainstorming
  const handleStart = async () => {
    if (!inputValue.trim()) return;
    
    setError("");
    setIsLoading(true);
    setRootTopic(inputValue);
    setThinkingChain([inputValue]);
    
    const rootNode = {
      id: "root",
      topic: inputValue,
      position: CANVAS_CENTER,
      isRoot: true,
      isInChain: true,
      parentId: null
    };
    
    setAllNodes([rootNode]);
    setActiveNodeId("root");
    panToNode(CANVAS_CENTER);
    
    try {
      const subtopics = await generateSubtopics(inputValue, [inputValue]);
      const basePositions = calculateRadialPositions(CANVAS_CENTER, subtopics.length, 0);
      const positions = resolvePositions(basePositions, [rootNode]);
      
      const newNodes = subtopics.map((topic, i) => ({
        id: `node-${Date.now()}-${i}`,
        topic,
        position: positions[i],
        isRoot: false,
        isInChain: false,
        parentId: "root"
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
    } catch (err) {
      setError("Failed to generate subtopics. Please try again.");
    }
    
    setIsLoading(false);
  };

  // Handle clicking on a node
  const handleNodeClick = async (clickedNode) => {
    if (isLoading || clickedNode.isInChain) return;
    
    setError("");
    setIsLoading(true);
    
    // Add to thinking chain
    const newChain = [...thinkingChain, clickedNode.topic];
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
    
    // Pan to the clicked node
    panToNode(clickedNode.position);
    
    // Calculate angle for new subtopics based on incoming direction
    const parentAngle = getParentAngle(clickedNode.id);
    const obstacles = getPlacementObstacles(clickedNode.id);
    
    try {
      const subtopics = await generateSubtopics(clickedNode.topic, newChain);
      const basePositions = calculateRadialPositions(clickedNode.position, subtopics.length, parentAngle);
      const positions = resolvePositions(basePositions, obstacles);
      
      const newNodes = subtopics.map((topic, i) => ({
        id: `node-${Date.now()}-${i}`,
        topic,
        position: positions[i],
        isRoot: false,
        isInChain: false,
        parentId: clickedNode.id
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
      setError("Failed to generate subtopics. Please try again.");
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
      const subtopics = await generateSubtopics(activeNode.topic, thinkingChain);
      const basePositions = calculateRadialPositions(activeNode.position, subtopics.length, parentAngle);
      const positions = resolvePositions(basePositions, obstacles);
      
      const newNodes = subtopics.map((topic, i) => ({
        id: `node-${Date.now()}-${i}`,
        topic,
        position: positions[i],
        isRoot: false,
        isInChain: false,
        parentId: activeNodeId
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
    }
    
    setIsLoading(false);
  };

  // Add custom subtopic
  const handleAddCustom = async () => {
    if (!customInput.trim()) return;
    
    const activeNode = allNodes.find(n => n.id === activeNodeId);
    if (!activeNode) return;
    
    const words = customInput.trim().split(/\s+/).slice(0, 5);
    const limitedTopic = words.join(" ");
    
    // Find a position for the custom node
    const existingChildren = allNodes.filter(n => n.parentId === activeNodeId);
    const angle = Math.PI / 2 + (existingChildren.length * 0.5);
    const basePosition = {
      x: activeNode.position.x + Math.cos(angle) * 280,
      y: activeNode.position.y + Math.sin(angle) * 280,
      angle
    };
    const obstacles = getPlacementObstacles(activeNodeId);
    const [position] = resolvePositions([basePosition], obstacles);
    
    const newNode = {
      id: `custom-${Date.now()}`,
      topic: limitedTopic,
      position,
      isRoot: false,
      isInChain: false,
      parentId: activeNodeId
    };
    
    const newConnection = {
      id: `conn-${newNode.id}`,
      from: activeNode.position,
      to: position,
      fromId: activeNodeId,
      toId: newNode.id,
      isInChain: false
    };
    
    setAllNodes(prev => [...prev, newNode]);
    setConnections(prev => [...prev, newConnection]);
    setCustomInput("");
    setShowCustomInput(false);
  };

  // Generate final content
  const handleGenerateFinal = async () => {
    if (thinkingChain.length < 2) {
      setError("Please explore at least one subtopic before generating.");
      return;
    }
    
    setError("");
    setIsLoading(true);
    
    try {
      const content = await generateFinalContent(thinkingChain);
      setFinalContent(content);
      setShowFinalOutput(true);
    } catch (err) {
      setError("Failed to generate final content. Please try again.");
    }
    
    setIsLoading(false);
  };

  // Reset everything
  const handleReset = () => {
    setRootTopic("");
    setInputValue("");
    setAllNodes([]);
    setConnections([]);
    setActiveNodeId(null);
    setThinkingChain([]);
    setViewOffset({ x: 0, y: 0 });
    setShowFinalOutput(false);
    setFinalContent("");
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
        
        {thinkingChain.length > 0 && (
          <div className="thinking-chain">
            {thinkingChain.map((item, i) => (
              <span key={i} className="chain-item">
                {item}
                {i < thinkingChain.length - 1 && <span className="chain-arrow">→</span>}
              </span>
            ))}
          </div>
        )}
      </motion.header>

      {/* Initial Input - Properly Centered */}
      {!rootTopic && (
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
              placeholder="e.g., Business, Technology, Art..."
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

      {/* Canvas Area with Viewport Panning */}
      {rootTopic && (
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
                    isRoot={node.isRoot}
                    isActive={node.id === activeNodeId}
                    isInChain={node.isInChain}
                    position={node.position}
                    onClick={() => handleNodeClick(node)}
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

      {/* Control Panel - Properly Centered */}
      {rootTopic && !showFinalOutput && (
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
            
            <button 
              className="control-btn custom"
              onClick={() => setShowCustomInput(!showCustomInput)}
            >
              ✏️ Custom Input
            </button>
            
            <button 
              className="control-btn generate"
              onClick={handleGenerateFinal}
              disabled={isLoading || thinkingChain.length < 2}
            >
              ✨ Generate Proposal
            </button>
            
            <button 
              className="control-btn reset"
              onClick={handleReset}
            >
              🗑️ Reset
            </button>
          </div>
        </motion.div>
      )}

      {/* Custom Input Modal */}
      <AnimatePresence>
        {showCustomInput && (
          <motion.div 
            className="custom-input-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div 
              className="modal-content"
              initial={{ scale: 0.85, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.85, y: 20 }}
            >
              <h3>Add Your Own Subtopic</h3>
              <p className="modal-hint">Maximum 5 words</p>
              <input
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddCustom()}
                placeholder="Enter your idea..."
                autoFocus
              />
              <div className="modal-actions">
                <button onClick={handleAddCustom} className="add-btn">Add</button>
                <button onClick={() => setShowCustomInput(false)} className="cancel-btn">Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
          </motion.div>
        )}
      </AnimatePresence>

      {/* Final Output */}
      <AnimatePresence>
        {showFinalOutput && (
          <FinalOutput 
            content={finalContent}
            thinkingChain={thinkingChain}
            onClose={() => setShowFinalOutput(false)}
            onReset={handleReset}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
