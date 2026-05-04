import { Link } from "react-router-dom";
import "./Button.css";

function getButtonClassName({ variant = "primary", size = "md", className = "" } = {}) {
  const variantClass =
    variant === "secondary"
      ? "btn-secondary"
      : variant === "ghost"
        ? "btn-ghost"
        : variant === "danger"
          ? "btn-danger"
          : "btn";
  const sizeClass = size === "sm" ? "btn--sm" : size === "lg" ? "btn--lg" : "";

  return [variantClass, sizeClass, className].filter(Boolean).join(" ");
}

export function Button({ variant = "primary", size = "md", className = "", type = "button", ...props }) {
  return <button className={getButtonClassName({ variant, size, className })} type={type} {...props} />;
}

export function ButtonLink({ variant = "primary", size = "md", className = "", ...props }) {
  return <Link className={getButtonClassName({ variant, size, className })} {...props} />;
}
