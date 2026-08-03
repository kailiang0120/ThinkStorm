import "./GradientText.css";

/**
 * GradientText — an animated, clipped gradient that slides across the text.
 * Falls back to a static gradient when the user prefers reduced motion.
 */
export default function GradientText({
  children,
  className = "",
  colors = ["#1e293b", "#2575e6", "#18c6d6", "#2575e6", "#1e293b"],
  animationSpeed = 9,
  ...rest
}) {
  return (
    <span
      className={`gradient-text ${className}`}
      style={{
        "--gradient-stops": colors.join(", "),
        "--gradient-speed": `${animationSpeed}s`
      }}
      {...rest}
    >
      {children}
    </span>
  );
}
