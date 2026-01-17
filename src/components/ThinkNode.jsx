import { motion } from "motion/react";
import "./ThinkNode.css";

// Type labels for display
const TYPE_LABELS = {
  problem: "🔴",
  method: "🔵",
  application: "🟢",
  assumption: "🟡",
  opportunity: "🟣",
  root: "⚡"
};

export default function ThinkNode({
  topic,
  nodeType = "opportunity",
  isRoot = false,
  isActive = false,
  isInChain = false,
  onClick,
  position,
  typeColor,
  delay = 0
}) {
  const typeIndicator = TYPE_LABELS[nodeType] || TYPE_LABELS.opportunity;

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
            : typeColor
              ? `0 0 40px ${typeColor}40`
              : "0 0 40px rgba(139, 92, 246, 0.5)"
        }}
        whileTap={{ scale: 0.95 }}
        onClick={onClick}
        style={typeColor && !isRoot && !isInChain ? {
          borderColor: typeColor,
          boxShadow: `0 0 20px ${typeColor}30`
        } : {}}
      >
        {/* Type Indicator */}
        {!isRoot && (
          <span className="node-type-indicator" title={nodeType}>
            {typeIndicator}
          </span>
        )}

        <span className="node-text">{topic}</span>
        {isActive && <div className="pulse-ring" />}
      </motion.div>
    </div>
  );
}
