import { useCallback, useRef } from "react";
import "./SpotlightCard.css";

/**
 * SpotlightCard — a radial glow that tracks the cursor across the card.
 * Pure CSS custom properties, so the glow is composited by the browser and
 * never triggers a React render.
 */
export default function SpotlightCard({
  children,
  className = "",
  spotlightColor = "rgba(37, 117, 230, 0.22)",
  ...rest
}) {
  const ref = useRef(null);

  const handleMove = useCallback((event) => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    node.style.setProperty("--spotlight-x", `${event.clientX - rect.left}px`);
    node.style.setProperty("--spotlight-y", `${event.clientY - rect.top}px`);
    node.style.setProperty("--spotlight-opacity", "1");
  }, []);

  const handleLeave = useCallback(() => {
    ref.current?.style.setProperty("--spotlight-opacity", "0");
  }, []);

  return (
    <div
      ref={ref}
      className={`spotlight-card ${className}`}
      style={{ "--spotlight-color": spotlightColor }}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      {...rest}
    >
      {children}
    </div>
  );
}
