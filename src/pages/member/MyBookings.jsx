// This member page shows historica bookings content.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, query, where, onSnapshot, or } from "firebase/firestore";
import { db } from "../../provider/FirebaseConfig";
import "../pageStyles.css";
import "./memberWorkspace.css";
import "./MyBookings.css";
import { cancelConfirmedBooking, getBookings, isBookingCancellationAllowed, withdrawPendingBooking,} from "../../services/bookingService";
import { useAuth } from "../../provider/AuthContext";
import { ROUTE_PATHS, getBookingDetailRoute } from "../../constants/routes";
import { getActionErrorMessage, getErrorCode } from "../../utils/errors";
import { displayStatus, statusTone } from "../../utils/presentation";
import { FilterField, FilterPanel } from "../../components/common/FilterControls";
import PageLayout from "../../components/common/PageLayout";
import { ButtonLink } from "../../components/common/Button";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import Toast from "../../components/common/Toast";

const ALL_STATUS_VALUE = "all";

// Request status
const BOOKING_STATUS_OPTIONS = [
  "pending",
  "rejected",
  "alternative suggested",
  "upcoming",
  "completed",
  "cancelled",
  "no_show",
];
const BOOKING_VISIBLE_STATUS_SET = new Set(BOOKING_STATUS_OPTIONS);

// Generate a date string (YYYY-MM-DD) offset by a specific number of days from today
function getDateInputKey(daysFromToday = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// The maximum allowed date for booking activity filtering (7 days from today)
const MAX_ACTIVITY_DATE_KEY = getDateInputKey(7);

// Normalize the booking status string to match backend values
function normalizeBookingStatus(value = "") {
  const source = Array.isArray(value) ? value.find(Boolean) : value;
  const normalized = String(source || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  const compact = normalized.replace(/\s+/g, "");
  if (compact === "noshow") {
    return "no_show";
  }

  if (normalized === "suggested" || normalized === "suggested alternative") {
    return "alternative suggested";
  }

  if (normalized === "complete") {
    return "completed";
  }

  if (normalized === "accepted") {
    return "upcoming";
  }

  return normalized;
}

// Standardize the date format to YYYY-MM-DD
function normalizeDateKey(value = "") {
  const source = String(value || "").trim();
  if (!source) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(source)) {
    return source;
  }

  const parsed = new Date(source);
  if (Number.isNaN(parsed.getTime())) {
    return source.slice(0, 10);
  }

  return parsed.toISOString().slice(0, 10);
}

// Standardize the time format to HH:MM
function normalizeTimeValue(value = "") {
  const source = String(value || "").trim();
  if (!source) {
    return "";
  }

  if (/^\d{2}:\d{2}$/.test(source)) {
    return source;
  }

  if (/^\d{1,2}$/.test(source)) {
    return `${source.padStart(2, "0")}:00`;
  }

  return source.slice(0, 5);
}

// Convert a time string into minutes from midnight for sorting
function toSortableHour(value = "") {
  const normalized = normalizeTimeValue(value);
  const [hours = "0", minutes = "0"] = normalized.split(":");
  return Number(hours) * 60 + Number(minutes);
}

// Sort bookings by date (newest first), then by time, then by creation time
function sortBookingsNewestFirst(items) {
  return [...items].sort((left, right) => {
    const leftDate = normalizeDateKey(left.date);
    const rightDate = normalizeDateKey(right.date);

    if (leftDate !== rightDate) {
      return rightDate.localeCompare(leftDate);
    }

    const timeGap = toSortableHour(right.startTime || right.raw?.start_time) - toSortableHour(left.startTime || left.raw?.start_time);
    if (timeGap !== 0) {
      return timeGap;
    }

    const leftCreated = left.createdAt ? new Date(left.createdAt).getTime() : 0;
    const rightCreated = right.createdAt ? new Date(right.createdAt).getTime() : 0;
    return rightCreated - leftCreated;
  });
}

// Format the booking title, combining facility name and sport type
function formatTitle(booking) {
  const facilityName = String(booking.facilityName || "Facility").trim();
  const sportType = String(booking.sportType || "").trim();

  if (!sportType) {
    return facilityName;
  }

  if (facilityName.toLowerCase().includes(sportType.toLowerCase())) {
    return facilityName;
  }

  return `${facilityName} - ${sportType}`;
}

// Format the combined date and time string for display
function formatDateTimeLine(booking) {
  const date = normalizeDateKey(booking.date) || "Unknown date";
  const time = booking.time || `${normalizeTimeValue(booking.startTime || booking.raw?.start_time)} - ${normalizeTimeValue(booking.endTime || booking.raw?.end_time)}`;
  return `${date} | ${time}`;
}

// Map backend action errors to user-friendly messages for withdraw/cancel actions
function mapBookingActionError(action, error) {
  const code = getErrorCode(error);

  if (action === "withdraw") {
    if (code === "failed-precondition" || code === "aborted") {
      return "This request can no longer be withdrawn because its status has changed.";
    }

    if (code === "permission-denied") {
      return "You do not have permission to withdraw this request.";
    }
  }

  if (action === "cancel") {
    if (code === "deadline-exceeded") {
      return "This booking can no longer be cancelled because it starts in less than 2 hours.";
    }

    if (code === "failed-precondition" || code === "aborted") {
      return "This booking can no longer be cancelled because its status has changed.";
    }

    if (code === "permission-denied") {
      return "You do not have permission to cancel this booking.";
    }
  }

  return getActionErrorMessage(error, "booking.update", "Unable to update the selected booking.");
}

export default function MyBookings() {
  // User authentication context
  const { sessionProfile } = useAuth();
  
  // Hooks
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [filters, setFilters] = useState({ status: ALL_STATUS_VALUE, date: "" });
  const [pendingAction, setPendingAction] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Load real data when this part opens or changes.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    let isInitialLoad = true;

    async function loadItems() {
      // To prevent screen flickering on every background data change, only show loading state on the initial load
      if (isInitialLoad) {
        setLoading(true);
      }
      try {
        const nextItems = await getBookings(sessionProfile);
        if (!cancelled) {
          setItems(sortBookingsNewestFirst(nextItems));
          setError("");
        }
      } catch (loadError) {
        if (!cancelled) {
          setItems([]);
          setError(getActionErrorMessage(loadError, "booking.load", "Unable to load your booking records right now."));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          isInitialLoad = false;
        }
      }
    }

    if (!sessionProfile?.id) {
      setItems([]);
      setLoading(false);
      return;
    }

    // Real-time listener for requests
    // When the status of reqests changed, the page needs re-resering
    const q = query(
      collection(db, "request"),
      or(
        where("member_id", "==", sessionProfile.id),
        where("participant_ids", "array-contains", sessionProfile.id)
      )
    );
    unsubscribe = onSnapshot(q, () => {
      loadItems(); 
    }, (err) => {
      if (!cancelled) {
        console.error("Real-time listener error:", err);
        loadItems(); 
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [sessionProfile]);

  // Build the list that the user can see.
  const visibleItems = useMemo(() => {
    return items.filter((booking) => {
      const status = normalizeBookingStatus(booking.status || booking.raw?.status);
      const date = normalizeDateKey(booking.date);

      if (!BOOKING_VISIBLE_STATUS_SET.has(status)) {
        return false;
      }

      if (filters.status !== ALL_STATUS_VALUE && status !== filters.status) {
        return false;
      }

      if (filters.date && date !== filters.date) {
        return false;
      }

      return true;
    });
  }, [filters, items]);


  // Reset the status and date filters to their default values
  function handleClearFilters() {
    const nextFilters = { status: ALL_STATUS_VALUE, date: "" };
    setFilters(nextFilters);
    setToast(null);
  }

  // Open the confirmation dialog for a specific action (withdraw/cancel)
  function handleRequestAction(type, booking) {
    setError("");
    setToast(null);
    setPendingAction({ type, booking });
  }

  // Execute the confirmed action (withdraw/cancel) on the selected booking
  async function handleConfirmAction() {
    if (!pendingAction?.booking) {
      return;
    }

    const { type, booking } = pendingAction;
    setActionLoading(true);

    try {
      if (type === "withdraw") {
        await withdrawPendingBooking(booking.id, sessionProfile);
        setPendingAction(null);
        // Since onSnapshot is active, Firestore changes will automatically trigger a data refresh; no need to manually call refreshBookings
        setToast({ tone: "success", title: "Updated", message: "The booking request was withdrawn successfully." });
        return;
      }

      if (type === "cancel") {
        if (!isBookingCancellationAllowed(booking.raw)) {
          throw Object.assign(new Error("deadline-exceeded"), { code: "deadline-exceeded" });
        }

        await cancelConfirmedBooking(booking.id, sessionProfile);
        setPendingAction(null);
        setToast({ tone: "success", title: "Updated", message: "The booking was cancelled successfully." });
      }
    } catch (actionError) {
      setToast({
        tone: "error",
        title: "Action failed",
        message: mapBookingActionError(type, actionError),
      });
    } finally {
      setActionLoading(false);
      setPendingAction(null);
    }
  }

  /****************************************************************************************88 */
  // Main Rendering
  return (
    <PageLayout
      className="my-bookings-page"
      title="My Bookings"
      subtitle="View your booking records and check the latest reservation status."
      actions={
        <ButtonLink className="my-bookings__heroButton" to={ROUTE_PATHS.FACILITIES}>
          Book New Facility
        </ButtonLink>
      }
    >
      <Toast toast={toast} onClose={() => setToast(null)} />

      {error ? (
        <div className="member-alert member-alert--error">
          <strong>Action failed</strong>
          <p>{error}</p>
        </div>
      ) : null}

      {/* Filters section */}
      <FilterPanel
        className="my-bookings__filters"
        columns={2}
        onClear={handleClearFilters}
      >
          <FilterField id="booking-status-filter" label="Status">
            <select
              id="booking-status-filter"
              value={filters.status}
              onChange={(event) => {
                setFilters((prev) => ({ ...prev, status: event.target.value }));
                setToast(null);
              }}
            >
              <option value={ALL_STATUS_VALUE}>All Status</option>
              {BOOKING_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {displayStatus(status)}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField id="booking-date-filter" label="Activity Date">
            <input
              id="booking-date-filter"
              type="date"
              max={MAX_ACTIVITY_DATE_KEY}
              value={filters.date}
              onChange={(event) => {
                setFilters((prev) => ({ ...prev, date: event.target.value }));
                setToast(null);
              }}
            />
          </FilterField>
      </FilterPanel>

      {/* Booking records list */}
      <section className="my-bookings__list" aria-live="polite">
        {loading ? (
          <article className="member-empty my-bookings__empty">
            <p>Loading your booking records...</p>
          </article>
        ) : visibleItems.length ? (
          visibleItems.map((booking) => {
            const status = normalizeBookingStatus(booking.status || booking.raw?.status);
            const showWithdraw = booking.isOwner && status === "pending";
            const showCancel = booking.isOwner && isBookingCancellationAllowed(booking);

            return (
              <article key={booking.id} className="my-bookings__item">
                <div className="my-bookings__itemMain">
                  {/* Basic info displaying Title, Date, and Created time */}
                  <div className="my-bookings__itemTop">
                    <div className="my-bookings__itemHeading">
                      <h3>{formatTitle(booking)}</h3>
                      <p>{formatDateTimeLine(booking)}</p>
                      <p className="my-bookings__createdAt">
                        Created At: {booking.createdAt || "Not available"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="my-bookings__itemControls">
                  {/* Booking status pill and action buttons */}
                  <span className={`status-pill ${statusTone(status)}`}>{displayStatus(status)}</span>

                  <div className="my-bookings__itemActions">
                    <Link className="btn-secondary my-bookings__actionButton" to={getBookingDetailRoute(booking.id)}>
                      View Details
                    </Link>

                    {showWithdraw ? (
                      <button
                        className="btn-danger my-bookings__dangerAction"
                        type="button"
                        onClick={() => handleRequestAction("withdraw", booking)}
                      >
                        Withdraw Request
                      </button>
                    ) : null}

                    {showCancel ? (
                      <button
                        className="btn-danger my-bookings__dangerAction"
                        type="button"
                        onClick={() => handleRequestAction("cancel", booking)}
                      >
                        Cancel Booking
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <article className="member-empty my-bookings__empty">
            <p>No booking records match the current filters.</p>
          </article>
        )}
      </section>

      {/* Action confirmation dialog */}
      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={
          pendingAction?.type === "withdraw"
            ? "Do you want to withdraw this pending request?"
            : "Do you want to cancel this upcoming booking?"
        }
        description={
          pendingAction?.booking
            ? `${formatTitle(pendingAction.booking)} - ${formatDateTimeLine(pendingAction.booking)}`
            : ""
        }
        confirmLabel={pendingAction?.type === "withdraw" ? "Withdraw Request" : "Cancel Booking"}
        cancelLabel="Keep Booking"
        tone="danger"
        pending={actionLoading}
        onCancel={() => {
          if (!actionLoading) {
            setPendingAction(null);
          }
        }}
        onConfirm={handleConfirmAction}
      />
    </PageLayout>
  );
}
