import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import "../pageStyles.css";
import { getBookingById } from "../../services/bookingService";
import { useAuth } from "../../provider/AuthContext";
import { getErrorMessage } from "../../utils/errors";
import { displayStatus, statusTone } from "../../utils/presentation";

export default function BookingDetail() {
  const { id } = useParams();
  const { sessionProfile } = useAuth();
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getBookingById(id, sessionProfile)
      .then(setBooking)
      .catch((loadError) => setError(getErrorMessage(loadError, "Unable to load this booking.")));
  }, [id, sessionProfile]);

  if (error) {
    return (
      <div className="page-stack">
        <section className="page-panel">
          <p className="errorMessage">{error}</p>
        </section>
      </div>
    );
  }

  if (!booking) {
    return <div className="app-loading">Loading booking...</div>;
  }

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <h1>{booking.facilityName}</h1>
          <p>Detailed view of one booking request, including staff feedback and the live database status.</p>
        </div>
        <span className={`status-pill ${statusTone(booking.status)}`}>
          {booking.statusLabel || displayStatus(booking.status)}
        </span>
      </section>

      <section className="split-layout">
        <article className="detail-card">
          <h2>Booking information</h2>
          <div className="booking-summary" style={{ marginTop: 18 }}>
            <span>Request ID: {booking.id}</span>
            <span>Date: {booking.date}</span>
            <span>Time: {booking.time}</span>
            <span>Attendees: {booking.attendees}</span>
            <span>Status: {booking.statusLabel || displayStatus(booking.status)}</span>
          </div>
        </article>

        <article className="detail-card">
          <h2>Activity description</h2>
          <p>{booking.activityDescription}</p>
          {booking.feedback && (
            <>
              <h2 style={{ marginTop: 18 }}>Staff feedback</h2>
              <p>{booking.feedback}</p>
            </>
          )}
        </article>
      </section>

      <div className="panel-actions">
        <Link className="btn-secondary" to="/bookings">Back to my bookings</Link>
      </div>
    </div>
  );
}
