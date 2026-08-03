import { useCallback, useEffect, useRef } from "react";
import { useInView, useMotionValue, useSpring } from "motion/react";
import usePrefersReducedMotion from "./usePrefersReducedMotion";

/**
 * CountUp — springs a number from `from` to `to` and writes it straight to the
 * DOM node, so ticking the value never re-renders the React tree.
 */
export default function CountUp({
  to,
  from = 0,
  duration = 1.4,
  delay = 0,
  className = "",
  separator = "",
  startWhen = true
}) {
  const ref = useRef(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const motionValue = useMotionValue(from);
  const spring = useSpring(motionValue, {
    damping: 20 + 40 * (1 / duration),
    stiffness: 100 * (1 / duration)
  });
  const isInView = useInView(ref, { once: true });

  const paint = useCallback((value) => {
    if (!ref.current) return;
    const text = Intl.NumberFormat("en-US").format(Math.round(value));
    ref.current.textContent = separator ? text.replace(/,/g, separator) : text.replace(/,/g, "");
  }, [separator]);

  // Paint the starting value before the spring takes over.
  useEffect(() => {
    paint(prefersReducedMotion ? to : from);
  }, [paint, prefersReducedMotion, to, from]);

  useEffect(() => {
    if (!isInView || !startWhen || prefersReducedMotion) return undefined;
    const timer = setTimeout(() => motionValue.set(to), delay * 1000);
    return () => clearTimeout(timer);
  }, [isInView, startWhen, prefersReducedMotion, to, delay, motionValue]);

  useEffect(() => spring.on("change", paint), [spring, paint]);

  return <span className={className} ref={ref} />;
}
