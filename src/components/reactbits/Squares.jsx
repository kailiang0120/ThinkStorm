import { memo, useEffect, useRef } from "react";

/**
 * Squares — a canvas grid locked to the graph's world space.
 *
 * Reads the camera from a ref instead of props, so panning and zooming never
 * re-render React; a single rAF loop redraws only when the camera actually
 * moved. Replaces the old CSS `background-position` grid, which could not
 * render a hovered cell.
 */
function Squares({
  cameraRef,
  squareSize = 26,
  borderColor = "rgba(37, 117, 230, 0.14)",
  hoverFillColor = "rgba(37, 117, 230, 0.10)",
  enableHover = true
}) {
  const canvasRef = useRef(null);
  const hoverRef = useRef(null);
  const lastRef = useRef({ x: NaN, y: NaN, z: NaN, w: 0, h: 0, hx: NaN, hy: NaN });

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    let frame = 0;
    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = parent.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lastRef.current.z = NaN; // force a redraw
    };

    const draw = () => {
      const { zoom = 1, offset = { x: 0, y: 0 } } = cameraRef.current || {};
      const hover = hoverRef.current;
      const last = lastRef.current;
      const hx = hover?.x ?? NaN;
      const hy = hover?.y ?? NaN;

      // Skip the frame entirely when nothing moved.
      const unchanged = last.x === offset.x && last.y === offset.y && last.z === zoom
        && last.w === width && last.h === height
        && (last.hx === hx || (Number.isNaN(last.hx) && Number.isNaN(hx)))
        && (last.hy === hy || (Number.isNaN(last.hy) && Number.isNaN(hy)));
      if (unchanged) {
        frame = requestAnimationFrame(draw);
        return;
      }
      lastRef.current = { x: offset.x, y: offset.y, z: zoom, w: width, h: height, hx, hy };

      const step = squareSize * zoom;
      ctx.clearRect(0, 0, width, height);
      if (step < 4) {
        frame = requestAnimationFrame(draw);
        return;
      }

      // Screen-space position of world origin, wrapped into the first cell.
      const startX = offset.x % step;
      const startY = offset.y % step;

      if (enableHover && hover) {
        const cellX = Math.floor((hover.x - startX) / step) * step + startX;
        const cellY = Math.floor((hover.y - startY) / step) * step + startY;
        ctx.fillStyle = hoverFillColor;
        ctx.fillRect(cellX, cellY, step, step);
      }

      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = startX; x <= width; x += step) {
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, height);
      }
      for (let x = startX - step; x >= 0; x -= step) {
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, height);
      }
      for (let y = startY; y <= height; y += step) {
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(width, Math.round(y) + 0.5);
      }
      for (let y = startY - step; y >= 0; y -= step) {
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(width, Math.round(y) + 0.5);
      }
      ctx.stroke();

      // Radial fade so the grid dissolves toward the edges.
      const gradient = ctx.createRadialGradient(
        width / 2, height * 0.45, 0,
        width / 2, height * 0.45, Math.max(width, height) * 0.72
      );
      gradient.addColorStop(0, "rgba(0,0,0,0)");
      gradient.addColorStop(0.55, "rgba(0,0,0,0)");
      gradient.addColorStop(1, "rgba(0,0,0,1)");
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "source-over";

      frame = requestAnimationFrame(draw);
    };

    const onPointerMove = (event) => {
      const rect = parent.getBoundingClientRect();
      hoverRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const onPointerLeave = () => { hoverRef.current = null; };

    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    resize();

    if (enableHover) {
      parent.addEventListener("pointermove", onPointerMove, { passive: true });
      parent.addEventListener("pointerleave", onPointerLeave);
    }
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      parent.removeEventListener("pointermove", onPointerMove);
      parent.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [cameraRef, squareSize, borderColor, hoverFillColor, enableHover]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}
    />
  );
}

// Props are static after mount — the camera arrives via ref.
export default memo(Squares);
