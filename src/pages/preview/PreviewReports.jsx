import { useMemo, useState } from "react";
import "../../pages/pageStyles.css";
import "../member/memberWorkspace.css";
import "../member/Reports.css";
import { previewFacilityOptions, previewReports } from "../../previews/memberPreviewData";
import { countMeaningfulCharacters, hasMeaningfulText } from "../../utils/text";
import { statusTone, toTitleText } from "../../utils/presentation";

const PART_OPTIONS = ["light", "equipment", "surface", "electricity", "other"];

function formatPart(type) {
  const value = Array.isArray(type) ? type[0] : type;
  return toTitleText(String(value || ""));
}

export default function PreviewReports() {
  const [form, setForm] = useState({
    facilityId: "",
    type: "",
    description: "",
  });
  const [fieldError, setFieldError] = useState("");
  const [message, setMessage] = useState("");
  const [items, setItems] = useState(previewReports);

  const count = countMeaningfulCharacters(form.description);
  const tooLong = count > 500;

  const sortedItems = useMemo(
    () => [...items].sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt))),
    [items],
  );

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldError("");
    setMessage("");
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (!form.facilityId || !form.type || !hasMeaningfulText(form.description) || tooLong) {
      setFieldError(
        "Preview validation failed. Please fill all fields and keep the description within 500 characters.",
      );
      return;
    }

    const facility = previewFacilityOptions.find((item) => item.id === form.facilityId);
    const nextItem = {
      id: `PREVIEW-REP-${Date.now()}`,
      facilityName: facility?.name || "Unknown Facility",
      sportType: "Preview",
      status: "pending",
      createdAt: "2026-04-21 18:30",
      type: [form.type],
    };

    setItems((current) => [nextItem, ...current]);
    setMessage("Preview ticket added to the top of the history list.");
    setForm((current) => ({ ...current, description: "" }));
  }

  return (
    <div className="member-workspace reports-page">
      <section className="reports-page__heading">
        <h1>Facility Reports</h1>
        <p>Report equipment malfunctions or facility issues to help us maintain a safe environment.</p>
      </section>

      <article className="reports-card">
        <div className="reports-card__head">
          <h2>Submit a New Ticket</h2>
        </div>

        {fieldError ? (
          <section className="member-alert member-alert--error reports-card__alert">
            <strong>Preview validation</strong>
            <p>{fieldError}</p>
          </section>
        ) : null}

        {message ? (
          <section className="member-alert member-alert--success reports-card__alert">
            <strong>Preview only</strong>
            <p>{message}</p>
          </section>
        ) : null}

        <form className="reports-form" onSubmit={handleSubmit}>
          <div className="reports-form__grid">
            <div className="reports-field">
              <label htmlFor="preview-report-facility">Facility Name</label>
              <select
                id="preview-report-facility"
                value={form.facilityId}
                onChange={(event) => updateField("facilityId", event.target.value)}
              >
                <option value="">Select a facility...</option>
                {previewFacilityOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="reports-field">
              <label htmlFor="preview-report-part">Faulty Part</label>
              <select
                id="preview-report-part"
                value={form.type}
                onChange={(event) => updateField("type", event.target.value)}
              >
                <option value="">Select the faulty part...</option>
                {PART_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="reports-field reports-field--full">
            <div className="reports-field__headRow">
              <label htmlFor="preview-report-description">Issue Description</label>
              <span className={`reports-counter ${tooLong ? "reports-counter--error" : ""}`}>
                {count}/500
              </span>
            </div>
            <textarea
              id="preview-report-description"
              placeholder="Provide specific details about the issue to help our staff locate and fix it..."
              value={form.description}
              onChange={(event) => updateField("description", event.target.value)}
            />
          </div>

          <div className="reports-form__actions">
            <button className="btn" type="submit">
              Submit Ticket
            </button>
          </div>
        </form>
      </article>

      <section className="reports-history">
        <div className="reports-history__head">
          <h2>My Report History</h2>
          <div className="reports-legend">
            <span className="reports-legend__item">
              <span className="reports-legend__dot reports-legend__dot--pending" />
              <span className="reports-legend__label">pending</span>
            </span>
            <span className="reports-legend__item">
              <span className="reports-legend__dot reports-legend__dot--resolved" />
              <span className="reports-legend__label">resolved</span>
            </span>
          </div>
        </div>

        <div className="reports-history__list">
          {sortedItems.map((item) => (
            <article key={item.id} className="reports-history__card">
              <div className="reports-history__titleRow">
                <h3>
                  {item.facilityName} ({item.sportType})
                </h3>
                <span className={`status-pill ${statusTone(item.status)} reports-status-pill`}>
                  {item.status}
                </span>
              </div>

              <p className="reports-history__meta">
                <span>{item.createdAt}</span>
                <span className="reports-history__separator">-</span>
                <span className="reports-history__part">Faulty Part: {formatPart(item.type)}</span>
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
