// Staff review member booking requests on this page.
// They can filter requests, open one request, check time conflicts, and make a decision.
// Pending requests can be approved, rejected, or returned with another suggestion.
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
  subscribeToStaffRequests,
} from "../../services/bookingService";
import { useAuth } from "../../provider/AuthContext";
import { getActionErrorMessage } from "../../utils/errors";
import { displayStatus, statusTone } from "../../utils/presentation";
import { formatStaffCardTimestamp, formatStaffDateTime, getDateInputMaxValue, toDateInputValue } from "../../utils/staffPages";
import { hasMeaningfulText } from "../../utils/text";
import { FilterField, FilterPanel } from "../../components/common/FilterControls";
import PageLayout from "../../components/common/PageLayout";
import StaffListCard from "../../components/staff/StaffListCard";

const STAFF_REQUEST_STATUSES = ["pending", "accepted", "rejected", "alternative suggested", "cancelled", "no show", "completed"];
const STAFF_REQUEST_STATUS_SET = new Set(STAFF_REQUEST_STATUSES);
const STATUS_FILTER_OPTIONS = STAFF_REQUEST_STATUSES.map((status) => ({ value: status, label: status }));

// Sort booking requests for the staff review list.
// New member requests appear first so staff can handle recent work earlier.
function sortStaffRequests(items = []) {
  return [...items].sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
}

// Format the activity date shown on request cards.
// Staff use this date to quickly check which activity day the member selected.
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

// Show the submitted time at the bottom of a request card.
function getCardFooterLabel(item) {
  return formatStaffCardTimestamp(item.createdAt);
}

// Build the request id line for the detail panel.
// Finished requests show completed time, and waiting requests show submitted time.
function getDetailTimestampLabel(item) {
  if (item.completedAt) {
    return `Request ID: ${item.id} / Completed ${formatStaffDateTime(item.completedAt)}`;
  }

  return `Request ID: ${item.id} / Submitted ${formatStaffDateTime(item.createdAt)}`;
}

// Build the participant list for the detail panel.
// The applicant appears first, invited friends come after, and duplicate names are removed.
function getParticipants(item) {
  return [item.memberName, ...(Array.isArray(item.participantNames) ? item.participantNames : [])].filter(
    (participant, index, participants) => Boolean(participant) && participants.indexOf(participant) === index,
  );
}

// Start the reject or suggest modal for a new staff decision.
// Staff begin with no selected action and no typed message.
function getInitialDecisionState() {
  return {
    type: "",
    text: "",
  };
}

// Build the request status shown on the staff review page.
// Staff see suggested requests as alternative suggested in the list and detail card.
function toPageItem(item) {
  return {
    ...item,
    pageStatus: getStaffRequestPageStatus(item.status),
  };
}

// Staff use this page to review and process booking requests.
// The page loads live request data, applies filters, shows one detail card, and sends staff decisions.
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

  // Reload requests after staff make a decision.
  // The same detail card stays open if that request is still in the list.
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
      setPageError(getActionErrorMessage(loadError, "staff.requests.load", "Unable to load booking requests."));
    } finally {
      setLoading(false);
    }
  }

  // Keep the request list live while staff stay on this page.
  // Status, facility name, and member name changes appear without a manual refresh.
  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};

    // Loads facility options for the filter dropdown.
    // Failure here only removes filter options, not the whole request list.
    async function updateFacilityOptions() {
      try {
        const nextFacilities = await getAllFacilityFilterOptions();
        if (active) {
          setFacilityOptions(nextFacilities);
        }
      } catch {
        if (active) {
          setFacilityOptions([]);
        }
      }
    }

    // Starts the request listener after filter options are loaded.
    async function startSubscription() {
      setLoading(true);
      await updateFacilityOptions();

      try {
        unsubscribe = await subscribeToStaffRequests(
          sessionProfile,
          (nextRequests) => {
            if (!active) {
              return;
            }

            const mappedRequests = sortStaffRequests(
              nextRequests
                .map(toPageItem)
                .filter((item) => STAFF_REQUEST_STATUS_SET.has(item.pageStatus)),
            );
            setItems(mappedRequests);
            setSelectedId((current) => (current && mappedRequests.some((item) => item.id === current) ? current : ""));
            setPageError("");
            setLoading(false);
            void updateFacilityOptions();
          },
          (subscriptionError) => {
            if (!active) {
              return;
            }
            setPageError(getActionErrorMessage(subscriptionError, "staff.requests.load", "Unable to keep booking requests up to date."));
            setLoading(false);
          },
        );
      } catch (subscriptionError) {
        if (active) {
          setPageError(getActionErrorMessage(subscriptionError, "staff.requests.load", "Unable to keep booking requests up to date."));
          setLoading(false);
        }
      }
    }

    if (sessionProfile?.id) {
      startSubscription();
    }

    return () => {
      active = false;
      unsubscribe();
    };
  }, [sessionProfile]);

  // Filter request cards by activity date, facility, and status.
  const visibleItems = useMemo(() => {
    return sortStaffRequests(
      items.filter((item) => {
        if (!STAFF_REQUEST_STATUS_SET.has(item.pageStatus)) {
          return false;
        }

        console.log
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

    // Load the conflict summary for the selected request.
    // Staff use this warning before choosing approve, reject, or suggest.
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
            message: getActionErrorMessage(summaryError, "booking.availability", "The latest time-slot availability could not be loaded."),
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

    // Load open time slots from the same facility.
    // Staff can use these slots when suggesting another option.
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

    // Load alternative facilities with the same sport and same open time.
    // Staff can use these facilities when suggesting another option.
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
              // Staff can still review other alternatives if one facility cannot be checked.
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

  // Clear request filters and page messages.
  // Staff return to the full request list while the decision modal stays separate.
  function clearFilters() {
    setFilters({
      date: "",
      facility: "",
      status: "",
    });
    setPageError("");
    setPageMessage("");
  }

  // Toggles the selected request detail panel.
  function toggleSelection(id) {
    setSelectedId((current) => (current === id ? "" : id));
  }

  // Open the decision modal for reject or suggest.
  // Staff get a fresh message box for the decision they are writing now.
  function openDecision(type) {
    setDecision({
      type,
      text: "",
    });
    setDecisionError("");
    setPageMessage("");
    setPageError("");
  }

  // Close the decision modal and clear the staff response text.
  function closeDecision() {
    setDecision(getInitialDecisionState());
    setDecisionError("");
  }

  // Approve the selected pending request.
  // After approval, reload the same request so staff can see the new read only state.
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
      setPageError(getActionErrorMessage(approvalError, "booking.approval", "Unable to process this booking request."));
    } finally {
      setProcessingAction("");
    }
  }

  // Submit a rejection or suggested change.
  // Staff must type a message before the request status is sent.
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
      setDecisionError(getActionErrorMessage(decisionRequestError, "booking.approval", "Unable to process this booking request."));
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

      {/* Request filter form for activity date, facility, and status. */}
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

      {/* Request card list with one expandable detail panel. */}
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
                    {/* Detail header with facility name and request timestamp. */}
                    <div className="staff-request-detail__head">
                      <h2>{selectedItem.facilityName}</h2>
                        <p className="staff-request-detail__requestId">{getDetailTimestampLabel(selectedItem)}</p>
                    </div>

                    {/* Conflict warning based on the latest time slot check. */}
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

                    {/* Main request information from the member booking form. */}
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
                        {/* Alternative time slots for the same facility. */}
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

                        {/* Alternative facilities for the same sport and time. */}
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

                        {/* Staff decision buttons for the selected pending request. */}
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
                        {/* Read only state for requests that are already processed. */}
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

      {/* Decision modal for rejection reason or alternative suggestion text. */}
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

              {/* Text field for the staff response. */}
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

// Small icon used beside read only request messages.
function CalendarAlert() {
  return <AlertTriangle size={18} />;
}
