import { createPortal } from "react-dom";
import { Button } from "./Button";
import "./ConfirmDialog.css";

export default function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "primary",
  pending = false,
  onCancel,
  onConfirm,
}) {
  if (!open) {
    return null;
  }

  const dialog = (
    <div className="confirm-dialog__overlay" role="presentation">
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <div className="confirm-dialog__copy">
          <h2 id="confirm-dialog-title">{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>

        {children ? <div className="confirm-dialog__content">{children}</div> : null}

        <div className="confirm-dialog__actions">
          <Button variant="secondary" type="button" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} type="button" onClick={onConfirm} disabled={pending}>
            {pending ? "Submitting..." : confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );

  if (typeof document === "undefined") {
    return dialog;
  }

  return createPortal(dialog, document.body);
}
