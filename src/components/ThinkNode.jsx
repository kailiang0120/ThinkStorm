import { motion } from "motion/react";
import "./ThinkNode.css";

export default function ThinkNode({ 
  topic, 
  isRoot = false, 
  isActive = false, 
  isInChain = false,
  onClick, 
  position,
  delay = 0 
}) {
  return (
    <div
      className="think-node-wrapper"
      style={position ? { left: position.x, top: position.y } : {}}
    >
      <motion.div
        className={`think-node ${isRoot ? "root" : ""} ${isActive ? "active" : ""} ${isInChain ? "in-chain" : ""}`}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0, opacity: 0 }}
        transition={{ 
          type: "spring", 
          stiffness: 300, 
          damping: 25,
          delay 
        }}
        whileHover={{ 
          scale: 1.08, 
          boxShadow: isInChain 
            ? "0 0 40px rgba(16, 185, 129, 0.5)" 
            : "0 0 40px rgba(139, 92, 246, 0.5)" 
        }}
        whileTap={{ scale: 0.95 }}
        onClick={onClick}
      >
        <span className="node-text">{topic}</span>
        {isActive && <div className="pulse-ring" />}
      </motion.div>
    </div>
  );
}
