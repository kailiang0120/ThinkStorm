import { Children, cloneElement, useRef, useState } from "react";
import {
  motion as Motion,
  useMotionValue,
  useSpring,
  useTransform,
  useMotionValueEvent
} from "motion/react";
import usePrefersReducedMotion from "./usePrefersReducedMotion";
import "./Dock.css";

/**
 * Dock — macOS-style magnifying dock built on the `motion` package that is
 * already a dependency. Items scale based on pointer proximity along the
 * dock's main axis, so icon-only buttons stay readable.
 */
function DockItem({
  children,
  className = "",
  onClick,
  pointer,
  spring,
  distance,
  magnification,
  baseSize,
  orientation,
  disabled,
  label,
  isStatic
}) {
  const ref = useRef(null);
  const isHovered = useMotionValue(0);
  const [showLabel, setShowLabel] = useState(false);

  // Distance from the pointer to this item's centre, along the dock axis.
  const axisDistance = useTransform(pointer, (value) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || value === Infinity) return distance + 1;
    return orientation === "vertical"
      ? value - rect.y - rect.height / 2
      : value - rect.x - rect.width / 2;
  });

  const targetSize = useTransform(
    axisDistance,
    [-distance, 0, distance],
    [baseSize, magnification, baseSize],
    { clamp: true }
  );
  const size = useSpring(targetSize, spring);

  useMotionValueEvent(isHovered, "change", (latest) => setShowLabel(latest === 1));

  const dimension = isStatic ? baseSize : size;

  return (
    <Motion.button
      ref={ref}
      type="button"
      className={`dock-item ${className} ${disabled ? "is-disabled" : ""}`}
      style={{ width: dimension, height: dimension }}
      onHoverStart={() => isHovered.set(1)}
      onHoverEnd={() => isHovered.set(0)}
      onFocus={() => isHovered.set(1)}
      onBlur={() => isHovered.set(0)}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={label}
      whileTap={disabled ? undefined : { scale: 0.9 }}
    >
      <span className="dock-item-icon">{children}</span>
      <span className={`dock-item-label ${showLabel ? "visible" : ""}`} role="tooltip" aria-hidden="true">
        {label}
      </span>
    </Motion.button>
  );
}

export default function Dock({
  items = [],
  className = "",
  orientation = "vertical",
  spring = { mass: 0.1, stiffness: 150, damping: 12 },
  magnification = 58,
  distance = 130,
  baseSize = 44,
  children
}) {
  const pointer = useMotionValue(Infinity);
  const prefersReducedMotion = usePrefersReducedMotion();

  const handleMove = (event) => {
    pointer.set(orientation === "vertical" ? event.pageY : event.pageX);
  };

  return (
    <div
      className={`dock-panel ${orientation} ${className}`}
      onPointerMove={handleMove}
      onPointerLeave={() => pointer.set(Infinity)}
      role="toolbar"
      aria-orientation={orientation === "vertical" ? "vertical" : "horizontal"}
    >
      {items.map((item, index) => (
        item.divider ? (
          <span className="dock-divider" key={`divider-${index}`} aria-hidden="true" />
        ) : (
          <DockItem
            key={item.key || item.label}
            className={item.className}
            onClick={item.onClick}
            disabled={item.disabled}
            label={item.label}
            pointer={pointer}
            spring={spring}
            distance={distance}
            magnification={magnification}
            baseSize={baseSize}
            orientation={orientation}
            isStatic={prefersReducedMotion}
          >
            {item.icon}
          </DockItem>
        )
      ))}
      {Children.map(children, (child) => (child ? cloneElement(child) : null))}
    </div>
  );
}
