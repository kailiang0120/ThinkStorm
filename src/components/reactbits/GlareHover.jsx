import "./GlareHover.css";

/**
 * GlareHover — an angled specular sweep that crosses the element on hover.
 * Pure CSS; the transform runs on the compositor.
 */
export default function GlareHover({
  children,
  className = "",
  glareColor = "#ffffff",
  glareOpacity = 0.35,
  glareAngle = -35,
  glareSize = 250,
  duration = 700,
  ...rest
}) {
  return (
    <div
      className={`glare-hover ${className}`}
      style={{
        "--glare-color": glareColor,
        "--glare-opacity": glareOpacity,
        "--glare-angle": `${glareAngle}deg`,
        "--glare-size": `${glareSize}%`,
        "--glare-duration": `${duration}ms`
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
