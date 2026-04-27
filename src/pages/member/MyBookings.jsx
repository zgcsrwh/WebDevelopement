import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "../pageStyles.css";
import "./memberWorkspace.css";
import "./MyBookings.css";
import {
  cancelConfirmedBooking,
  getBookings,
  isBookingCancellationAllowed,
  withdrawPendingBooking,
} from "../../services/bookingService";
import { useAuth } from "../../provider/AuthContext";
import { ROUTE_PATHS, getBookingDetailRoute } from "../../constants/routes";
import { getErrorCode, getErrorMessage } from "../../utils/errors";
import { statusTone } from "../../utils/presentation";

const ALL_STATUS_VALUE = "all";
const BOOKING_STATUS_OPTIONS = [
  "pending",
  "rejected",
  "alternative suggested",
  "upcoming",
  "completed",
  "cancelled",
  "no_show",
];
const HISTORY_STATUSES = new Set(["rejected", "alternative suggested", "completed", "cancelled", "no_show"]);
const TODAY_KEY = new Date().toISOString().slice(0, 10);

function normalizeBookingStatus(value = "") {
  const source = Array.isArray(value) ? value.find(Boolean) : value;
  return String(source || "")
    .trim()
    .toLowerCase()
    .replace(/-+/g, " ");
}

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

function toSortableHour(value = "") {
  const normalized = normalizeTimeValue(value);
  const [hours = "0", minutes = "0"] = normalized.split(":");
  return Number(hours) * 60 + Number(minutes);
}

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

function matchesTab(status, tab) {
  if (tab === "All") {
    return true;
  }

  if (tab === "Upcoming") {
    return status === "upcoming";
  }

  if (tab === "Pending") {
    return status === "pending";
  }

  if (tab === "History") {
    return HISTORY_STATUSES.has(status);
  }

  return true;
}

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

function formatDateTimeLine(booking) {
  const date = normalizeDateKey(booking.date) || "Unknown date";
  const time = booking.time || `${normalizeTimeValue(booking.startTime || booking.raw?.start_time)} - ${normalizeTimeValue(booking.endTime || booking.raw?.end_time)}`;
  return `${date} | ${time}`;
}

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

  return getErrorMessage(error, "Unable to update the selected booking.");
}

export default function MyBookings() {
  const { sessionProfile } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const [draftFilters, setDraftFilters] = useState({ status: ALL_STATUS_VALUE, date: "" });
  const [appliedFilters, setAppliedFilters] = useState({ status: ALL_STATUS_VALUE, date: "" });
  const [pendingAction, setPendingAction] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadItems() {
      if (!sessionProfile?.id) {
        setItems([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const nextItems = await getBookings(sessionProfile);
        if (!cancelled) {
          setItems(sortBookingsNewestFirst(nextItems));
          setError("");
        }
      } catch (loadError) {
        if (!cancelled) {
          setItems([]);
          setError(getErrorMessage(loadError, "Unable to load your booking records right now."));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadItems();
    return () => {
      cancelled = true;
    };
  }, [sessionProfile]);

  const visibleItems = useMemo(() => {
    return items.filter((booking) => {
      const status = normalizeBookingStatus(booking.status || booking.raw?.status);
      const date = normalizeDateKey(booking.date);

      if (appliedFilters.status !== ALL_STATUS_VALUE && status !== appliedFilters.status) {
        return false;
      }

      if (appliedFilters.date && date !== appliedFilters.date) {
        return false;
      }

      return matchesTab(status, activeTab);
    });
  }, [activeTab, appliedFilters, items]);

  async function refreshBookings(successMessage = "") {
    setLoading(true);
    try {
      const nextItems = await getBookings(sessionProfile);
      setItems(sortBookingsNewestFirst(nextItems));
      if (successMessage) {
        setMessage(successMessage);
      }
      setError("");
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Unable to refresh your booking list right now."));
    } finally {
      setLoading(false);
    }
  }

  function handleApplyFilters() {
    setAppliedFilters({
      status: draftFilters.status,
      date: draftFilters.date,
    });
    setMessage("");
  }

  function handleClearFilters() {
    const nextFilters = { status: ALL_STATUS_VALUE, date: "" };
    setDraftFilters(nextFilters);
    setAppliedFilters(nextFilters);
    setActiveTab("All");
    setMessage("");
  }

  function handleRequestAction(type, booking) {
    setError("");
    setMessage("");
    setPendingAction({ type, booking });
  }

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
        await refreshBookings("The booking request was withdrawn successfully.");
        return;
      }

      if (type === "cancel") {
        if (!isBookingCancellationAllowed(booking.raw)) {
          throw Object.assign(new Error("deadline-exceeded"), { code: "deadline-exceeded" });
        }

        await cancelConfirmedBooking(booking.id, sessionProfile);
        setPendingAction(null);
        await refreshBookings("The booking was cancelled successfully.");
      }
    } catch (actionError) {
      setError(mapBookingActionError(type, actionError));
    } finally {
      setActionLoading(false);
      setPendingAction(null);
    }
  }

  return (
    <div className="member-workspace my-bookings-page">
      <section className="member-hero my-bookings__hero">
        <div className="member-hero__top">
          <div>
            <h1>My Bookings</h1>
            <p>View your booking records and check the latest reservation status.</p>
          </div>
          <div className="member-hero__actions">
            <Link className="btn my-bookings__heroButton" to={ROUTE_PATHS.FACILITIES}>
              Book New Facility
            </Link>
          </div>
        </div>
      </section>

      {error ? (
        <div className="member-alert member-alert--error">
          <strong>Action failed</strong>
          <p>{error}</p>
        </div>
      ) : null}

      {message ? (
        <div className="member-alert member-alert--success">
          <strong>Updated</strong>
          <p>{message}</p>
        </div>
      ) : null}

      <section className="member-card my-bookings__filters">
        <div className="my-bookings__filterGrid">
          <div className="my-bookings__field">
            <label htmlFor="booking-status-filter">Status</label>
            <select
              id="booking-status-filter"
              value={draftFilters.status}
              onChange={(event) => setDraftFilters((prev) => ({ ...prev, status: event.target.value }))}
            >
              <option value={ALL_STATUS_VALUE}>All Status</option>
              {BOOKING_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div className="my-bookings__field">
            <label htmlFor="booking-date-filter">Date</label>
            <input
              id="booking-date-filter"
              type="date"
              max={TODAY_KEY}
              value={draftFilters.date}
              onChange={(event) => setDraftFilters((prev) => ({ ...prev, date: event.target.value }))}
            />
          </div>
        </div>

        <div className="my-bookings__filterActions">
          <button className="btn-ghost my-bookings__filterButton" type="button" onClick={handleClearFilters}>
            Clear
          </button>
          <button className="btn my-bookings__filterButton" type="button" onClick={handleApplyFilters}>
            Apply
          </button>
        </div>
      </section>

      <div className="my-bookings__tabs" role="tablist" aria-label="Booking status tabs">
        {["All", "Upcoming", "Pending", "History"].map((tab) => (
          <button
            key={tab}
            className={`my-bookings__tab${activeTab === tab ? " is-active" : ""}`}
            type="button"
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

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
                  <div className="my-bookings__itemTop">
                    <div className="my-bookings__itemHeading">
                      <h3>{formatTitle(booking)}</h3>
                      <p>{formatDateTimeLine(booking)}</p>
                    </div>

                    <span className={`status-pill ${statusTone(status)}`}>
                      {status}
                    </span>
                  </div>
                </div>

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
              </article>
            );
          })
        ) : (
          <article className="member-empty my-bookings__empty">
            <p>No booking records match the current filters.</p>
          </article>
        )}
      </section>

      {pendingAction ? (
        <div className="member-modal-overlay" role="presentation">
          <div className="member-modal" role="dialog" aria-modal="true" aria-labelledby="booking-action-title">
            <div>
              <p className="member-card__eyebrow">
                {pendingAction.type === "withdraw" ? "Withdraw Request" : "Cancel Booking"}
              </p>
              <h2 id="booking-action-title">
                {pendingAction.type === "withdraw"
                  ? "Do you want to withdraw this pending request?"
                  : "Do you want to cancel this upcoming booking?"}
              </h2>
            </div>
            <p>{formatTitle(pendingAction.booking)}</p>
            <p>{formatDateTimeLine(pendingAction.booking)}</p>
            <div className="member-modal__actions">
              <button className="btn-secondary" type="button" onClick={() => setPendingAction(null)} disabled={actionLoading}>
                Keep Booking
              </button>
              <button className="btn-danger" type="button" onClick={handleConfirmAction} disabled={actionLoading}>
                {actionLoading ? "Submitting..." : pendingAction.type === "withdraw" ? "Withdraw Request" : "Cancel Booking"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
