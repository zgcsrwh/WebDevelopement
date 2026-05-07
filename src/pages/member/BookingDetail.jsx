// This member page shows BookingDetail content.
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import "../pageStyles.css";
import "./memberWorkspace.css";
import "./BookingDetail.css";
import PageLayout from "../../components/common/PageLayout";
import { getBookingById } from "../../services/bookingService";
import { useAuth } from "../../provider/AuthContext";
import { ROUTE_PATHS } from "../../constants/routes";
import { getActionErrorMessage } from "../../utils/errors";
import { displayStatus } from "../../utils/presentation";

const BOOKING_DETAIL_VISIBLE_STATUSES = new Set([
  "pending",
  "rejected",
  "alternative suggested",
  "upcoming",
  "completed",
  "cancelled",
  "no_show",
]);

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
  const normalized = String(value || "")
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

function getStaffFeedback(feedback = "") {
  const text = String(feedback || "").trim();
  return text || "No staff response available.";
}

function getStatusNotice(status) {
  if (status === "alternative suggested") {
    return {
      tone: "suggested",
      title: "Booking Status",
      body: "Staff suggested an alternative for this booking request.",
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

  // Load real data when this part opens or changes.
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
          setError(getActionErrorMessage(loadError, "booking.load", "Unable to load this booking."));
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
  const statusNotice = useMemo(() => getStatusNotice(normalizedStatus), [normalizedStatus]);
  const staffFeedback = useMemo(() => getStaffFeedback(booking?.feedback), [booking?.feedback]);
  const invitedFriendNames = useMemo(() => {
    const applicantName = String(booking?.memberName || "").trim().toLowerCase();
    const names = Array.isArray(booking?.participantNames) ? booking.participantNames : [];

    return names
      .map((name) => String(name || "").trim())
      .filter(Boolean)
      .filter((name, index, list) => list.indexOf(name) === index)
      .filter((name) => name.toLowerCase() !== applicantName);
  }, [booking?.memberName, booking?.participantNames]);

  if (loading) {
    return (
      <PageLayout className="booking-detail-page">
        <div className="member-empty">
          <p>Loading booking details...</p>
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout className="booking-detail-page" backTo={ROUTE_PATHS.BOOKINGS} backLabel="Back to my bookings">
        <section className="member-alert member-alert--error">
          <strong>Booking detail unavailable</strong>
          <p>{error}</p>
        </section>
      </PageLayout>
    );
  }

  if (!booking) {
    return (
      <PageLayout className="booking-detail-page" backTo={ROUTE_PATHS.BOOKINGS} backLabel="Back to my bookings">
        <div className="member-empty">
          <p>No booking detail could be found for this request.</p>
        </div>
      </PageLayout>
    );
  }

  if (!BOOKING_DETAIL_VISIBLE_STATUSES.has(normalizedStatus)) {
    return (
      <PageLayout className="booking-detail-page" backTo={ROUTE_PATHS.BOOKINGS} backLabel="Back to my bookings">
        <section className="member-alert member-alert--error">
          <strong>Booking detail unavailable</strong>
          <p>This booking status is no longer available in the current booking workflow.</p>
        </section>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      className="booking-detail-page"
      backTo={ROUTE_PATHS.BOOKINGS}
      backLabel="Back to my bookings"
      title="Booking Details"
    >
      <article className="booking-detail-card">
        <section className="booking-detail-card__section booking-detail-card__section--heading">
          <div>
            <h2>Booking Information</h2>
          </div>
          <span className={getStatusPillClass(normalizedStatus)}>{displayStatus(normalizedStatus || "unknown")}</span>
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

        <section className="booking-detail-card__section booking-detail-card__section--participants">
          <label>Participants</label>
          <div className="booking-detail-card__participantsGrid">
            <div className="booking-detail-card__participantBlock">
              <span>Applicant</span>
              <strong>{booking.memberName || "Member"}</strong>
            </div>

            <div className="booking-detail-card__participantBlock">
              <span>Invited Friends</span>
              {invitedFriendNames.length ? (
                <div className="booking-detail-card__friendList">
                  {invitedFriendNames.map((name) => (
                    <strong key={name}>{name}</strong>
                  ))}
                </div>
              ) : (
                <p>No invited friends were included.</p>
              )}
            </div>
          </div>
        </section>

        <section className="booking-detail-card__section booking-detail-card__section--statusNote">
          <div className={`booking-detail-card__notice booking-detail-card__notice--${statusNotice.tone}`}>
            <strong>{statusNotice.title}</strong>
            <p>{statusNotice.body}</p>
          </div>

          <div className="booking-detail-card__feedback">
            <strong>Staff Feedback</strong>
            <p>{staffFeedback}</p>
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
    </PageLayout>
  );
}
