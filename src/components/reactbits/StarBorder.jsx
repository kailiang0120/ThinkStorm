import "./StarBorder.css";

/**
 * StarBorder — two soft radial comets orbiting the element's border, used to
 * draw attention to the primary call to action. Pure CSS keyframes.
 */
export default function StarBorder({
  className = "",
  color = "#18c6d6",
  speed = "5s",
  thickness = 2,
  children,
  ...rest
}) {
  return (
    <button
      type="button"
      className={`star-border ${className}`}
      style={{ "--star-color": color, "--star-speed": speed, padding: `${thickness}px 0` }}
      {...rest}
    >
      <span className="star-border-glow bottom" aria-hidden="true" />
      <span className="star-border-glow top" aria-hidden="true" />
      <span className="star-border-content">{children}</span>
    </button>
  );
}
