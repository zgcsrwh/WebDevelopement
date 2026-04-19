import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "../pageStyles.css";
import { cancelConfirmedBooking, getBookings, withdrawPendingBooking } from "../../services/bookingService";
import { useAuth } from "../../provider/AuthContext";
import { getErrorMessage } from "../../utils/errors";
import { displayStatus, statusTone } from "../../utils/presentation";

const statusOptions = [
  "pending",
  "accepted",
  "suggested",
  "rejected",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
];

export default function MyBookings() {
  const { sessionProfile } = useAuth();
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    status: "All",
    date: "",
    tab: "All",
  });

  const refresh = async () => {
    try {
      setItems(await getBookings(sessionProfile));
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Unable to load bookings."));
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function loadBookings() {
      try {
        const nextItems = await getBookings(sessionProfile);
        if (!cancelled) {
          setItems(nextItems);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(getErrorMessage(loadError, "Unable to load bookings."));
        }
      }
    }

    loadBookings();
    return () => {
      cancelled = true;
    };
  }, [sessionProfile]);

  const filteredItems = items.filter((booking) => {
    const statusMatch = filters.status === "All" || booking.status === filters.status;
    const dateMatch = !filters.date || booking.date === filters.date;
    let tabMatch = true;

    if (filters.tab === "Upcoming") {
      tabMatch = ["accepted", "in_progress"].includes(booking.status);
    } else if (filters.tab === "Pending") {
      tabMatch = ["pending", "suggested"].includes(booking.status);
    } else if (filters.tab === "History") {
      tabMatch = ["completed", "cancelled", "rejected", "no_show"].includes(booking.status);
    }

    return statusMatch && dateMatch && tabMatch;
  });

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <h1>My bookings</h1>
          <p>Track pending requests, confirmed sessions, invited bookings, and historical records using the live request collection.</p>
        </div>
        <div className="hero-actions">
          <Link className="btn" to="/bookings/new">Book new facility</Link>
        </div>
      </section>

      {error && (
        <section className="page-panel">
          <p className="errorMessage">{error}</p>
        </section>
      )}
      {message && (
        <section className="page-panel">
          <p className="successMessage">{message}</p>
        </section>
      )}

      <section className="page-panel">
        <h2>Filters</h2>
        <div className="filter-grid" style={{ marginTop: 16 }}>
          <div>
            <label>Status</label>
            <select
              value={filters.status}
              onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
            >
              <option value="All">All</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {displayStatus(status)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label>Date</label>
            <input
              type="date"
              value={filters.date}
              onChange={(event) => setFilters((prev) => ({ ...prev, date: event.target.value }))}
            />
          </div>
        </div>
        <div className="tags-row" style={{ marginTop: 16 }}>
          {["All", "Upcoming", "Pending", "History"].map((tab) => (
            <button
              key={tab}
              className={filters.tab === tab ? "btn" : "btn-secondary"}
              type="button"
              onClick={() => setFilters((prev) => ({ ...prev, tab }))}
            >
              {tab}
            </button>
          ))}
          <button
            className="btn-ghost"
            type="button"
            onClick={() => setFilters({ status: "All", date: "", tab: "All" })}
          >
            Reset
          </button>
        </div>
      </section>

      <section className="page-panel">
        <h2>Booking records</h2>
        <div className="table-like-list" style={{ marginTop: 16 }}>
          {filteredItems.map((booking) => (
            <article key={booking.id} className="booking-item">
              <div className="item-row">
                <div>
                  <h3>{booking.facilityLabel}</h3>
                  <p className="meta-row">{booking.date} | {booking.time}</p>
                  <p className="soft-text" style={{ marginTop: 8 }}>Requested by: {booking.memberName}</p>
                  {booking.participantNames.length ? (
                    <p className="soft-text" style={{ marginTop: 8 }}>
                      Participants: {booking.participantNames.join(", ")}
                    </p>
                  ) : null}
                  {booking.feedback && (
                    <p className="soft-text" style={{ marginTop: 8 }}>
                      Staff feedback: {booking.feedback}
                    </p>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  <span className={`status-pill ${statusTone(booking.status)}`}>
                    {booking.statusLabel || displayStatus(booking.status)}
                  </span>
                  <div className="panel-actions" style={{ marginTop: 14, justifyContent: "flex-end" }}>
                    <Link className="btn-secondary" to={`/bookings/${booking.id}`}>View details</Link>
                    {booking.isOwner && ["pending", "suggested"].includes(booking.status) && (
                      <button
                        className="btn-ghost"
                        onClick={async () => {
                          try {
                            if (!window.confirm("Withdraw this pending booking request?")) {
                              return;
                            }
                            await withdrawPendingBooking(booking.id, sessionProfile);
                            setMessage(`Booking ${booking.id} was withdrawn.`);
                            await refresh();
                          } catch (actionError) {
                            setError(getErrorMessage(actionError, "Unable to withdraw this request."));
                          }
                        }}
                      >
                        Withdraw
                      </button>
                    )}
                    {booking.isOwner && booking.status === "accepted" && (
                      <button
                        className="btn-danger"
                        onClick={async () => {
                          try {
                            if (!window.confirm("Cancel this confirmed booking?")) {
                              return;
                            }
                            await cancelConfirmedBooking(booking.id, sessionProfile);
                            setMessage(`Booking ${booking.id} was cancelled.`);
                            await refresh();
                          } catch (actionError) {
                            setError(getErrorMessage(actionError, "Unable to cancel this booking."));
                          }
                        }}
                      >
                        Cancel booking
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {filteredItems.length === 0 && !error && (
        <section className="page-panel">
          <p>No booking records match the current filters.</p>
        </section>
      )}
    </div>
  );
}
