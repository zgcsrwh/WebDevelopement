import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2 } from "lucide-react";
import "../../pages/pageStyles.css";
import "../member/memberWorkspace.css";
import { previewStaffActor, previewStaffRequests } from "../../previews/staffPreviewData";
import { statusTone } from "../../utils/presentation";
import { hasMeaningfulText } from "../../utils/text";
import "./Preview.css";

const DISPLAYABLE_PREVIEW_STATUSES = ["pending", "accepted", "rejected", "alternative suggested", "cancelled"];

function sortRequests(items = []) {
  return [...items].sort((left, right) => String(right.submittedAt || "").localeCompare(String(left.submittedAt || "")));
}

function toPreviewDateLabel(value = "") {
  if (!value) {
    return "";
  }

  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function toPreviewTimeRange(item) {
  return `${toPreviewDateLabel(item.date)}, ${item.startTime} - ${item.endTime}`;
}

function formatPreviewDateTime(value = "") {
  if (!value) {
    return "";
  }

  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getCardFooterLabel(item) {
  return item.completedAt ? `Completed: ${formatPreviewDateTime(item.completedAt)}` : "Pending";
}

function getDetailTimestampLabel(item) {
  if (item.completedAt) {
    return `Request ID: ${item.id} / Completed ${formatPreviewDateTime(item.completedAt)}`;
  }

  return `Request ID: ${item.id} / Submitted ${formatPreviewDateTime(item.submittedAt)}`;
}

function getParticipants(item) {
  const invitedParticipants = Array.isArray(item.participantNames) ? item.participantNames : [];
  return [item.applicantName, ...invitedParticipants].filter(
    (participant, index, participants) => Boolean(participant) && participants.indexOf(participant) === index,
  );
}

function getInitialDecisionState() {
  return {
    type: "",
    text: "",
  };
}

export default function PreviewStaffRequests() {
  const [items, setItems] = useState(() => sortRequests(previewStaffRequests.map((item) => ({ ...item }))));
  const [draftDate, setDraftDate] = useState("");
  const [draftFacility, setDraftFacility] = useState("");
  const [draftStatus, setDraftStatus] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({
    date: "",
    facility: "",
    status: "",
  });
  const [selectedId, setSelectedId] = useState("");
  const [decision, setDecision] = useState(getInitialDecisionState());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const facilityOptions = useMemo(
    () => [...new Set(items.map((item) => item.facilityName))].sort((left, right) => left.localeCompare(right)),
    [items],
  );

  const statusOptions = DISPLAYABLE_PREVIEW_STATUSES;

  const visibleItems = useMemo(() => {
    return sortRequests(
      items.filter((item) => {
        const displayableMatch = DISPLAYABLE_PREVIEW_STATUSES.includes(item.status);
        if (!displayableMatch) {
          return false;
        }
        const dateMatch = !appliedFilters.date || item.date === appliedFilters.date;
        const facilityMatch = !appliedFilters.facility || item.facilityName === appliedFilters.facility;
        const statusMatch = !appliedFilters.status || item.status === appliedFilters.status;
        return dateMatch && facilityMatch && statusMatch;
      }),
    );
  }, [appliedFilters.date, appliedFilters.facility, appliedFilters.status, items]);

  useEffect(() => {
    if (selectedId && !visibleItems.some((item) => item.id === selectedId)) {
      setSelectedId("");
    }
  }, [selectedId, visibleItems]);

  const selectedItem = useMemo(
    () => visibleItems.find((item) => item.id === selectedId) || null,
    [selectedId, visibleItems],
  );

  function syncSelection(nextItems) {
    if (!nextItems.some((item) => item.id === selectedId)) {
      setSelectedId("");
    }
  }

  function applyFilters() {
    setAppliedFilters({
      date: draftDate,
      facility: draftFacility,
      status: draftStatus,
    });
    setMessage("");
    setError("");
  }

  function updatePreviewStatus(nextStatus, responseText = "") {
    if (!selectedItem) {
      return;
    }

    const previewCompletedAt = new Date().toISOString();

    const nextItems = sortRequests(
      items.map((item) =>
        item.id === selectedItem.id
          ? {
              ...item,
              status: nextStatus,
              completedAt: previewCompletedAt,
              conflictState: nextStatus === "accepted" ? "available" : item.conflictState,
              conflictTitle:
                nextStatus === "accepted"
                  ? "Facility Available"
                  : nextStatus === "rejected"
                    ? "Request Rejected"
                    : nextStatus === "alternative suggested"
                      ? "Alternative Suggested"
                      : item.conflictTitle,
              conflictMessage:
                nextStatus === "accepted"
                  ? "Preview only: this booking would be approved and remain locked to the request."
                  : responseText || item.conflictMessage,
            }
          : item,
      ),
    );

    const nextVisibleItems = sortRequests(
      nextItems.filter((item) => {
        const displayableMatch = DISPLAYABLE_PREVIEW_STATUSES.includes(item.status);
        if (!displayableMatch) {
          return false;
        }
        const dateMatch = !appliedFilters.date || item.date === appliedFilters.date;
        const facilityMatch = !appliedFilters.facility || item.facilityName === appliedFilters.facility;
        const statusMatch = !appliedFilters.status || item.status === appliedFilters.status;
        return dateMatch && facilityMatch && statusMatch;
      }),
    );

    setItems(nextItems);
    setDecision(getInitialDecisionState());
    setError("");
    setMessage(
      nextStatus === "accepted"
        ? `Preview only: ${selectedItem.id} would be updated to accepted.`
        : nextStatus === "alternative suggested"
          ? `Preview only: ${selectedItem.id} would be updated to alternative suggested.`
          : `Preview only: ${selectedItem.id} would be updated to rejected.`,
    );
    syncSelection(nextVisibleItems);
  }

  function handleApprove() {
    updatePreviewStatus("accepted");
  }

  function toggleSelection(id) {
    setSelectedId((current) => (current === id ? "" : id));
  }

  function openDecision(type) {
    setDecision({
      type,
      text: "",
    });
    setError("");
    setMessage("");
  }

  function closeDecision() {
    setDecision(getInitialDecisionState());
    setError("");
  }

  function submitDecision() {
    if (!decision.type) {
      return;
    }

    if (!hasMeaningfulText(decision.text)) {
      setError(decision.type === "rejected" ? "Rejection reason is required." : "Suggested alternative is required.");
      return;
    }

    updatePreviewStatus(decision.type, decision.text.trim());
  }

  return (
    <div className="preview-staff-page">
      <section className="preview-staff-page__hero">
        <div>
          <h1>Booking Requests</h1>
          <p>Review and manage pending facility booking requests.</p>
        </div>
      </section>

      <section className="member-alert">
        <strong>Preview note</strong>
        <p>This static preview opens with all five request states visible so you can compare their card styles. The real staff page will still default to pending only.</p>
      </section>

      {message ? (
        <section className="member-alert member-alert--success">
          <strong>Preview only</strong>
          <p>{message}</p>
        </section>
      ) : null}

      {error && !decision.type ? (
        <section className="member-alert member-alert--error">
          <strong>Cannot continue</strong>
          <p>{error}</p>
        </section>
      ) : null}

      <section className="preview-staff-filters">
        <div className="preview-staff-filters__grid">
          <div className="preview-staff-filters__field">
            <label htmlFor="preview-staff-date">Date</label>
            <input
              id="preview-staff-date"
              type="date"
              min={previewStaffActor.createdAt}
              max={new Date().toISOString().slice(0, 10)}
              value={draftDate}
              onChange={(event) => setDraftDate(event.target.value)}
            />
          </div>

          <div className="preview-staff-filters__field">
            <label htmlFor="preview-staff-facility">Facility</label>
            <select
              id="preview-staff-facility"
              value={draftFacility}
              onChange={(event) => setDraftFacility(event.target.value)}
            >
              <option value="">All Facilities</option>
              {facilityOptions.map((facilityName) => (
                <option key={facilityName} value={facilityName}>
                  {facilityName}
                </option>
              ))}
            </select>
          </div>

          <div className="preview-staff-filters__field">
            <label htmlFor="preview-staff-status">Status</label>
            <select
              id="preview-staff-status"
              value={draftStatus}
              onChange={(event) => setDraftStatus(event.target.value)}
            >
              <option value="">All Status</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button className="btn preview-staff-filters__button" type="button" onClick={applyFilters}>
          Filter
        </button>
      </section>

      <section className="preview-staff-layout">
        <div className="preview-staff-list">
          {visibleItems.length > 0 ? (
            visibleItems.map((item) => (
              <article
                key={item.id}
                className={`preview-staff-requestCard ${selectedItem?.id === item.id ? "is-active" : ""}`}
                onClick={() => toggleSelection(item.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleSelection(item.id);
                  }
                }}
              >
                <div className="preview-staff-requestCard__top">
                  <h3>{item.facilityName}</h3>
                  <div className="preview-staff-requestCard__badges">
                    <span className={`status-pill ${statusTone(item.status)}`}>{item.status}</span>
                    <span className="preview-staff-requestCard__timeChip">{toPreviewTimeRange(item)}</span>
                  </div>
                </div>

                <p className="preview-staff-requestCard__meta">{item.applicantName} / {item.attendees} Attendees</p>
                <p className="preview-staff-requestCard__summary">{item.activityDescription}</p>
                <p className="preview-staff-requestCard__submitted">{getCardFooterLabel(item)}</p>
              </article>
            ))
          ) : (
            <div className="preview-staff-empty">
              <p>No booking requests match the current filters.</p>
            </div>
          )}
        </div>

        <aside className="preview-staff-detail">
          {selectedItem ? (
            <div className="preview-staff-detail__card">
              <div className="preview-staff-detail__head">
                <h2>{selectedItem.facilityName}</h2>
                <p>{getDetailTimestampLabel(selectedItem)}</p>
              </div>

              <div
                className={`preview-staff-detail__alert ${
                  selectedItem.conflictState === "available" ? "is-available" : "is-conflict"
                }`}
              >
                {selectedItem.conflictState === "available" ? <CheckCircle2 size={24} /> : <AlertTriangle size={24} />}
                <div>
                  <strong>{selectedItem.conflictTitle}</strong>
                  <p>{selectedItem.conflictMessage}</p>
                </div>
              </div>

              <div className="preview-staff-detail__section">
                <h3>Activity Description</h3>
                <p>{selectedItem.activityDescription}</p>
              </div>

              <div className="preview-staff-detail__grid">
                <div>
                  <span>Applicant</span>
                  <strong>{selectedItem.applicantName}</strong>
                </div>
                <div>
                  <span>Attendees</span>
                  <strong>{selectedItem.attendees}</strong>
                </div>
                <div>
                  <span>Date</span>
                  <strong>{selectedItem.date}</strong>
                </div>
                <div>
                  <span>Time</span>
                  <strong>
                    {selectedItem.startTime} - {selectedItem.endTime}
                  </strong>
                </div>
              </div>

              <div className="preview-staff-detail__section">
                <h3>Participants</h3>
                <div className="preview-staff-detail__tags">
                  {getParticipants(selectedItem).map((participant) => (
                    <span key={participant}>{participant}</span>
                  ))}
                </div>
              </div>

              {selectedItem.status === "pending" ? (
                <div className="preview-staff-detail__actions">
                  <button className="btn preview-staff-detail__primaryAction" type="button" onClick={handleApprove}>
                    Approve Booking
                  </button>
                  <div className="preview-staff-detail__secondaryActions">
                    <button className="btn-secondary" type="button" onClick={() => openDecision("alternative suggested")}>
                      Suggest Alt.
                    </button>
                    <button className="btn-danger" type="button" onClick={() => openDecision("rejected")}>
                      Reject
                    </button>
                  </div>
                </div>
              ) : (
                <div className="preview-staff-detail__readonly">
                  <CalendarDays size={18} />
                  <span>This request cannot be processed because its current status is {selectedItem.status}.</span>
                </div>
              )}
            </div>
          ) : (
            <div className="preview-staff-empty">
              <p>Select a booking request to preview its detail panel, or click the same card again to hide it.</p>
            </div>
          )}
        </aside>
      </section>

      {decision.type ? (
        <div className="member-modal-overlay preview-staff-modalOverlay" role="presentation">
          <div className="member-modal preview-staff-modal" role="dialog" aria-modal="true">
            <div className="preview-staff-modal__body">
              <div>
                <h2>{decision.type === "rejected" ? "Reject Booking Request" : "Suggest Alternative"}</h2>
                <p>
                  {decision.type === "rejected"
                    ? "A rejection reason is required before this preview can submit the decision."
                    : "A suggested alternative is required before this preview can submit the decision."}
                </p>
              </div>

              {error ? (
                <section className="member-alert member-alert--error">
                  <strong>Cannot continue</strong>
                  <p>{error}</p>
                </section>
              ) : null}

              <label className="preview-staff-modal__field">
                <span>{decision.type === "rejected" ? "Rejection Reason" : "Suggested Alternative"}</span>
                <textarea
                  value={decision.text}
                  onChange={(event) => {
                    setDecision((current) => ({ ...current, text: event.target.value }));
                    if (error) {
                      setError("");
                    }
                  }}
                  placeholder={
                    decision.type === "rejected"
                      ? "Explain why this booking request cannot be approved..."
                      : "Explain the alternative slot or facility you want to suggest..."
                  }
                  rows={5}
                />
              </label>

              <div className="member-modal__actions preview-staff-modal__actions">
                <button className="btn-secondary" type="button" onClick={closeDecision}>
                  Cancel
                </button>
                <button
                  className={decision.type === "rejected" ? "btn-danger" : "btn"}
                  type="button"
                  onClick={submitDecision}
                >
                  {decision.type === "rejected" ? "Confirm Reject" : "Send Suggestion"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
