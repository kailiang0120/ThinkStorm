import { motion as Motion } from "motion/react";

export default function ConnectionLine({ from, to, isInChain = false, color, dashed = false }) {
  if (!from || !to) return null;

  const x1 = from.x;
  const y1 = from.y;
  const x2 = to.x;
  const y2 = to.y;
  // Smooth horizontal S-curve: control points extend sideways from each end,
  // the classic flowing mind-map connector for a left-to-right tree.
  const dx = x2 - x1;
  const cp = Math.max(50, Math.abs(dx) * 0.5);
  const path = `M ${x1} ${y1} C ${x1 + cp} ${y1}, ${x2 - cp} ${y2}, ${x2} ${y2}`;

  const stroke = isInChain ? "url(#chainGradient)" : (color || "#94a3b8");

  return (
    <Motion.path
      d={path}
      stroke={stroke}
      strokeWidth={isInChain ? 3.25 : 2.5}
      strokeLinecap="round"
      strokeDasharray={dashed ? "7 7" : undefined}
      fill="none"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: isInChain ? 0.95 : (dashed ? 0.6 : 0.82) }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      style={{
        filter: isInChain
          ? "drop-shadow(0 2px 5px rgba(37, 117, 230, 0.35))"
          : "none"
      }}
    />
  );
}

// SVG gradient used for the active "thinking chain" path.
export function ConnectionGradients() {
  return (
    <defs>
      <linearGradient
        id="chainGradient"
        gradientUnits="userSpaceOnUse"
        x1="0%"
        y1="0%"
        x2="100%"
        y2="100%"
      >
        <stop offset="0%" stopColor="#2575e6" />
        <stop offset="100%" stopColor="#18c6d6" />
      </linearGradient>
    </defs>
  );
}
