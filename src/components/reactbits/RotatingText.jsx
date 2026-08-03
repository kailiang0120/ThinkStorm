import { useCallback, useEffect, useMemo, useState } from "react";
import { motion as Motion, AnimatePresence } from "motion/react";
import usePrefersReducedMotion from "./usePrefersReducedMotion";
import "./RotatingText.css";

/**
 * RotatingText — cycles through a list of strings, animating each character
 * with a staggered slide. Used to make the landing placeholder feel live.
 */
export default function RotatingText({
  texts = [],
  rotationInterval = 2600,
  staggerDuration = 0.018,
  className = "",
  splitBy = "characters",
  transition = { type: "spring", damping: 26, stiffness: 320 },
  initial = { y: "100%", opacity: 0 },
  animate = { y: 0, opacity: 1 },
  exit = { y: "-110%", opacity: 0 },
  auto = true
}) {
  const [index, setIndex] = useState(0);
  const prefersReducedMotion = usePrefersReducedMotion();
  const current = texts[index] ?? "";

  const units = useMemo(() => {
    if (splitBy === "words") return current.split(" ").map((w, i, a) => (i < a.length - 1 ? `${w} ` : w));
    return Array.from(current);
  }, [current, splitBy]);

  const next = useCallback(() => {
    setIndex((prev) => (prev + 1) % Math.max(1, texts.length));
  }, [texts.length]);

  useEffect(() => {
    if (!auto || texts.length < 2) return undefined;
    const timer = setInterval(next, rotationInterval);
    return () => clearInterval(timer);
  }, [auto, next, rotationInterval, texts.length]);

  if (prefersReducedMotion) {
    return <span className={`rotating-text ${className}`}>{current}</span>;
  }

  return (
    <span className={`rotating-text ${className}`}>
      <span className="sr-only">{current}</span>
      <AnimatePresence mode="wait" initial={false}>
        <Motion.span key={index} className="rotating-text-line" aria-hidden="true">
          {units.map((unit, i) => (
            <Motion.span
              key={`${index}-${i}`}
              className="rotating-text-unit"
              initial={initial}
              animate={animate}
              exit={exit}
              transition={{ ...transition, delay: i * staggerDuration }}
            >
              {unit === " " ? " " : unit}
            </Motion.span>
          ))}
        </Motion.span>
      </AnimatePresence>
    </span>
  );
}
