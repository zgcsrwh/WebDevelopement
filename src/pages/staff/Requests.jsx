import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import "../pageStyles.css";
import "./Requests.css";
import {
  getStaffRequestConflictSummary,
  getStaffRequestPageStatus,
  getStaffRequests,
  processBookingApproval,
} from "../../services/bookingService";
import { useAuth } from "../../provider/AuthContext";
import { getErrorMessage } from "../../utils/errors";
import { statusTone } from "../../utils/presentation";
import { formatStaffCardTimestamp, formatStaffDateTime, getDateInputMaxValue, toDateInputValue } from "../../utils/staffPages";
import { hasMeaningfulText } from "../../utils/text";

const STATUS_FILTER_OPTIONS = [
  { value: "no show", label: "no show" },
  { value: "pending", label: "pending" },
  { value: "completed", label: "complete" },
  { value: "in progress", label: "in-progress" },
  { value: "rejected", label: "rejected" },
  { value: "alternative suggested", label: "alternative suggested" },
];

function sortStaffRequests(items = []) {
  return [...items].sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
}

function toDateLabel(value = "") {
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

function getCardFooterLabel(item) {
  return formatStaffCardTimestamp(item.createdAt);
}

function getDetailTimestampLabel(item) {
  if (item.completedAt) {
    return `Request ID: ${item.id} / Completed ${formatStaffDateTime(item.completedAt)}`;
  }

  return `Request ID: ${item.id} / Submitted ${formatStaffDateTime(item.createdAt)}`;
}

function getParticipants(item) {
  return [item.memberName, ...(Array.isArray(item.participantNames) ? item.participantNames : [])].filter(
    (participant, index, participants) => Boolean(participant) && participants.indexOf(participant) === index,
  );
}

function getInitialDecisionState() {
  return {
    type: "",
    text: "",
  };
}

function toPageItem(item) {
  return {
    ...item,
    pageStatus: getStaffRequestPageStatus(item.status),
  };
}

function getFacilityOptions(items = []) {
  return [...new Set(items.map((item) => item.facilityName).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
    .map((facilityName) => ({ id: facilityName, name: facilityName }));
}

export default function Requests() {
  const { sessionProfile } = useAuth();
  const [items, setItems] = useState([]);
  const [facilityOptions, setFacilityOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [draftDate, setDraftDate] = useState("");
  const [draftFacility, setDraftFacility] = useState("");
  const [draftStatus, setDraftStatus] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({
    date: "",
    facility: "",
    status: "",
  });
  const [decision, setDecision] = useState(getInitialDecisionState());
  const [conflictSummary, setConflictSummary] = useState(null);
  const [pageMessage, setPageMessage] = useState("");
  const [pageError, setPageError] = useState("");
  const [decisionError, setDecisionError] = useState("");
  const [processingAction, setProcessingAction] = useState("");

  const staffCreatedDate = useMemo(
    () => toDateInputValue(sessionProfile?.created_at || sessionProfile?.createdAt),
    [sessionProfile?.createdAt, sessionProfile?.created_at],
  );
  const maxFilterDate = useMemo(() => getDateInputMaxValue(7), []);

  async function refresh(preferredId = "") {
    setLoading(true);
    try {
      const mappedRequests = sortStaffRequests((await getStaffRequests(sessionProfile)).map(toPageItem));
      setItems(mappedRequests);
      setFacilityOptions(getFacilityOptions(mappedRequests));

      setSelectedId((current) => {
        const candidate = preferredId || current;
        if (candidate && mappedRequests.some((item) => item.id === candidate)) {
          return candidate;
        }
        return "";
      });
    } catch (loadError) {
      setPageError(getErrorMessage(loadError, "Unable to load booking requests."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      try {
        const nextRequests = await getStaffRequests(sessionProfile);
        if (cancelled) {
          return;
        }

        const mappedRequests = sortStaffRequests(nextRequests.map(toPageItem));
        setItems(mappedRequests);
        setFacilityOptions(getFacilityOptions(mappedRequests));
        setSelectedId("");
        setPageError("");
      } catch (loadError) {
        if (!cancelled) {
          setPageError(getErrorMessage(loadError, "Unable to load booking requests."));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (sessionProfile?.id) {
      loadPage();
    }

    return () => {
      cancelled = true;
    };
  }, [sessionProfile]);

  const visibleItems = useMemo(() => {
    return sortStaffRequests(
      items.filter((item) => {
        const dateMatch = !appliedFilters.date || item.date === appliedFilters.date;
        const facilityMatch = !appliedFilters.facility || item.facilityName === appliedFilters.facility;
        const statusMatch = !appliedFilters.status || item.pageStatus === appliedFilters.status;
        return dateMatch && facilityMatch && statusMatch;
      }),
    );
  }, [appliedFilters.date, appliedFilters.facility, appliedFilters.status, items]);

  useEffect(() => {
    if (!visibleItems.length) {
      setSelectedId("");
      return;
    }

    if (selectedId && !visibleItems.some((item) => item.id === selectedId)) {
      setSelectedId("");
    }
  }, [selectedId, visibleItems]);

  const selectedItem = useMemo(
    () => visibleItems.find((item) => item.id === selectedId) || null,
    [selectedId, visibleItems],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadConflictSummary() {
      if (!selectedItem) {
        setConflictSummary(null);
        return;
      }

      try {
        const summary = await getStaffRequestConflictSummary(selectedItem.raw, sessionProfile);
        if (!cancelled) {
          setConflictSummary(summary);
        }
      } catch (summaryError) {
        if (!cancelled) {
          setConflictSummary({
            state: "conflict",
            title: "Unable to determine request status",
            message: getErrorMessage(summaryError, "The latest time-slot availability could not be loaded."),
          });
        }
      }
    }

    loadConflictSummary();
    return () => {
      cancelled = true;
    };
  }, [selectedItem, sessionProfile]);

  function applyFilters() {
    setAppliedFilters({
      date: draftDate,
      facility: draftFacility,
      status: draftStatus,
    });
    setPageError("");
    setPageMessage("");
  }

  function toggleSelection(id) {
    setSelectedId((current) => (current === id ? "" : id));
  }

  function openDecision(type) {
    setDecision({
      type,
      text: "",
    });
    setDecisionError("");
    setPageMessage("");
    setPageError("");
  }

  function closeDecision() {
    setDecision(getInitialDecisionState());
    setDecisionError("");
  }

  async function handleApprove() {
    if (!selectedItem || selectedItem.pageStatus !== "pending") {
      return;
    }

    setPageError("");
    setPageMessage("");
    setProcessingAction("accepted");

    try {
      await processBookingApproval(
        {
          request_id: selectedItem.id,
          status: ["accepted"],
          staff_response: "",
        },
        undefined,
        undefined,
        sessionProfile,
      );
      await refresh(selectedItem.id);
      setPageMessage(`Request ${selectedItem.id} was updated to accepted.`);
    } catch (approvalError) {
      setPageError(getErrorMessage(approvalError, "Unable to process this booking request."));
    } finally {
      setProcessingAction("");
    }
  }

  async function submitDecision() {
    if (!selectedItem || selectedItem.pageStatus !== "pending" || !decision.type) {
      return;
    }

    if (!hasMeaningfulText(decision.text)) {
      setDecisionError(
        decision.type === "rejected"
          ? "Rejection reason is required."
          : "Suggested alternative is required.",
      );
      return;
    }

    setDecisionError("");
    setPageError("");
    setPageMessage("");
    setProcessingAction(decision.type);

    try {
      await processBookingApproval(
        {
          request_id: selectedItem.id,
          status: [decision.type],
          staff_response: decision.text.trim(),
        },
        undefined,
        undefined,
        sessionProfile,
      );
      closeDecision();
      await refresh(selectedItem.id);
      setPageMessage(
        `Request ${selectedItem.id} was updated to ${
          decision.type === "suggested" ? "alternative suggested" : "rejected"
        }.`,
      );
    } catch (decisionRequestError) {
      setDecisionError(getErrorMessage(decisionRequestError, "Unable to process this booking request."));
    } finally {
      setProcessingAction("");
    }
  }

  return (
    <div className="staff-requests-page">
      <section className="staff-requests-page__hero">
        <div>
          <h1>Booking Requests</h1>
          <p>Review and manage pending facility booking requests.</p>
        </div>
      </section>

      {pageError ? (
        <section className="staff-requests-banner staff-requests-banner--error">
          <strong>Cannot continue</strong>
          <p>{pageError}</p>
        </section>
      ) : null}

      {pageMessage ? (
        <section className="staff-requests-banner staff-requests-banner--success">
          <strong>Success</strong>
          <p>{pageMessage}</p>
        </section>
      ) : null}

      <section className="staff-requests-filters">
        <div className="staff-requests-filters__grid">
          <div className="staff-requests-filters__field">
            <label htmlFor="staff-request-date">Date</label>
            <input
              id="staff-request-date"
              type="date"
              min={staffCreatedDate}
              max={maxFilterDate}
              value={draftDate}
              onChange={(event) => setDraftDate(event.target.value)}
            />
          </div>

          <div className="staff-requests-filters__field">
            <label htmlFor="staff-request-facility">Facility</label>
            <select
              id="staff-request-facility"
              value={draftFacility}
              onChange={(event) => setDraftFacility(event.target.value)}
            >
              <option value="">All Facilities</option>
              {facilityOptions.map((facility) => (
                <option key={facility.id} value={facility.name}>
                  {facility.name}
                </option>
              ))}
            </select>
          </div>

          <div className="staff-requests-filters__field">
            <label htmlFor="staff-request-status">Status</label>
            <select
              id="staff-request-status"
              value={draftStatus}
              onChange={(event) => setDraftStatus(event.target.value)}
            >
              <option value="">All Status</option>
              {STATUS_FILTER_OPTIONS.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button className="btn staff-requests-filters__button" type="button" onClick={applyFilters}>
          Filter
        </button>
      </section>

      <section className="staff-requests-layout">
        <div className="staff-requests-list">
          {loading ? (
            <div className="staff-requests-empty">
              <p>Loading booking requests...</p>
            </div>
          ) : visibleItems.length > 0 ? (
            visibleItems.map((item) => (
              <article
                key={item.id}
                className={`staff-request-card ${selectedItem?.id === item.id ? "is-active" : ""}`}
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
                <div className="staff-request-card__top">
                  <h3>{item.facilityName}</h3>
                  <div className="staff-request-card__badges">
                    <span className={`status-pill ${statusTone(item.pageStatus)}`}>{item.pageStatus}</span>
                    <span className="staff-request-card__timeChip">
                      {toDateLabel(item.date)}, {item.startTime} - {item.endTime}
                    </span>
                  </div>
                </div>

                <p className="staff-request-card__meta">
                  {item.memberName} / {item.attendees} Attendees
                </p>
                <p className="staff-request-card__summary">{item.activityDescription}</p>
                <p className="staff-request-card__footer">{getCardFooterLabel(item)}</p>
              </article>
            ))
          ) : (
            <div className="staff-requests-empty">
              <p>No booking requests match the current filters.</p>
            </div>
          )}
        </div>

        <aside className="staff-request-detail">
          {selectedItem ? (
            <div className="staff-request-detail__card">
              <div className="staff-request-detail__head">
                <h2>{selectedItem.facilityName}</h2>
                <p>{getDetailTimestampLabel(selectedItem)}</p>
              </div>

              {conflictSummary ? (
                <div
                  className={`staff-request-detail__alert ${
                    conflictSummary.state === "available" ? "is-available" : "is-conflict"
                  }`}
                >
                  {conflictSummary.state === "available" ? <CheckCircle2 size={24} /> : <AlertTriangle size={24} />}
                  <div>
                    <strong>{conflictSummary.title}</strong>
                    <p>{conflictSummary.message}</p>
                  </div>
                </div>
              ) : null}

              <div className="staff-request-detail__section">
                <h3>Activity Description</h3>
                <p>{selectedItem.activityDescription}</p>
              </div>

              <div className="staff-request-detail__grid">
                <div>
                  <span>Applicant</span>
                  <strong>{selectedItem.memberName}</strong>
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

              <div className="staff-request-detail__section">
                <h3>Participants</h3>
                <div className="staff-request-detail__tags">
                  {getParticipants(selectedItem).map((participant) => (
                    <span key={participant}>{participant}</span>
                  ))}
                </div>
              </div>

              {selectedItem.pageStatus === "pending" ? (
                <div className="staff-request-detail__actions">
                  <button
                    className="btn staff-request-detail__primaryAction"
                    type="button"
                    disabled={processingAction !== ""}
                    onClick={handleApprove}
                  >
                    {processingAction === "accepted" ? "Approving..." : "Approve Booking"}
                  </button>

                  <div className="staff-request-detail__secondaryActions">
                    <button
                      className="btn-secondary"
                      type="button"
                      disabled={processingAction !== ""}
                      onClick={() => openDecision("suggested")}
                    >
                      Suggest Alt.
                    </button>
                    <button
                      className="btn-danger"
                      type="button"
                      disabled={processingAction !== ""}
                      onClick={() => openDecision("rejected")}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ) : (
                <div className="staff-request-detail__readonly">
                  <CalendarAlert />
                  <span>This request cannot be processed because its current status is {selectedItem.pageStatus}.</span>
                </div>
              )}
            </div>
          ) : (
            <div className="staff-requests-empty">
              <p>Select a booking request to preview its detail panel, or click the same card again to hide it.</p>
            </div>
          )}
        </aside>
      </section>

      {decision.type ? (
        <div className="staff-request-modalOverlay" role="presentation">
          <div className="staff-request-modal" role="dialog" aria-modal="true">
            <div className="staff-request-modal__body">
              <div>
                <h2>{decision.type === "rejected" ? "Reject Booking Request" : "Suggest Alternative"}</h2>
                <p>
                  {decision.type === "rejected"
                    ? "A rejection reason is required before this request can be submitted."
                    : "A suggested alternative is required before this request can be submitted."}
                </p>
              </div>

              {decisionError ? (
                <section className="staff-requests-banner staff-requests-banner--error">
                  <strong>Cannot continue</strong>
                  <p>{decisionError}</p>
                </section>
              ) : null}

              <label className="staff-request-modal__field">
                <span>{decision.type === "rejected" ? "Rejection Reason" : "Suggested Alternative"}</span>
                <textarea
                  value={decision.text}
                  onChange={(event) => {
                    setDecision((current) => ({ ...current, text: event.target.value }));
                    if (decisionError) {
                      setDecisionError("");
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

              <div className="staff-request-modal__actions">
                <button className="btn-secondary" type="button" disabled={processingAction !== ""} onClick={closeDecision}>
                  Cancel
                </button>
                <button
                  className={decision.type === "rejected" ? "btn-danger" : "btn"}
                  type="button"
                  disabled={processingAction !== ""}
                  onClick={submitDecision}
                >
                  {processingAction === decision.type
                    ? decision.type === "rejected"
                      ? "Rejecting..."
                      : "Sending..."
                    : decision.type === "rejected"
                      ? "Confirm Reject"
                      : "Send Suggestion"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CalendarAlert() {
  return <AlertTriangle size={18} />;
}
