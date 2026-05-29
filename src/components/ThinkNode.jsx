import { motion as Motion } from "motion/react";
import { CategoryIcon, ZapIcon, PlusIcon } from "./Icons";
import "./ThinkNode.css";

const TYPE_LABELS = {
  problem: "Problem",
  method: "Method",
  application: "Application",
  assumption: "Assumption",
  opportunity: "Opportunity"
};

export default function ThinkNode({
  topic,
  nodeType = "opportunity",
  isRoot = false,
  isActive = false,
  isInChain = false,
  isExpanded = false,
  onClick,
  position,
  typeColor,
  delay = 0
}) {
  const label = TYPE_LABELS[nodeType] || TYPE_LABELS.opportunity;
  const showExpandHint = !isRoot && !isExpanded;

  // Expose the category color to CSS so accents/tints stay in sync.
  const colorVars = !isRoot
    ? { "--node-color": typeColor || "var(--c-opportunity)" }
    : undefined;

  return (
    <div
      className="think-node-wrapper"
      style={position ? { left: position.x, top: position.y } : {}}
    >
      <Motion.div
        className={`think-node ${isRoot ? "root" : ""} ${isActive ? "active" : ""} ${isInChain ? "in-chain" : ""}`}
        style={colorVars}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 25, delay }}
        whileHover={{ y: -4 }}
        whileTap={{ scale: 0.97 }}
        onClick={onClick}
        role="button"
        tabIndex={0}
        aria-label={`${isRoot ? "Root topic" : label}: ${topic}`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick?.();
          }
        }}
      >
        {isRoot ? (
          <span className="node-root-badge">
            <ZapIcon size={15} />
            Topic
          </span>
        ) : (
          <span className="node-category">
            <CategoryIcon type={nodeType} size={13} />
            {label}
          </span>
        )}

        <span className="node-text">{topic}</span>

        {showExpandHint && (
          <span className="node-expand-hint" aria-hidden="true">
            <PlusIcon size={13} />
          </span>
        )}

        {isActive && <span className="node-ring" aria-hidden="true" />}
      </Motion.div>
    </div>
  );
}
