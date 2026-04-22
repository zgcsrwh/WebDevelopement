import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "../pageStyles.css";
import { getBookings } from "../../services/bookingService";
import { getRepairTickets } from "../../services/reportService";
import { getNotifications } from "../../services/notificationService";
import { getMatchRequests } from "../../services/partnerService";
import { useAuth } from "../../provider/AuthContext";
import { ROUTE_PATHS } from "../../constants/routes";

export default function Home() {
  const { sessionProfile } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [reports, setReports] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [matchRequests, setMatchRequests] = useState([]);

  useEffect(() => {
    getBookings(sessionProfile).then(setBookings).catch(() => setBookings([]));
    getRepairTickets(sessionProfile).then(setReports).catch(() => setReports([]));
    getNotifications(sessionProfile).then(setNotifications).catch(() => setNotifications([]));
    getMatchRequests(sessionProfile).then(setMatchRequests).catch(() => setMatchRequests([]));
  }, [sessionProfile]);

  const stats = useMemo(() => {
    return {
      upcoming: bookings.filter((item) => item.status === "upcoming").length,
      pending: bookings.filter((item) => item.status === "pending").length,
      repairs: reports.filter((item) => !["resolved", "terminated"].includes(item.status)).length,
      matches: matchRequests.filter((item) => item.status === "pending").length,
    };
  }, [bookings, reports, matchRequests]);

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <h1>Sports Centre Booking System</h1>
          <p>
            Track bookings, repair reports, notifications, and partner requests from one dashboard.
          </p>
        </div>
        <div className="hero-actions">
          <Link className="btn" to={ROUTE_PATHS.FACILITIES}>Browse facilities</Link>
          <Link className="btn-secondary" to={ROUTE_PATHS.BOOKINGS}>View my bookings</Link>
        </div>
      </section>

      <section className="stats-grid">
        <article className="stat-card">
          <p>Upcoming bookings</p>
          <strong>{stats.upcoming}</strong>
        </article>
        <article className="stat-card">
          <p>Pending requests</p>
          <strong>{stats.pending}</strong>
        </article>
        <article className="stat-card">
          <p>Open repair reports</p>
          <strong>{stats.repairs}</strong>
        </article>
        <article className="stat-card">
          <p>Pending partner requests</p>
          <strong>{stats.matches}</strong>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="page-panel">
          <h2>Recent notifications</h2>
          <div className="card-list">
            {notifications.slice(0, 3).map((item) => (
              <div key={item.id} className="mini-card">
                {item.message}
              </div>
            ))}
            {notifications.length === 0 && <div className="mini-card">No notifications yet.</div>}
          </div>
        </article>

        <article className="page-panel">
          <h2>Quick links</h2>
          <div className="card-list">
            <Link className="mini-card" to={ROUTE_PATHS.REPORTS}>Submit a repair report</Link>
            <Link className="mini-card" to={ROUTE_PATHS.PARTNER}>Update partner profile</Link>
            <Link className="mini-card" to={ROUTE_PATHS.PROFILE}>Edit personal information</Link>
          </div>
        </article>
      </section>
    </div>
  );
}
