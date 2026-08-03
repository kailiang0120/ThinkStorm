import { memo, useCallback } from "react";
import { motion as Motion } from "motion/react";
import { CategoryIcon, PlusIcon } from "./Icons";
import SpotlightCard from "./reactbits/SpotlightCard";
import GlareHover from "./reactbits/GlareHover";
import "./ThinkNode.css";

const TYPE_LABELS = {
  problem: "Problem",
  method: "Method",
  application: "Application",
  assumption: "Assumption",
  opportunity: "Opportunity"
};

/**
 * A single card in the idea web.
 *
 * Memoized and driven by primitive props (x/y rather than a position object,
 * nodeId rather than the node) so that panning the canvas — which fires
 * setState on every pointermove — does not reconcile the whole forest.
 *
 * The pulse ring and expand hint sit outside the card element because both
 * SpotlightCard and GlareHover clip their overflow.
 */
function ThinkNode({
  nodeId,
  topic,
  nodeType = "opportunity",
  isRoot = false,
  isActive = false,
  isInChain = false,
  isExpanded = false,
  onSelect,
  x = 0,
  y = 0,
  typeColor,
  delay = 0
}) {
  const label = TYPE_LABELS[nodeType] || TYPE_LABELS.opportunity;
  const showExpandHint = !isRoot && !isExpanded;

  const handleActivate = useCallback(() => onSelect?.(nodeId), [onSelect, nodeId]);

  const handleKeyDown = useCallback((event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect?.(nodeId);
    }
  }, [onSelect, nodeId]);

  // Expose the category color to CSS so accents/tints stay in sync.
  const colorVars = !isRoot
    ? { "--node-color": typeColor || "var(--c-opportunity)" }
    : undefined;

  const cardClass = `think-node ${isActive ? "active" : ""} ${isInChain ? "in-chain" : ""}`;
  const cardProps = {
    role: "button",
    tabIndex: 0,
    onClick: handleActivate,
    onKeyDown: handleKeyDown
  };

  const body = (
    <>
      {isRoot ? (
        <span className="node-root-badge">
          <img className="node-root-logo" src="/thinkstorm-logo.png" alt="" aria-hidden="true" />
          Topic
        </span>
      ) : (
        <span className="node-category">
          <CategoryIcon type={nodeType} size={13} />
          {label}
        </span>
      )}
      <span className="node-text">{topic}</span>
    </>
  );

  return (
    <div className="think-node-wrapper" style={{ left: x, top: y }}>
      <Motion.div
        className={`think-node-shell ${isRoot ? "root" : ""}`}
        style={colorVars}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 25, delay }}
        whileHover={{ y: -4 }}
        whileTap={{ scale: 0.97 }}
      >
        {isRoot ? (
          // The root node gets a specular sweep; idea cards get a cursor spotlight.
          <GlareHover
            className={`${cardClass} root`}
            glareOpacity={0.28}
            glareAngle={-40}
            duration={850}
            aria-label={`Root topic: ${topic}`}
            {...cardProps}
          >
            {body}
          </GlareHover>
        ) : (
          <SpotlightCard
            className={cardClass}
            spotlightColor={`color-mix(in srgb, ${typeColor || "#efb0d2"} 38%, transparent)`}
            aria-label={`${label}: ${topic}`}
            {...cardProps}
          >
            {body}
          </SpotlightCard>
        )}

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

export default memo(ThinkNode);
