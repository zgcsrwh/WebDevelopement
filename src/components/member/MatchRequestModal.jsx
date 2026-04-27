import { countMeaningfulCharacters } from "../../utils/text";
import "./MatchRequestModal.css";

export default function MatchRequestModal({
  open,
  targetName,
  value,
  error,
  pending = false,
  onChange,
  onCancel,
  onConfirm,
}) {
  if (!open) {
    return null;
  }

  const count = countMeaningfulCharacters(value);
  const counterClassName =
    count > 200
      ? "match-request-modal__counter match-request-modal__counter--error"
      : "match-request-modal__counter";

  return (
    <div className="member-modal-overlay match-request-modal__overlay" role="presentation">
      <div
        aria-labelledby="match-request-modal-title"
        aria-modal="true"
        className="member-modal match-request-modal"
        role="dialog"
      >
        <div className="match-request-modal__body">
          <div className="match-request-modal__copy">
            <h3 id="match-request-modal-title">Send Match Request</h3>
            <p>
              Write a short application message to {targetName || "this member"} before sending
              the partner request.
            </p>
          </div>

          <div className="match-request-modal__field">
            <div className="match-request-modal__fieldHead">
              <label htmlFor="match-request-message">Application Description</label>
            </div>
            <textarea
              id="match-request-message"
              onChange={(event) => onChange(event.target.value)}
              placeholder="Write a short request message..."
              value={value}
            />
            <div className="match-request-modal__fieldFoot">
              <span className={counterClassName}>{count}/200</span>
            </div>
          </div>

          {error ? <p className="match-request-modal__error">{error}</p> : null}

          <div className="member-modal__actions match-request-modal__actions">
            <button className="btn-secondary" onClick={onCancel} type="button">
              Cancel
            </button>
            <button className="btn" disabled={pending} onClick={onConfirm} type="button">
              {pending ? "Sending..." : "Confirm Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
