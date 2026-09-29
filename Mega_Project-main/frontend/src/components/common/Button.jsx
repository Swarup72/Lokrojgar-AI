import "./Button.css";

/**
 * @param {{variant?: "primary"|"secondary"|"success"|"danger", size?: "md"|"lg", icon?: React.ComponentType, iconPosition?: "left"|"right"}} props
 */
export function Button({
  variant = "primary",
  size = "md",
  icon: Icon,
  iconPosition = "left",
  className = "",
  children,
  ...props
}) {
  const classes = ["btn", `btn-${variant}`, size === "lg" ? "btn-lg" : "", className].filter(Boolean).join(" ");

  return (
    <button className={classes} {...props}>
      {Icon && iconPosition === "left" && <Icon size={size === "lg" ? 20 : 17} aria-hidden="true" />}
      {children && <span>{children}</span>}
      {Icon && iconPosition === "right" && <Icon size={size === "lg" ? 20 : 17} aria-hidden="true" />}
    </button>
  );
}
