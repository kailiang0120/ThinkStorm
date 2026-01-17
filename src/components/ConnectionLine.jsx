import { motion } from "motion/react";

export default function ConnectionLine({ from, to, isInChain = false, curveOffset = 0 }) {
  if (!from || !to) return null;

  // Calculate SVG line coordinates
  const x1 = from.x;
  const y1 = from.y;
  const x2 = to.x;
  const y2 = to.y;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const cx = mx + nx * curveOffset;
  const cy = my + ny * curveOffset;
  const path = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;

  return (
    <motion.path
      d={path}
      stroke={isInChain ? "url(#chainGradient)" : "url(#subtopicGradient)"}
      strokeWidth={isInChain ? 3 : 2}
      strokeLinecap="round"
      fill="none"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      style={{
        filter: isInChain ? "drop-shadow(0 0 8px rgba(16, 185, 129, 0.5))" : "none"
      }}
    />
  );
}

// SVG Gradients component to include in the SVG
export function ConnectionGradients() {
  return (
    <defs>
      <linearGradient id="chainGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#10b981" />
        <stop offset="100%" stopColor="#06b6d4" />
      </linearGradient>
      <linearGradient id="subtopicGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="rgba(139, 92, 246, 0.6)" />
        <stop offset="100%" stopColor="rgba(6, 182, 212, 0.6)" />
      </linearGradient>
    </defs>
  );
}
