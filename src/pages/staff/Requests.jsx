// Staff use this page to handle booking requests from members.
// The screen has filters, request cards, and a detail area for the selected request.
// Staff can approve, reject, or send a suggested change from this page.
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

const STAFF_REQUEST_STATUSES = ["pending", "accepted", "rejected", "alternative suggested", "cancelled"];
const STAFF_REQUEST_STATUS_SET = new Set(STAFF_REQUEST_STATUSES);
const STATUS_FILTER_OPTIONS = STAFF_REQUEST_STATUSES.map((status) => ({ value: status, label: status }));

// Put the newest requests at the top of the list.
// Staff usually check the latest request first.
// Empty dates are treated like blank text so sorting will not break.
function sortStaffRequests(items = []) {
  return [...items].sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
}

// Make the short date text used on a request card.
// The stored date is not changed.
// Bad date values are returned as they came in so staff still see something.
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

// Make the small time label at the bottom of a request card.
// Staff use it to see when the member submitted the request.
function getCardFooterLabel(item) {
  return formatStaffCardTimestamp(item.createdAt);
}

// Make the id and time line in the detail panel.
// Finished requests show when they were completed.
// Requests still waiting show when they were submitted.
function getDetailTimestampLabel(item) {
  if (item.completedAt) {
    return `Request ID: ${item.id} / Completed ${formatStaffDateTime(item.completedAt)}`;
  }

  return `Request ID: ${item.id} / Submitted ${formatStaffDateTime(item.createdAt)}`;
}

// Make the member list shown in request details.
// The applicant appears first and invited friends appear after.
// Repeated names are removed so the panel stays clean.
function getParticipants(item) {
  return [item.memberName, ...(Array.isArray(item.participantNames) ? item.participantNames : [])].filter(
    (participant, index, participants) => Boolean(participant) && participants.indexOf(participant) === index,
  );
}

// Make a clean modal state for reject and suggest actions.
// The modal starts with no action type and no typed message.
function getInitialDecisionState() {
  return {
    type: "",
    text: "",
  };
}

// Convert the stored request status into the page status.
// The stored suggested state is shown as alternative suggested for staff.
// Other statuses keep their normal meaning.
function toPageItem(item) {
  return {
    ...item,
    pageStatus: getStaffRequestPageStatus(item.status),
  };
}

// Main request review page for staff.
// It looks like a filter bar above request cards, with a detail panel beside the list.
// It keeps the list live and sends staff decisions to the booking action.
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

  // Reload requests after staff approve, reject, or suggest a change.
  // Facility options are loaded again because names or assignments can change.
  // The same request stays open if it is still in the list.
  async function refresh(preferredId = "") {
    setLoading(true);
    try {
      // Load request rows and facility names together.
      // The list needs requests and the filter needs facility options.
      const [nextRequests, nextFacilities] = await Promise.all([
        getStaffRequests(sessionProfile),
        getAllFacilityFilterOptions(),
      ]);
      // Prepare the page status before rendering.
      // The suggested state becomes alternative suggested here.
      const mappedRequests = sortStaffRequests(
        nextRequests.map(toPageItem).filter((item) => STAFF_REQUEST_STATUS_SET.has(item.pageStatus)),
      );
      setItems(mappedRequests);
      setFacilityOptions(nextFacilities);

      setSelectedId((current) => {
        // Keep the same detail panel open when possible.
        // Close it if the request no longer belongs in the staff list.
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

  // Start live updates for the request page.
  // Request changes update status text and action buttons.
  // Member and facility changes update the names in the cards.
  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};

    // Load facility names for the dropdown.
    // If this fails, the request list can still show without those options.
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

    // Start the request listener after the first facility load.
    // Each update is shaped into page rows before React renders it.
    async function startSubscription() {
      setLoading(true);
      await updateFacilityOptions();

      try {
        // The service watches requests, facilities, and members.
        // Rows come back with real member names for staff work.
        // This page only filters them and shows them.
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
            // Close the detail panel when the selected row no longer belongs here.
            // Another staff action can move a request out of this view.
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

  // Apply the filter panel to the request cards.
  // Staff can filter by date, facility, and status.
  // The filtered list keeps the newest requests first.
  const visibleItems = useMemo(() => {
    return sortStaffRequests(
      items.filter((item) => {
        // Hide request states that this page does not handle.
        // This keeps odd backend states out of the staff list.
        if (!STAFF_REQUEST_STATUS_SET.has(item.pageStatus)) {
          return false;
        }

        // Facility can match by id or display name.
        // Some older rows still carry the name instead of the id.
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

    // Check whether the selected request still owns its time slots.
    // The result controls the warning near the approve button.
    // Staff use it before choosing approve, reject, or suggest.
    async function loadConflictSummary() {
      if (!selectedItem) {
        setConflictSummary(null);
        return;
      }

      try {
        // Ask the service for the latest slot state.
        // A conflict means staff should not approve this request directly.
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

    // Load open slots in the same facility.
    // Staff can use these slots when writing a suggested change.
    // This only matters for pending requests.
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

    // Find other normal facilities with the same sport and open time.
    // These are possible options when staff need to suggest a change.
    // The search stops if the selected request changes.
    async function loadAlternativeFacilities() {
      if (!selectedItem || selectedItem.pageStatus !== "pending") {
        setAlternativeFacilities(null);
        return;
      }
      try {
        // First collect facilities with the same sport.
        // Staff should not suggest a different activity by mistake.
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
              // Then check the time slots for that date.
              // A normal facility can still have that hour locked.
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
              // Skip this facility when its slots cannot be loaded.
              // It is better to hide an uncertain option than suggest a bad one.
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

  // Clear the filters and old page messages.
  // The request cards go back to the default view.
  // The decision modal is left alone because this button only controls filters.
  function clearFilters() {
    setFilters({
      date: "",
      facility: "",
      status: "",
    });
    setPageError("");
    setPageMessage("");
  }

  // Open or close the detail panel for a request.
  // Clicking a new card shows that request.
  // Clicking the same card again hides the detail panel.
  function toggleSelection(id) {
    setSelectedId((current) => (current === id ? "" : id));
  }

  // Open the modal for rejecting or suggesting a change.
  // The type decides what the submit button will send.
  // Old modal errors are cleared before staff type a new message.
  function openDecision(type) {
    setDecision({
      type,
      text: "",
    });
    setDecisionError("");
    setPageMessage("");
    setPageError("");
  }

  // Close the decision modal.
  // The typed response and modal error are cleared.
  function closeDecision() {
    setDecision(getInitialDecisionState());
    setDecisionError("");
  }

  // Approve the selected pending request.
  // The backend action changes the real status and sends notifications.
  // After success, the same request stays open as a read only record.
  async function handleApprove() {
    if (!selectedItem || selectedItem.pageStatus !== "pending") {
      return;
    }

    // Approval does not need staff response text.
    // The field is still sent so the payload shape stays the same.
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
  // Staff must write a message so the member knows the reason.
  // The same booking action receives both choices.
  async function submitDecision() {
    if (!selectedItem || selectedItem.pageStatus !== "pending" || !decision.type) {
      return;
    }

    // Reject and suggest actions need a reason.
    // Empty text is not useful for the member.
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
      // Send the new status and staff message to the booking action.
      // The live listener will pick up the updated row afterward.
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

// Small warning icon used beside read-only request messages.
function CalendarAlert() {
  return <AlertTriangle size={18} />;
}
