import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "../pageStyles.css";
import { getFacilities } from "../../services/bookingService";
import { displayStatus, statusTone } from "../../utils/presentation";

export default function Facilities() {
  const [dateLimits] = useState(() => {
    const today = new Date();
    const maxBookingDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    return {
      today: today.toISOString().slice(0, 10),
      maxBookingDate: maxBookingDate.toISOString().slice(0, 10),
    };
  });
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState({
    date: dateLimits.today,
    type: "All",
    availability: "All",
    time: "All",
  });

  useEffect(() => {
    getFacilities(filters.date).then(setItems);
  }, [filters.date]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const typeMatch = filters.type === "All" || item.sportType === filters.type;
      const statusMatch = filters.availability === "All" || item.status === filters.availability;
      const slots = item.availableSlots ?? [];
      const timeMatch = filters.time === "All" || slots.some((slot) => slot.startsWith(filters.time));
      return typeMatch && statusMatch && timeMatch;
    });
  }, [items, filters]);

  const sportTypes = ["All", ...new Set(items.map((item) => item.sportType))];
  const timeOptions = ["All", ...new Set(items.flatMap((item) => (item.availableSlots || []).map((slot) => slot.slice(0, 5))))];

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <h1>Facilities</h1>
          <p>Browse visible venues, check live availability for the selected date, and only book facilities whose current status is normal.</p>
        </div>
        <div className="hero-actions">
          <Link className="btn" to="/bookings/new">New booking request</Link>
        </div>
      </section>

      <section className="page-panel">
        <h2>Filters</h2>
        <div className="filter-grid">
          <div>
            <label>Date</label>
            <input
              type="date"
              value={filters.date}
              min={dateLimits.today}
              max={dateLimits.maxBookingDate}
              onChange={(event) => setFilters((prev) => ({ ...prev, date: event.target.value }))}
            />
          </div>

          <div>
            <label>Venue type</label>
            <select
              value={filters.type}
              onChange={(event) => setFilters((prev) => ({ ...prev, type: event.target.value }))}
            >
              {sportTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label>Status</label>
            <select
              value={filters.availability}
              onChange={(event) => setFilters((prev) => ({ ...prev, availability: event.target.value }))}
            >
              <option value="All">All</option>
              <option value="normal">Normal</option>
              <option value="fixing">Fixing</option>
            </select>
          </div>

          <div>
            <label>Time slot</label>
            <select
              value={filters.time}
              onChange={(event) => setFilters((prev) => ({ ...prev, time: event.target.value }))}
            >
              {timeOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "All" ? "All" : `${option} onwards`}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="panel-actions" style={{ marginTop: 16 }}>
          <button
            className="btn-secondary"
            type="button"
            onClick={() =>
              setFilters({
                date: dateLimits.today,
                type: "All",
                availability: "All",
                time: "All",
              })
            }
          >
            Clear filters
          </button>
        </div>
      </section>

      <section className="cards-grid">
        {filteredItems.map((facility) => (
          <article key={facility.id} className="detail-card">
            <div className="item-row">
              <div>
                <h2>{facility.name}</h2>
                <p>{facility.sportType}</p>
              </div>
              <span className={`status-pill ${statusTone(facility.status)}`}>
                {facility.statusLabel || displayStatus(facility.status)}
              </span>
            </div>

            <div className="booking-summary" style={{ marginTop: 16 }}>
              <span className="soft-text">Capacity: {facility.capacity}</span>
              <span className="soft-text">Location: {facility.location}</span>
              <span className="soft-text">
                Opening hours: {String(facility.startTime).padStart(2, "0")}:00 - {String(facility.endTime).padStart(2, "0")}:00
              </span>
            </div>

            <div className="tags-row" style={{ marginTop: 16 }}>
              {(facility.availableSlots ?? []).length > 0 ? (
                facility.availableSlots.map((slot) => (
                  <span key={slot} className="tag">
                    {slot}
                  </span>
                ))
              ) : (
                <span className="soft-text">No open slots are available for the selected date.</span>
              )}
            </div>

            <div className="card-actions" style={{ marginTop: 20 }}>
              <Link className="btn-secondary" to={`/facilities/${facility.id}`}>
                View details
              </Link>
              {facility.status === "normal" && (
                <Link className="btn" to={`/bookings/new?facility=${facility.id}`}>
                  Book
                </Link>
              )}
            </div>
          </article>
        ))}
      </section>

      {filteredItems.length === 0 && (
        <section className="page-panel">
          <p>No facilities match the selected filters.</p>
        </section>
      )}
    </div>
  );
}
