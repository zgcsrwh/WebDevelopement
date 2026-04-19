import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import "../pageStyles.css";
import { getFacilityById, getTimeSlotsByFacility } from "../../services/bookingService";
import { displayStatus, statusTone } from "../../utils/presentation";

export default function FacilityDetail() {
  const { id } = useParams();
  const [dateLimits] = useState(() => {
    const today = new Date();
    const maxBookingDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    return {
      today: today.toISOString().slice(0, 10),
      maxBookingDate: maxBookingDate.toISOString().slice(0, 10),
    };
  });
  const [facility, setFacility] = useState(null);
  const [slots, setSlots] = useState([]);
  const [selectedDate, setSelectedDate] = useState(dateLimits.today);

  useEffect(() => {
    getFacilityById(id, selectedDate).then(setFacility);
    getTimeSlotsByFacility(id, selectedDate).then(setSlots);
  }, [id, selectedDate]);

  if (!facility) {
    return <div className="app-loading">Loading facility...</div>;
  }

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <h1>{facility.name}</h1>
          <p>{facility.description}</p>
        </div>
        <div className="hero-actions">
          {facility.status === "normal" && <Link className="btn" to={`/bookings/new?facility=${facility.id}`}>Request booking</Link>}
          <Link className="btn-secondary" to="/facilities">Back to list</Link>
        </div>
      </section>

      <section className="split-layout">
        <article className="detail-card">
          <h2>Facility details</h2>
          <div className="booking-summary" style={{ marginTop: 18 }}>
            <span>Sport type: {facility.sportType}</span>
            <span>Capacity: {facility.capacity}</span>
            <span>Location: {facility.location}</span>
            <span>Open hours: {facility.startTime}:00 - {facility.endTime}:00</span>
            <span>
              Status:
              <span className={`status-pill ${statusTone(facility.status)}`} style={{ marginLeft: 10 }}>
                {facility.statusLabel || displayStatus(facility.status)}
              </span>
            </span>
          </div>
        </article>

        <article className="detail-card">
          <h2>Usage guidelines</h2>
          <p>{facility.usageGuidelines}</p>
        </article>
      </section>

      <section className="page-panel">
        <h2>Availability</h2>
        <div className="filter-grid" style={{ marginTop: 16 }}>
          <div>
            <label>Date</label>
            <input
              type="date"
              value={selectedDate}
              min={dateLimits.today}
              max={dateLimits.maxBookingDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </div>
        </div>
        <div className="tags-row" style={{ marginTop: 14 }}>
          {slots
            .filter((slot) => String(slot.status || "").toLowerCase() === "open")
            .map((slot) => (
              <span key={slot.id || `${slot.date}-${slot.start_time}-${slot.end_time}`} className="tag">
                {slot.timeLabel}
              </span>
            ))}
          {slots.filter((slot) => String(slot.status || "").toLowerCase() === "open").length === 0 && <span className="tag">No available slots found.</span>}
        </div>
      </section>
    </div>
  );
}
