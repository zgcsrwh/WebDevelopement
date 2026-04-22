import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "../../pages/pageStyles.css";
import "../member/memberWorkspace.css";
import "../member/MyBookings.css";
import { ROUTE_PATHS } from "../../constants/routes";
import { previewBookings } from "../../previews/memberPreviewData";
import { statusTone } from "../../utils/presentation";

const STATUS_OPTIONS = [
  "pending",
  "rejected",
  "alternative suggested",
  "upcoming",
  "completed",
  "cancelled",
];

function sortBookings(items) {
  return [...items].sort((left, right) => {
    const leftKey = `${left.date}T${left.startTime}`;
    const rightKey = `${right.date}T${right.startTime}`;
    return String(rightKey).localeCompare(String(leftKey));
  });
}

export default function PreviewBookings() {
  const [draftStatus, setDraftStatus] = useState("");
  const [draftDate, setDraftDate] = useState("");
  const [appliedStatus, setAppliedStatus] = useState("");
  const [appliedDate, setAppliedDate] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [message, setMessage] = useState("");

  const visibleItems = useMemo(() => {
    let items = sortBookings(previewBookings);

    if (activeTab === "upcoming") {
      items = items.filter((item) => item.status === "upcoming");
    } else if (activeTab === "pending") {
      items = items.filter((item) => item.status === "pending");
    } else if (activeTab === "history") {
      items = items.filter((item) =>
        ["rejected", "alternative suggested", "completed", "cancelled"].includes(item.status),
      );
    }

    if (appliedStatus) {
      items = items.filter((item) => item.status === appliedStatus);
    }

    if (appliedDate) {
      items = items.filter((item) => item.date === appliedDate);
    }

    return items;
  }, [activeTab, appliedDate, appliedStatus]);

  return (
    <div className="member-workspace my-bookings-page">
      <section className="my-bookings__hero member-hero">
        <div className="member-hero__top">
          <div>
            <h1>My Bookings</h1>
            <p>View your booking records and check the latest reservation status.</p>
          </div>
          <Link className="btn my-bookings__heroButton" to={ROUTE_PATHS.PREVIEW_BOOKING_NEW}>
            Book New Facility
          </Link>
        </div>
      </section>

      {message ? (
        <section className="member-alert member-alert--success">
          <strong>Preview only</strong>
          <p>{message}</p>
        </section>
      ) : null}

      <section className="my-bookings__filters">
        <div className="my-bookings__filterGrid">
          <div className="my-bookings__field">
            <label htmlFor="preview-booking-status">Status</label>
            <select
              id="preview-booking-status"
              value={draftStatus}
              onChange={(event) => setDraftStatus(event.target.value)}
            >
              <option value="">All Status</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div className="my-bookings__field">
            <label htmlFor="preview-booking-date">Date</label>
            <input
              id="preview-booking-date"
              type="date"
              value={draftDate}
              onChange={(event) => setDraftDate(event.target.value)}
            />
          </div>
        </div>

        <div className="my-bookings__filterActions">
          <button
            className="btn-secondary my-bookings__filterButton"
            type="button"
            onClick={() => {
              setDraftStatus("");
              setDraftDate("");
              setAppliedStatus("");
              setAppliedDate("");
              setActiveTab("all");
              setMessage("");
            }}
          >
            Clear
          </button>
          <button
            className="btn my-bookings__filterButton"
            type="button"
            onClick={() => {
              setAppliedStatus(draftStatus);
              setAppliedDate(draftDate);
            }}
          >
            Apply
          </button>
        </div>
      </section>

      <section className="my-bookings__tabs">
        {[
          ["all", "All"],
          ["upcoming", "Upcoming"],
          ["pending", "Pending"],
          ["history", "History"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={`my-bookings__tab ${activeTab === key ? "is-active" : ""}`}
            type="button"
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </section>

      <section className="my-bookings__list">
        {visibleItems.length > 0 ? (
          visibleItems.map((item) => (
            <article key={item.id} className="my-bookings__item">
              <div className="my-bookings__itemMain">
                <div className="my-bookings__itemTop">
                  <div className="my-bookings__itemHeading">
                    <h3>
                      {item.facilityName} - {item.sportType}
                    </h3>
                    <p>
                      {item.date} - {item.startTime} - {item.endTime}
                    </p>
                  </div>
                  <span className={`status-pill ${statusTone(item.status)}`}>{item.status}</span>
                </div>
              </div>

              <div className="my-bookings__itemActions">
                <button
                  className="btn-secondary my-bookings__actionButton"
                  type="button"
                  onClick={() => setMessage("Booking detail preview is not part of this route.")}
                >
                  View Details
                </button>
                {item.status === "pending" ? (
                  <button
                    className="my-bookings__dangerAction"
                    type="button"
                    onClick={() => setMessage("Withdraw Request is disabled in preview mode.")}
                  >
                    Withdraw Request
                  </button>
                ) : null}
                {item.status === "upcoming" ? (
                  <button
                    className="my-bookings__dangerAction"
                    type="button"
                    onClick={() => setMessage("Cancel Booking is disabled in preview mode.")}
                  >
                    Cancel Booking
                  </button>
                ) : null}
              </div>
            </article>
          ))
        ) : (
          <div className="my-bookings__empty">
            <p>No booking records match the current filters.</p>
          </div>
        )}
      </section>
    </div>
  );
}
