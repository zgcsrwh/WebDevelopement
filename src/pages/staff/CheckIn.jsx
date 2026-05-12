// Staff use this screen to check in members for bookings happening today.
// The page has filters, booking cards, and a detail panel for the selected row.
// Staff only see the confirm button when the booking is ready for check in.
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";
import "../pageStyles.css";
import "./CheckIn.css";
import {
  checkInBooking,
  getAllFacilityFilterOptions,
  getStaffCheckInPageStatus,
  getStaffCheckIns,
  isBookingCheckInOpen,
  subscribeToStaffCheckIns,
} from "../../services/bookingService";
import { useAuth } from "../../provider/AuthContext";
import { getActionErrorMessage } from "../../utils/errors";
import { displayStatus, statusTone } from "../../utils/presentation";
import { formatStaffDateTime, getDateInputMaxValue, toDateInputValue } from "../../utils/staffPages";
import { FilterField, FilterPanel } from "../../components/common/FilterControls";
import PageLayout from "../../components/common/PageLayout";
import StaffListCard from "../../components/staff/StaffListCard";

const CHECK_IN_STATUS_OPTIONS = ["accepted"];
const CHECK_IN_PAGE_STATUSES = new Set(CHECK_IN_STATUS_OPTIONS);

const todayKey = new Date().toISOString().slice(0, 10);

// Makes the date text used on each booking card.
// A booking for the current day is shown as Today.
// Strange old values are kept as they are so the card still shows something.
function formatDateLabel(value = "") {
  if (!value) {
    return "";
  }

  if (value === todayKey) {
    return "Today";
  }

  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

// Orders the booking cards in the list.
// Newer dates and later start times come first.
// When two rows look the same, the newer request is placed higher.
function sortCheckInItems(items = []) {
  return [...items].sort((left, right) => {
    if (left.date !== right.date) {
      return String(right.date || "").localeCompare(String(left.date || ""));
    }

    if (left.startTime !== right.startTime) {
      return String(right.startTime || "").localeCompare(String(left.startTime || ""));
    }

    return String(right.createdAt || "").localeCompare(String(left.createdAt || ""));
  });
}

// Adds the status used by this check in screen.
// A booking can still be stored as accepted after its start time.
// In that case the page shows it as no show without changing the database.
function toPageItem(item, now) {
  return {
    ...item,
    pageStatus: getStaffCheckInPageStatus(item.raw || item, now),
  };
}

// Makes the name list in the booking detail panel.
// The applicant appears first and invited friends come after.
// Repeated names are removed so the panel does not look messy.
function getParticipants(item) {
  return [item.memberName, ...(Array.isArray(item.participantNames) ? item.participantNames : [])].filter(
    (participant, index, participants) => Boolean(participant) && participants.indexOf(participant) === index,
  );
}

// Chooses the notice at the top of the detail panel.
// The notice explains the current booking status in plain text.
// It also tells staff why the confirm button can or cannot be used.
function getStatusBanner(item, canCheckIn) {
  if (item.pageStatus === "accepted") {
    if (canCheckIn) {
      return {
        tone: "accepted",
        title: "Ready for Check-in",
        body: "The member has arrived within the valid time window.",
      };
    }

    return {
      tone: "accepted",
      title: "Awaiting Check-in Window",
      body: "Check-in opens 15 minutes before the session starts and closes when the session begins.",
    };
  }

  if (item.pageStatus === "completed") {
    return {
      tone: "completed",
      title: "Check-in Completed",
      body: "This booking has already been checked in and is now read-only.",
    };
  }

  if (item.pageStatus === "cancelled") {
    return {
      tone: "cancelled",
      title: "Booking Cancelled",
      body: "This booking was cancelled and can no longer be checked in.",
    };
  }

  if (item.pageStatus === "no_show") {
    return {
      tone: "no_show",
      title: "No-show Recorded",
      body: "The check-in window has passed or the booking was marked as no-show.",
    };
  }

  return {
    tone: "unknown",
    title: "Read-only Booking",
    body: "This booking cannot be checked in from the current state.",
  };
}

// Builds the short history shown in the detail panel.
// It includes the request time when that value exists.
// Finished bookings also show when staff last updated the booking.
function getHistoryEntries(item, pageStatus) {
  const entries = [];

  if (item.createdAt) {
    entries.push(`Request submitted on ${formatStaffDateTime(item.createdAt)}`);
  }

  if (item.completedAt) {
    entries.push(`Staff last updated this booking on ${formatStaffDateTime(item.completedAt)}`);
  }

  return entries;
}

// Gives the message for bookings that staff cannot check in.
// Completed, cancelled, and no show bookings each need a different reason.
// The text appears in the place where the confirm button would normally be.
function getReadonlyMessage(item) {
  if (item.pageStatus === "completed") {
    return "This booking has already been checked in.";
  }
  if (item.pageStatus === "cancelled") {
    return "This booking was cancelled.";
  }
  if (item.pageStatus === "no_show") {
    return "This booking is marked as no-show.";
  }
  return "This booking cannot be checked in from the current state.";
}

// Main staff check in page.
// The screen has a filter bar, a list of booking cards, and one open detail card.
// It loads live booking data and sends the confirm arrival action.
export default function CheckIn() {
  const { sessionProfile } = useAuth();
  const [items, setItems] = useState([]);
  const [facilityOptions, setFacilityOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [filters, setFilters] = useState({
    search: "",
    requestId: "",
    facility: "",
    date: "",
  });
  const [pageMessage, setPageMessage] = useState("");
  const [pageError, setPageError] = useState("");
  const [checkingInId, setCheckingInId] = useState("");
  const [clockTick, setClockTick] = useState(Date.now());

  const now = useMemo(() => new Date(clockTick), [clockTick]);
  const staffCreatedDate = useMemo(
    () => toDateInputValue(sessionProfile?.created_at || sessionProfile?.createdAt),
    [sessionProfile?.createdAt, sessionProfile?.created_at],
  );
  const maxFilterDate = useMemo(() => getDateInputMaxValue(0), []);

  // Reload the booking list after staff confirm an arrival.
  // The preferred id is the row that should stay open after the data comes back.
  // If that row is gone, the detail panel closes.
  async function refresh(preferredId = "") {
    try {
      // The service returns rows with real member names for staff.
      // Sorting runs again because the status may have changed after the action.
      const nextItems = sortCheckInItems(await getStaffCheckIns(sessionProfile));
      setItems(nextItems);
      setSelectedId((current) => {
        // Keep the same row open after staff press Confirm Arrival.
        // This lets staff see the updated completed status right away.
        const candidate = preferredId || current;
        if (candidate && nextItems.some((item) => item.id === candidate)) {
          return candidate;
        }
        return "";
      });
      setPageError("");
    } catch (loadError) {
      setPageError(getActionErrorMessage(loadError, "staff.checkin.load", "Unable to load check-in bookings."));
    } finally {
      setLoading(false);
    }
  }

  // Update the local clock every minute.
  // The check in button depends on the current time.
  // This makes the button become available without waiting for a database update.
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setClockTick(Date.now());
    }, 60 * 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  // Load the first set of check in data and then start live updates.
  // The active flag stops old async work after the page is closed.
  // The unsubscribe value is saved so the listener can be stopped later.
  useEffect(() => {
    let active = true;
    let unsubscribe = null;

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

    // Load bookings and facility names before the listener sends its first update.
    // This fills the screen quickly when staff open the page.
    // If loading fails, the page shows an error instead of looking empty.
    async function loadPage() {
      setLoading(true);
      try {
        // The first load fills both the booking list and the facility filter.
        // Staff need both pieces before the page is useful.
        const [nextItems, nextFacilities] = await Promise.all([
          getStaffCheckIns(sessionProfile),
          getAllFacilityFilterOptions(),
        ]);
        if (!active) {
          return;
        }

        setItems(nextItems);
        setFacilityOptions(nextFacilities);
        setSelectedId("");
        setPageError("");
      } catch (loadError) {
        if (active) {
            setPageError(getActionErrorMessage(loadError, "staff.checkin.load", "Unable to load check-in bookings."));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }

      // Start the live listener after the first load.
      // Booking changes update status and buttons.
      // Facility or member changes update the names in the row cards.
      try {
        unsubscribe = await subscribeToStaffCheckIns(
          sessionProfile,
          (nextItems) => {
            if (!active) {
              return;
            }
            // Sort every new snapshot before showing it.
            // Facility filters are refreshed too in case assignments changed.
            setItems(sortCheckInItems(nextItems));
            void updateFacilityOptions();
            setLoading(false);
          },
          (subscriptionError) => {
            if (!active) {
              return;
            }
            setPageError(getActionErrorMessage(subscriptionError, "staff.checkin.load", "Unable to keep check-in bookings up to date."));
          },
        );
      } catch (subscriptionError) {
        if (active) {
          setPageError(getActionErrorMessage(subscriptionError, "staff.checkin.load", "Unable to keep check-in bookings up to date."));
        }
      }
    }

    if (sessionProfile?.id) {
      loadPage();
    }

    return () => {
      active = false;
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [sessionProfile]);

  // Build the rows that this screen can show.
  // The no show status is recalculated from the current clock.
  // Rows from other booking workflows are filtered out.
  const pageItems = useMemo(() => {
    return sortCheckInItems(
      items
        .map((item) => toPageItem(item, now))
        .filter((item) => CHECK_IN_PAGE_STATUSES.has(item.pageStatus)),
    );
  }, [items, now]);

  // Apply the staff search boxes and dropdown filters.
  // Staff can search by member name or request id.
  // The final list only keeps bookings scheduled for today.
  const visibleItems = useMemo(() => {
    const normalizedSearch = filters.search.trim().toLowerCase();
    const normalizedRequestId = filters.requestId.trim().toLowerCase();

    return sortCheckInItems(
      pageItems.filter((item) => {
        // Member name and request id search are optional.
        // An empty search box does not hide rows.
        const searchMatch = !normalizedSearch || item.memberName.toLowerCase().includes(normalizedSearch);
        const requestIdMatch = !normalizedRequestId || item.id.toLowerCase().includes(normalizedRequestId);
        // Facility can match by id or name.
        // This keeps old and new mapped rows working with the same filter.
        const facilityMatch = !filters.facility || item.facilityId === filters.facility || item.facilityName === filters.facility;
        // This screen only handles bookings scheduled for today.
        const dateMatch = item.date === todayKey;
        return searchMatch && requestIdMatch && facilityMatch && dateMatch;
      }),
    );
  }, [filters.search, filters.requestId, filters.facility, pageItems]);

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
  const canCheckIn = useMemo(
    () => (selectedItem?.pageStatus === "accepted" ? isBookingCheckInOpen(selectedItem.raw, now) : false),
    [now, selectedItem],
  );

  // Clear every filter and old page message.
  // The list goes back to the normal view for today.
  // Any old success or error text is removed.
  function clearFilters() {
    setFilters({
      search: "",
      requestId: "",
      facility: "",
      date: "",
    });
    setPageError("");
    setPageMessage("");
  }

  // Open or close a booking detail card.
  // Clicking a new row selects it.
  // Clicking the selected row again folds the detail card away.
  function toggleSelection(id) {
    setSelectedId((current) => (current === id ? "" : id));
  }

  // Confirm that the member has arrived for the selected booking.
  // It only runs for accepted bookings during the valid check in time.
  // After the action works, the same row stays open with the new status.
  async function handleConfirmArrival() {
    if (!selectedItem || selectedItem.pageStatus !== "accepted" || !canCheckIn) {
      return;
    }

    // Save the selected id so only this row shows loading.
    // Other booking cards stay readable while the request is sent.
    setCheckingInId(selectedItem.id);
    setPageError("");
    setPageMessage("");

    try {
      // The backend updates the booking status and handles the member notification.
      // The page reloads after that so the completed status appears right away.
      await checkInBooking({ request_id: selectedItem.id }, sessionProfile);
      setPageMessage(`Request ${selectedItem.id} was checked in successfully.`);
      await refresh(selectedItem.id);
    } catch (checkInError) {
      setPageError(getActionErrorMessage(checkInError, "staff.checkin.confirm", "Unable to confirm arrival for this booking."));
    } finally {
      setCheckingInId("");
    }
  }

  return (
    <PageLayout
      className="staff-checkin-page"
      title="Bookings Archive"
      subtitle="Track, verify, and manage all booking statuses from here."
    >

      {pageError ? (
        <section className="staff-checkin-banner staff-checkin-banner--error">
          <strong>Cannot continue</strong>
          <p>{pageError}</p>
        </section>
      ) : null}

      {pageMessage ? (
        <section className="staff-checkin-banner staff-checkin-banner--success">
          <strong>Success</strong>
          <p>{pageMessage}</p>
        </section>
      ) : null}

      <FilterPanel
        className="staff-checkin-filters"
        columns={3}
        onClear={clearFilters}
      >
          <FilterField id="staff-checkin-member" label="Member Name">
            <input
              id="staff-checkin-member"
              type="text"
              value={filters.search}
              onChange={(event) => {
                setFilters((previous) => ({ ...previous, search: event.target.value }));
                setPageError("");
                setPageMessage("");
              }}
              placeholder="Search member name"
            />
          </FilterField>

          <FilterField id="staff-checkin-requestId" label="Request ID">
            <input
              id="staff-checkin-requestId"
              type="text"
              value={filters.requestId}
              onChange={(event) => {
                setFilters((previous) => ({ ...previous, requestId: event.target.value }));
                setPageError("");
                setPageMessage("");
              }}
              placeholder="Search Request ID"
            />
          </FilterField>

          <FilterField id="staff-checkin-facility" label="Facility">
            <select
              id="staff-checkin-facility"
              value={filters.facility}
              onChange={(event) => {
                setFilters((previous) => ({ ...previous, facility: event.target.value }));
                setPageError("");
                setPageMessage("");
              }}
            >
              <option value="">All Facilities</option>
              {facilityOptions.map((facility) => (
                <option key={facility.id} value={facility.id}>{facility.name}</option>
              ))}
            </select>
          </FilterField>
      </FilterPanel>


      <section className="staff-checkin-layout">
        <div className="staff-checkin-list">
          {loading ? (
            <div className="staff-checkin-empty">
              <p>Loading check-in bookings...</p>
            </div>
          ) : visibleItems.length > 0 ? (
            visibleItems.map((item) => (
              <div key={item.id} className="staff-checkin-group">
                <StaffListCard
                  isActive={selectedItem?.id === item.id}
                  onClick={() => toggleSelection(item.id)}
                  gridTemplateColumns="2fr 1.8fr 1fr 0.7fr 1fr 1fr"
                  cells={[
                    { label: "Facility", value: item.facilityName, title: item.facilityName },
                    { label: "Request ID", value: item.id, title: item.id },
                    { label: "Member", value: item.memberName, title: item.memberName },
                    { label: "Date", value: formatDateLabel(item.date) },
                    { label: "Time", value: `${item.startTime} - ${item.endTime}` },
                    { label: "Status", value: displayStatus(item.pageStatus), isStatus: true, statusTone: statusTone(item.pageStatus) },
                  ]}
                />

                {selectedItem?.id === item.id ? (
                  <div className="staff-checkin-detail__card">
                    <div className="staff-checkin-detail__head">
                      <div>
                        <h2>{selectedItem.facilityName}</h2>
                        <p className="staff-checkin-detail__requestId">Request ID: {selectedItem.id}</p>
                      </div>
                      <span className={`status-pill ${statusTone(selectedItem.pageStatus)}`}>
                        {displayStatus(selectedItem.pageStatus)}
                      </span>
                    </div>

                    <div className={`staff-checkin-detail__banner is-${selectedItem.pageStatus}`}>
                      {["accepted", "completed"].includes(selectedItem.pageStatus) ? (
                        <CheckCircle2 size={24} />
                      ) : (
                        <AlertTriangle size={24} />
                      )}
                      <div>
                        <strong>{getStatusBanner(selectedItem, canCheckIn).title}</strong>
                        <p>{getStatusBanner(selectedItem, canCheckIn).body}</p>
                      </div>
                    </div>

                    <div className="staff-checkin-detail__grid">
                      <div>
                        <span>Member Name</span>
                        <strong>{selectedItem.memberName}</strong>
                      </div>
                      <div>
                        <span>Attendees</span>
                        <strong>{selectedItem.attendees} People</strong>
                      </div>
                      <div>
                        <span>Date</span>
                        <strong>{formatDateLabel(selectedItem.date)}</strong>
                      </div>
                      <div>
                        <span>Time Slot</span>
                        <strong>
                          {selectedItem.startTime} - {selectedItem.endTime}
                        </strong>
                      </div>
                    </div>

                    <div className="staff-checkin-detail__section">
                      <h3>Participants</h3>
                      <div className="staff-checkin-detail__tags">
                        {getParticipants(selectedItem).map((participant) => (
                          <span key={participant}>{participant}</span>
                        ))}
                      </div>
                    </div>

                    <div className="staff-checkin-detail__section">
                      <h3>Order History</h3>
                      <ul className="staff-checkin-detail__history">
                        {getHistoryEntries(selectedItem, selectedItem.pageStatus).map((entry) => (
                          <li key={entry}>{entry}</li>
                        ))}
                      </ul>
                    </div>

                    {selectedItem.pageStatus === "accepted" ? (
                      <div className="staff-checkin-detail__actions">
                        <button
                          className="btn staff-checkin-detail__action"
                          type="button"
                          disabled={checkingInId !== "" || !canCheckIn}
                          onClick={handleConfirmArrival}
                        >
                          {checkingInId === selectedItem.id ? "Confirming..." : "Confirm Arrival"}
                        </button>
                        {!canCheckIn ? (
                          <span className="staff-checkin-detail__note">
                            Check-in is available from 15 minutes before the session starts.
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <div className="staff-checkin-detail__readonly">
                        <Clock3 size={18} />
                        <span>{getReadonlyMessage(selectedItem)}</span>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <div className="staff-checkin-empty">
              <p>No bookings match the current check-in filters.</p>
            </div>
          )}
        </div>
      </section>
    </PageLayout>
  );
}
