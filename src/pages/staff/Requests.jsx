import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import "../pageStyles.css";
import "./Requests.css";
import {
  getAllFacilityFilterOptions,
  getStaffRequestConflictSummary,
  getStaffRequestPageStatus,
  getStaffRequests,
  processBookingApproval,
  getTimeSlotsByFacility,
  getFacilities,
} from "../../services/bookingService";
import { useAuth } from "../../provider/AuthContext";
import { getErrorMessage } from "../../utils/errors";
import { displayStatus, statusTone } from "../../utils/presentation";
import { formatStaffCardTimestamp, formatStaffDateTime, getDateInputMaxValue, toDateInputValue } from "../../utils/staffPages";
import { hasMeaningfulText } from "../../utils/text";
import { FilterField, FilterPanel } from "../../components/common/FilterControls";
import PageLayout from "../../components/common/PageLayout";
import StaffListCard from "../../components/staff/StaffListCard";

const STAFF_REQUEST_STATUSES = ["pending", "accepted", "rejected", "alternative suggested", "cancelled"];
const STAFF_REQUEST_STATUS_SET = new Set(STAFF_REQUEST_STATUSES);
const STATUS_FILTER_OPTIONS = STAFF_REQUEST_STATUSES.map((status) => ({ value: status, label: status }));

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

export default function Requests() {
  const { sessionProfile } = useAuth();
  const [items, setItems] = useState([]);
  const [facilityOptions, setFacilityOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [filters, setFilters] = useState({
    date: "",
    facility: "",
    status: "",
  });
  const [decision, setDecision] = useState(getInitialDecisionState());
  const [conflictSummary, setConflictSummary] = useState(null);
  const [availableSlots, setAvailableSlots] = useState(null);
  const [alternativeFacilities, setAlternativeFacilities] = useState(null);
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
      const [nextRequests, nextFacilities] = await Promise.all([
        getStaffRequests(sessionProfile),
        getAllFacilityFilterOptions(),
      ]);
      const mappedRequests = sortStaffRequests(
        nextRequests.map(toPageItem).filter((item) => STAFF_REQUEST_STATUS_SET.has(item.pageStatus)),
      );
      setItems(mappedRequests);
      setFacilityOptions(nextFacilities);

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
        const [nextRequests, nextFacilities] = await Promise.all([
          getStaffRequests(sessionProfile),
          getAllFacilityFilterOptions(),
        ]);
        if (cancelled) {
          return;
        }

        const mappedRequests = sortStaffRequests(
          nextRequests
            .map(toPageItem)
            .filter((item) => STAFF_REQUEST_STATUS_SET.has(item.pageStatus)),
        );
        setItems(mappedRequests);
        setFacilityOptions(nextFacilities);
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
        if (!STAFF_REQUEST_STATUS_SET.has(item.pageStatus)) {
          return false;
        }

        const dateMatch = !filters.date || item.date === filters.date;
        const facilityMatch =
          !filters.facility ||
          item.facilityId === filters.facility ||
          item.facilityName === filters.facility;
        const statusMatch = !filters.status || item.pageStatus === filters.status;
        return dateMatch && facilityMatch && statusMatch;
      }),
    );
  }, [filters.date, filters.facility, filters.status, items]);

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

  useEffect(() => {
    let cancelled = false;

    async function loadAvailableSlots() {
      if (!selectedItem || selectedItem.pageStatus !== "pending") {
        setAvailableSlots(null);
        return;
      }
      try {
        const slots = await getTimeSlotsByFacility(selectedItem.facilityId || selectedItem.raw?.facility_id, selectedItem.date);
        if (!cancelled) {
          const openSlots = slots.filter((slot) => String(slot.status || "").toLowerCase() === "open");
          setAvailableSlots(openSlots);
        }
      } catch (error) {
        if (!cancelled) {
          setAvailableSlots([]);
        }
      }
    }

    loadAvailableSlots();
    return () => {
      cancelled = true;
    };
  }, [selectedItem]);

  useEffect(() => {
    let cancelled = false;

    async function loadAlternativeFacilities() {
      if (!selectedItem || selectedItem.pageStatus !== "pending") {
        setAlternativeFacilities(null);
        return;
      }
      try {
        const targetFacilityId = selectedItem.facilityId || selectedItem.raw?.facility_id;
        const startTime = `${selectedItem.startTime}`;

        const allFacilities = await getFacilities(selectedItem.date);

        if (cancelled) return;

        const sportType = selectedItem.sportType;
        const potentialAlternatives = allFacilities.filter((f) => {
          return (
            f.id !== targetFacilityId &&
            f.sportType === sportType &&
            f.status === "normal"
          );
        });

        const verifiedAlternatives = [];
        await Promise.all(
          potentialAlternatives.map(async (fac) => {
            try {
              const slots = await getTimeSlotsByFacility(fac.id, selectedItem.date);
              const hasMatchingSlot = slots.some(
                (slot) =>
                  (String(slot.start_time) === String(selectedItem.raw?.start_time || selectedItem.startTime) ||
                    String(slot.startTime) === startTime) &&
                  String(slot.status || "").toLowerCase() === "open"
              );
              if (hasMatchingSlot) {
                verifiedAlternatives.push(fac);
              }
            } catch (err) {
              // Skip facility if slots fail to load
            }
          })
        );

        if (cancelled) return;

        setAlternativeFacilities(verifiedAlternatives);
      } catch (error) {
        if (!cancelled) {
          setAlternativeFacilities([]);
        }
      }
    }

    loadAlternativeFacilities();
    return () => {
      cancelled = true;
    };
  }, [selectedItem]);

  function clearFilters() {
    setFilters({
      date: "",
      facility: "",
      status: "",
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
          status: "accepted",
          staff_response: "",
        },
        undefined,
        undefined,
        sessionProfile,
      );
      await refresh(selectedItem.id);
      setPageMessage(`Request ${selectedItem.id} was updated to Upcoming.`);
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
          status: decision.type,
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
    <PageLayout
      className="staff-requests-page"
      title="Booking Requests"
      subtitle="Review and manage pending facility booking requests."
    >

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

      <FilterPanel
        className="staff-requests-filters"
        columns={3}
        onClear={clearFilters}
      >
          <FilterField id="staff-request-date" label="Activity Date">
            <input
              id="staff-request-date"
              type="date"
              min={staffCreatedDate}
              max={maxFilterDate}
              value={filters.date}
              onChange={(event) => {
                setFilters((previous) => ({ ...previous, date: event.target.value }));
                setPageError("");
                setPageMessage("");
              }}
            />
          </FilterField>

          <FilterField id="staff-request-facility" label="Facility">
            <select
              id="staff-request-facility"
              value={filters.facility}
              onChange={(event) => {
                setFilters((previous) => ({ ...previous, facility: event.target.value }));
                setPageError("");
                setPageMessage("");
              }}
            >
              <option value="">All Facilities</option>
                {facilityOptions.map((facility) => (
                  <option key={facility.id} value={facility.id}>
                    {facility.name}
                  </option>
                ))}
            </select>
          </FilterField>

          <FilterField id="staff-request-status" label="Status">
            <select
              id="staff-request-status"
              value={filters.status}
              onChange={(event) => {
                setFilters((previous) => ({ ...previous, status: event.target.value }));
                setPageError("");
                setPageMessage("");
              }}
            >
              <option value="">All Status</option>
              {STATUS_FILTER_OPTIONS.map((status) => (
                <option key={status.value} value={status.value}>
                  {displayStatus(status.label)}
                </option>
              ))}
            </select>
          </FilterField>
      </FilterPanel>

      <section className="staff-requests-layout">
        <div className="staff-requests-list">
          {loading ? (
            <div className="staff-requests-empty">
              <p>Loading booking requests...</p>
            </div>
          ) : visibleItems.length > 0 ? (
            visibleItems.map((item) => (
              <div key={item.id} className="staff-request-group">
                <StaffListCard
                  isActive={selectedItem?.id === item.id}
                  onClick={() => toggleSelection(item.id)}
                  gridTemplateColumns="2.2fr 1.2fr 0.6fr 0.7fr 1fr 1fr"
                  cells={[
                    { label: "Facility", value: item.facilityName, title: item.facilityName },
                    { label: "Member / Attendees", value: `${item.memberName} / ${item.attendees}`, title: `${item.memberName} / ${item.attendees}` },
                    { label: "Activity Date", value: toDateLabel(item.date) },
                    { label: "Time", value: `${item.startTime} - ${item.endTime}` },
                    { label: "Status", value: displayStatus(item.pageStatus), isStatus: true, statusTone: statusTone(item.pageStatus) },
                    { label: "Submitted Date", value: getCardFooterLabel(item), title: getCardFooterLabel(item) },
                  ]}
                />

                {selectedItem?.id === item.id ? (
                  <div className="staff-request-detail__card">
                    <div className="staff-request-detail__head">
                      <h2>{selectedItem.facilityName}</h2>
                        <p className="staff-request-detail__requestId">{getDetailTimestampLabel(selectedItem)}</p>
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
                        <span>Activity Date</span>
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
                      <>
                        <div className="staff-request-detail__section">
                          <h3>Alternative Time Slots (Same Facility)</h3>
                          {availableSlots === null ? (
                            <p>Loading available slots...</p>
                          ) : availableSlots.length > 0 ? (
                            <div className="staff-request-detail__tags">
                              {availableSlots.map((slot) => (
                                <span key={slot.id || `${slot.date}-${slot.start_time}-${slot.end_time}`}>
                                  {slot.timeLabel || `${slot.start_time} - ${slot.end_time}`}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p>No other available time slots for this date.</p>
                          )}
                        </div>

                        <div className="staff-request-detail__section">
                          <h3>Alternative Facilities (Same Time & Sport)</h3>
                          {alternativeFacilities === null ? (
                            <p>Loading alternative facilities...</p>
                          ) : alternativeFacilities.length > 0 ? (
                            <div className="staff-request-detail__tags">
                              {alternativeFacilities.map((fac) => (
                                <span key={fac.id}>
                                  {fac.name}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p>No alternative facilities available for this time slot.</p>
                          )}
                        </div>

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
                      </>
                    ) : (
                      <div className="staff-request-detail__readonly">
                        <CalendarAlert />
                        <span>This request cannot be processed because its current status is {selectedItem.pageStatus}.</span>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <div className="staff-requests-empty">
              <p>No booking requests match the current filters.</p>
            </div>
          )}
        </div>
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
    </PageLayout>
  );
}

function CalendarAlert() {
  return <AlertTriangle size={18} />;
}
