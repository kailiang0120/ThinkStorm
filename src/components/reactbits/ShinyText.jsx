import "./ShinyText.css";

/**
 * ShinyText — a highlight band that sweeps across muted text.
 * Used for secondary labels that should read as "alive" but not shout.
 */
export default function ShinyText({
  children,
  className = "",
  speed = 4,
  disabled = false,
  ...rest
}) {
  return (
    <span
      className={`shiny-text ${disabled ? "is-disabled" : ""} ${className}`}
      style={{ "--shine-speed": `${speed}s` }}
      {...rest}
    >
      {children}
    </span>
  );
}
