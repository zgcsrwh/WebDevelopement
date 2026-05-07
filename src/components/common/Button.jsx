// Buttons here keep the same action styles across the app.
import { Link } from "react-router-dom";
import "./Button.css";

function getButtonClassName({ variant = "primary", size = "md", className = "" } = {}) {
  // Variant shows the action meaning, for example normal save, cancel, or danger.
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
  // Use this for real button actions inside forms and dialogs.
  return <button className={getButtonClassName({ variant, size, className })} type={type} {...props} />;
}

export function ButtonLink({ variant = "primary", size = "md", className = "", ...props }) {
  // Use this for route links that should look like normal buttons.
  return <Link className={getButtonClassName({ variant, size, className })} {...props} />;
}
