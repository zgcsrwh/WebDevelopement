import { useEffect, useMemo, useState } from "react";
import "../pageStyles.css";
import "./memberWorkspace.css";
import "./Reports.css";
import { getReportFacilities, getRepairTickets, submitRepairTicket } from "../../services/reportService";
import { useAuth } from "../../provider/AuthContext";
import { getErrorCode, getErrorMessage } from "../../utils/errors";
import { statusTone, toTitleText } from "../../utils/presentation";
import { countMeaningfulCharacters, hasMeaningfulText } from "../../utils/text";

const FAULT_PART_OPTIONS = ["light", "equipment", "surface", "electricity", "other"];

function getInitialForm() {
  return {
    facilityId: "",
    type: "",
    description: "",
  };
}

function normalizeDateValue(value) {
  if (!value) {
    return 0;
  }

  if (value?.seconds) {
    return value.seconds * 1000;
  }

  if (value?.toDate) {
    return value.toDate().getTime();
  }

  const normalized = String(value).replace(" ", "T");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function mapReportSubmitError(error) {
  const code = String(getErrorCode(error) || "").toLowerCase();
  if (code.includes("invalid-argument")) {
    return "Please fill in a valid issue description and review the form before submitting.";
  }

  return getErrorMessage(error, "Unable to submit the repair ticket right now.");
}

function formatFaultyPart(type) {
  const raw = Array.isArray(type) ? type[0] : type;
  return toTitleText(String(raw || ""));
}

export default function Reports() {
  const { sessionProfile } = useAuth();
  const [items, setItems] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [form, setForm] = useState(getInitialForm());
  const [fieldErrors, setFieldErrors] = useState({
    facilityId: "",
    type: "",
    description: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      try {
        const [repairItems, facilityItems] = await Promise.all([
          getRepairTickets(sessionProfile),
          getReportFacilities(),
        ]);

        if (cancelled) {
          return;
        }

        setItems(repairItems);
        setFacilities(facilityItems);
      } catch (loadError) {
        if (!cancelled) {
          setError(getErrorMessage(loadError, "Unable to load report data right now."));
        }
      }
    }

    loadPage();
    return () => {
      cancelled = true;
    };
  }, [sessionProfile]);

  const descriptionLength = countMeaningfulCharacters(form.description);
  const isDescriptionTooLong = descriptionLength > 500;

  const sortedItems = useMemo(() => {
    return [...items].sort((left, right) => {
      const leftTime = normalizeDateValue(left.raw?.created_at || left.createdAt);
      const rightTime = normalizeDateValue(right.raw?.created_at || right.createdAt);
      return rightTime - leftTime;
    });
  }, [items]);

  function updateField(key, value) {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }));
    setFieldErrors((previous) => ({
      ...previous,
      [key]: "",
    }));
    setError("");
    setMessage("");
  }

  async function refreshTickets() {
    setItems(await getRepairTickets(sessionProfile));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    const nextErrors = {
      facilityId: "",
      type: "",
      description: "",
    };

    if (!form.facilityId) {
      nextErrors.facilityId = "Please select a facility before submitting.";
    }

    if (!form.type) {
      nextErrors.type = "Please select the faulty part before submitting.";
    }

    if (!hasMeaningfulText(form.description)) {
      nextErrors.description = "Issue description is required.";
    } else if (descriptionLength > 500) {
      nextErrors.description = "Issue description must stay within 500 characters.";
    }

    if (nextErrors.facilityId || nextErrors.type || nextErrors.description) {
      setFieldErrors(nextErrors);
      return;
    }

    setSubmitting(true);

    try {
      await submitRepairTicket(
        {
          facility_id: form.facilityId,
          repair_description: form.description.trim(),
          type: [form.type],
        },
        sessionProfile,
      );

      setForm((previous) => ({
        ...previous,
        description: "",
      }));
      setFieldErrors({
        facilityId: "",
        type: "",
        description: "",
      });
      await refreshTickets();
      setMessage("Repair ticket submitted.");
    } catch (submitError) {
      setError(mapReportSubmitError(submitError));
    } finally {
      setSubmitting(false);
    }
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

        {error && (
          <section className="member-alert member-alert--error reports-card__alert">
            <strong>Unable to continue</strong>
            <p>{error}</p>
          </section>
        )}

        {message && (
          <section className="member-alert member-alert--success reports-card__alert">
            <strong>Submitted</strong>
            <p>{message}</p>
          </section>
        )}

        <form className="reports-form" onSubmit={handleSubmit}>
          <div className="reports-form__grid">
            <div className="reports-field">
              <label htmlFor="report-facility">Facility Name</label>
              <select
                id="report-facility"
                value={form.facilityId}
                onChange={(event) => updateField("facilityId", event.target.value)}
              >
                <option value="">Select a facility...</option>
                {facilities.map((facility) => (
                  <option key={facility.id} value={facility.id}>
                    {facility.name}
                  </option>
                ))}
              </select>
              {fieldErrors.facilityId ? <p className="reports-field__error">{fieldErrors.facilityId}</p> : null}
            </div>

            <div className="reports-field">
              <label htmlFor="report-part">Faulty Part</label>
              <select id="report-part" value={form.type} onChange={(event) => updateField("type", event.target.value)}>
                <option value="">Select the faulty part...</option>
                {FAULT_PART_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {fieldErrors.type ? <p className="reports-field__error">{fieldErrors.type}</p> : null}
            </div>
          </div>

          <div className="reports-field reports-field--full">
            <div className="reports-field__headRow">
              <label htmlFor="report-description">Issue Description</label>
              <span className={`reports-counter ${isDescriptionTooLong ? "reports-counter--error" : ""}`}>
                {descriptionLength}/500
              </span>
            </div>
            <textarea
              id="report-description"
              value={form.description}
              onChange={(event) => updateField("description", event.target.value)}
              placeholder="Provide specific details about the issue to help our staff locate and fix it..."
            />
            {fieldErrors.description ? <p className="reports-field__error">{fieldErrors.description}</p> : null}
          </div>

          <div className="reports-form__actions">
            <button className="btn" type="submit" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit Ticket"}
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

        {sortedItems.length > 0 ? (
          <div className="reports-history__list">
            {sortedItems.map((item) => (
              <article key={item.id} className="reports-history__card">
                <div className="reports-history__titleRow">
                  <p className="reports-history__title">{item.facilityLabel}</p>
                  <span className={`status-pill ${statusTone(item.status)} reports-status-pill`}>{item.status}</span>
                </div>

                <p className="reports-history__meta">
                  <span>{item.createdAt}</span>
                  <span className="reports-history__separator">•</span>
                  <span className="reports-history__part">Faulty Part: {formatFaultyPart(item.type)}</span>
                </p>
              </article>
            ))}
          </div>
        ) : (
          <div className="reports-empty">
            <p>No repair tickets have been submitted from this member account yet.</p>
          </div>
        )}
      </section>
    </div>
  );
}
