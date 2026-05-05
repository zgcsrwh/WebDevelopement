import { useEffect } from "react";
import { createPortal } from "react-dom";
import "./Toast.css";

export default function Toast({ toast, onClose, duration = 3200 }) {
  useEffect(() => {
    if (!toast || duration <= 0) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      onClose?.();
    }, duration);

    return () => window.clearTimeout(timeoutId);
  }, [duration, onClose, toast]);

  if (!toast) {
    return null;
  }

  const content = (
    <div
      className={`app-toast app-toast--${toast.tone || "success"}`}
      role={toast.tone === "error" ? "alert" : "status"}
      aria-live={toast.tone === "error" ? "assertive" : "polite"}
    >
      {toast.title ? <strong>{toast.title}</strong> : null}
      <span>{toast.message}</span>
      <button type="button" aria-label="Dismiss message" onClick={onClose}>
        x
      </button>
    </div>
  );

  if (typeof document === "undefined") {
    return content;
  }

  return createPortal(content, document.body);
}
