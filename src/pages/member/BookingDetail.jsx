import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import "../pageStyles.css";
import "./memberWorkspace.css";
import "./BookingDetail.css";
import { getBookingById } from "../../services/bookingService";
import { useAuth } from "../../provider/AuthContext";
import { ROUTE_PATHS } from "../../constants/routes";
import { getErrorMessage } from "../../utils/errors";

function formatDateTime(value) {
  if (!value) {
    return "Not available";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hour = String(parsed.getHours()).padStart(2, "0");
  const minute = String(parsed.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function normalizeStatus(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/-+/g, " ");
}

function getStatusPillClass(status) {
  if (status === "upcoming") {
    return "booking-detail-card__status booking-detail-card__status--success";
  }
  if (status === "alternative suggested") {
    return "booking-detail-card__status booking-detail-card__status--suggested";
  }
  if (status === "rejected" || status === "cancelled" || status === "no_show") {
    return "booking-detail-card__status booking-detail-card__status--danger";
  }
  return "booking-detail-card__status booking-detail-card__status--neutral";
}

function getStatusNotice(status, feedback) {
  if (status === "alternative suggested") {
    return {
      tone: "suggested",
      title: "Staff Feedback / Suggestion",
      body: feedback || "No staff response available.",
      showAction: true,
    };
  }

  if (status === "pending") {
    return {
      tone: "neutral",
      title: "Booking Status",
      body: "This booking request is waiting for staff review.",
      showAction: false,
    };
  }

  if (status === "rejected") {
    return {
      tone: "danger",
      title: "Booking Status",
      body: "This booking request was rejected.",
      showAction: false,
    };
  }

  if (status === "upcoming") {
    return {
      tone: "success",
      title: "Booking Status",
      body: "This booking is confirmed and scheduled.",
      showAction: false,
    };
  }

  if (status === "completed") {
    return {
      tone: "neutral",
      title: "Booking Status",
      body: "This booking session has been completed.",
      showAction: false,
    };
  }

  if (status === "cancelled") {
    return {
      tone: "danger",
      title: "Booking Status",
      body: "This booking was cancelled.",
      showAction: false,
    };
  }

  if (status === "no_show") {
    return {
      tone: "danger",
      title: "Booking Status",
      body: "This booking was marked as no-show because no arrival was confirmed before the session started.",
      showAction: false,
    };
  }

  return {
    tone: "neutral",
    title: "Booking Status",
    body: status || "Not available",
    showAction: false,
  };
}

export default function BookingDetail() {
  const { id } = useParams();
  const { sessionProfile } = useAuth();
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    getBookingById(id, sessionProfile)
      .then((nextBooking) => {
        if (!cancelled) {
          setBooking(nextBooking);
          setError("");
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(getErrorMessage(loadError, "Unable to load this booking."));
          setBooking(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id, sessionProfile]);

  const normalizedStatus = useMemo(() => normalizeStatus(booking?.status), [booking?.status]);
  const facilityLabel = useMemo(() => {
    if (!booking) {
      return "Not available";
    }

    if (booking.facilityLabel) {
      return booking.facilityLabel;
    }

    if (booking.facilityName && booking.sportType) {
      return `${booking.facilityName} (${booking.sportType})`;
    }

    return booking.facilityName || "Not available";
  }, [booking]);
  const statusNotice = useMemo(() => getStatusNotice(normalizedStatus, booking?.feedback), [booking?.feedback, normalizedStatus]);

  if (loading) {
    return (
      <div className="member-workspace">
        <div className="member-empty">
          <p>Loading booking details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="member-workspace">
        <Link className="member-back-link" to={ROUTE_PATHS.BOOKINGS}>
          Back to my bookings
        </Link>
        <section className="member-alert member-alert--error">
          <strong>Booking detail unavailable</strong>
          <p>{error}</p>
        </section>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="member-workspace">
        <Link className="member-back-link" to={ROUTE_PATHS.BOOKINGS}>
          Back to my bookings
        </Link>
        <div className="member-empty">
          <p>No booking detail could be found for this request.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="member-workspace booking-detail-page">
      <Link className="member-back-link" to={ROUTE_PATHS.BOOKINGS}>
        Back to my bookings
      </Link>

      <header className="booking-detail-page__header">
        <h1>Booking Details</h1>
      </header>

      <article className="booking-detail-card">
        <section className="booking-detail-card__section booking-detail-card__section--heading">
          <div>
            <h2>Booking Information</h2>
          </div>
          <span className={getStatusPillClass(normalizedStatus)}>{normalizedStatus || "unknown"}</span>
        </section>

        <section className="booking-detail-card__section booking-detail-card__section--grid">
          <div className="booking-detail-card__infoItem">
            <label>Booking ID</label>
            <strong>{booking.id}</strong>
          </div>
          <div className="booking-detail-card__infoItem">
            <label>Created At</label>
            <strong>{formatDateTime(booking.createdAt)}</strong>
          </div>
          <div className="booking-detail-card__infoItem">
            <label>Facility</label>
            <strong>{facilityLabel}</strong>
          </div>
          <div className="booking-detail-card__infoItem">
            <label>Booking Date</label>
            <strong>{booking.date || "Not available"}</strong>
          </div>
          <div className="booking-detail-card__infoItem">
            <label>Start Time</label>
            <strong>{booking.startTime || "Not available"}</strong>
          </div>
          <div className="booking-detail-card__infoItem">
            <label>End Time</label>
            <strong>{booking.endTime || "Not available"}</strong>
          </div>
          <div className="booking-detail-card__infoItem">
            <label>Attendees</label>
            <strong>{booking.attendees}</strong>
          </div>
        </section>

        <section className="booking-detail-card__section booking-detail-card__section--description">
          <label>Activity Description</label>
          <p>{booking.activityDescription || "No activity description was provided for this booking request."}</p>
        </section>

        <section className="booking-detail-card__section booking-detail-card__section--statusNote">
          <div className={`booking-detail-card__notice booking-detail-card__notice--${statusNotice.tone}`}>
            <strong>{statusNotice.title}</strong>
            <p>{statusNotice.body}</p>
          </div>

          {statusNotice.showAction ? (
            <div className="booking-detail-card__actions">
              <Link className="btn booking-detail-card__actionButton" to={ROUTE_PATHS.FACILITIES}>
                Create New
              </Link>
            </div>
          ) : null}
        </section>
      </article>
    </div>
  );
}
