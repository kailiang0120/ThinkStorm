import { useCallback, useEffect, useRef } from "react";
import usePrefersReducedMotion from "./usePrefersReducedMotion";

/**
 * ClickSpark — radial spark burst on click, drawn on a transparent canvas
 * overlay. Dependency-free; never re-renders (the animation lives entirely in
 * a ref-driven rAF loop, so it stays off React's render path).
 */
export default function ClickSpark({
  sparkColor = "#2575e6",
  sparkSize = 11,
  sparkRadius = 22,
  sparkCount = 9,
  duration = 420,
  easing = "ease-out",
  extraScale = 1,
  children
}) {
  const canvasRef = useRef(null);
  const sparksRef = useRef([]);
  const frameRef = useRef(0);
  const prefersReducedMotion = usePrefersReducedMotion();

  // Keep the backing store in sync with the element's box (and DPR).
  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return undefined;

    let resizeTimer = 0;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = parent.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const observer = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(resize, 80);
    });
    observer.observe(parent);
    resize();

    return () => {
      window.clearTimeout(resizeTimer);
      observer.disconnect();
    };
  }, []);

  const ease = useCallback((t) => {
    switch (easing) {
      case "linear": return t;
      case "ease-in": return t * t;
      case "ease-in-out": return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      default: return t * (2 - t);
    }
  }, [easing]);

  // Single rAF loop, started lazily and stopped as soon as the canvas is idle.
  // Named function expression so the loop can schedule itself without the
  // callback having to reference its own binding before it is declared.
  const tick = useCallback(function step() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) {
      frameRef.current = 0;
      return;
    }

    const now = performance.now();
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

    sparksRef.current = sparksRef.current.filter((spark) => {
      const elapsed = now - spark.startTime;
      if (elapsed >= duration) return false;

      const progress = ease(elapsed / duration);
      const distance = progress * sparkRadius * extraScale;
      const lineLength = sparkSize * (1 - progress);
      const x1 = spark.x + distance * Math.cos(spark.angle);
      const y1 = spark.y + distance * Math.sin(spark.angle);
      const x2 = spark.x + (distance + lineLength) * Math.cos(spark.angle);
      const y2 = spark.y + (distance + lineLength) * Math.sin(spark.angle);

      ctx.strokeStyle = spark.color;
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.globalAlpha = 1 - progress;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      return true;
    });

    ctx.globalAlpha = 1;
    frameRef.current = sparksRef.current.length ? requestAnimationFrame(step) : 0;
  }, [duration, ease, extraScale, sparkRadius, sparkSize]);

  useEffect(() => () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
  }, []);

  const handleClick = useCallback((event) => {
    if (prefersReducedMotion) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const startTime = performance.now();
    const color = typeof sparkColor === "function" ? sparkColor(event) : sparkColor;

    for (let i = 0; i < sparkCount; i += 1) {
      sparksRef.current.push({ x, y, color, angle: (2 * Math.PI * i) / sparkCount, startTime });
    }

    if (!frameRef.current) frameRef.current = requestAnimationFrame(tick);
  }, [prefersReducedMotion, sparkColor, sparkCount, tick]);

  return (
    <div className="clickspark-root" style={{ position: "relative", width: "100%", height: "100%" }} onClick={handleClick}>
      {children}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 400 }}
      />
    </div>
  );
}
