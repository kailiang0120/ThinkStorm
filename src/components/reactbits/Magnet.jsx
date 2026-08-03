import { useCallback, useEffect, useRef, useState } from "react";
import { motion as Motion } from "motion/react";
import usePrefersReducedMotion from "./usePrefersReducedMotion";

/**
 * Magnet — pulls the wrapped element toward the cursor once it enters a
 * proximity radius. Listens on the window only while the pointer is nearby.
 */
export default function Magnet({
  children,
  padding = 90,
  disabled = false,
  magnetStrength = 3.5,
  className = "",
  spring = { type: "spring", stiffness: 220, damping: 18, mass: 0.4 },
  ...rest
}) {
  const ref = useRef(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const prefersReducedMotion = usePrefersReducedMotion();
  const isInert = disabled || prefersReducedMotion;

  const handleMove = useCallback((event) => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;

    if (Math.abs(dx) < rect.width / 2 + padding && Math.abs(dy) < rect.height / 2 + padding) {
      setOffset({ x: dx / magnetStrength, y: dy / magnetStrength });
    } else {
      setOffset((prev) => (prev.x === 0 && prev.y === 0 ? prev : { x: 0, y: 0 }));
    }
  }, [magnetStrength, padding]);

  useEffect(() => {
    if (isInert) return undefined;
    window.addEventListener("pointermove", handleMove, { passive: true });
    // Snap back to rest when magnetism is switched off (e.g. while loading).
    return () => {
      window.removeEventListener("pointermove", handleMove);
      setOffset({ x: 0, y: 0 });
    };
  }, [handleMove, isInert]);

  // Derived rather than stored, so disabling never leaves a stale offset behind.
  const target = isInert ? { x: 0, y: 0 } : offset;

  return (
    <Motion.div
      ref={ref}
      className={className}
      style={{ display: "inline-flex" }}
      animate={{ x: target.x, y: target.y }}
      transition={spring}
      {...rest}
    >
      {children}
    </Motion.div>
  );
}
