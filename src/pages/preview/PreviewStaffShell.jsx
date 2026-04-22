import { Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { ROUTE_PATHS } from "../../constants/routes";
import "./Preview.css";

const previewStaffNavLinks = [
  { to: ROUTE_PATHS.PREVIEW_STAFF_REQUESTS, label: "Booking Requests", key: "requests" },
  { to: ROUTE_PATHS.PREVIEW_STAFF_BOOKINGS, label: "Check-in", key: "checkin" },
  { to: ROUTE_PATHS.PREVIEW_STAFF_REPORTS, label: "Reported Issues", key: "reports" },
];

export default function PreviewStaffShell({ children, activeSection }) {
  return (
    <div className="preview-staff-shell">
      <header className="preview-staff-shell__topbar">
        <div className="preview-staff-shell__brandRow">
          <Link className="preview-staff-shell__brand" to={ROUTE_PATHS.PREVIEW_STAFF_REQUESTS}>
            Sports Center Booking System
          </Link>
          <span className="preview-staff-shell__role">Staff</span>
        </div>

        <nav className="preview-staff-shell__nav">
          {previewStaffNavLinks.map((link) => (
            <Link
              key={link.key}
              to={link.to}
              className={`preview-staff-shell__navLink ${activeSection === link.key ? "is-active" : ""}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="preview-staff-shell__actions">
          <button className="preview-staff-shell__iconButton" type="button" aria-label="Static notifications preview">
            <Bell size={22} />
            <span className="preview-staff-shell__badge">1</span>
          </button>
          <div className="preview-staff-shell__avatar" aria-hidden="true">
            S
          </div>
        </div>
      </header>

      <main className="preview-staff-shell__main">
        <div className="preview-shell__note">
          <strong>Preview only.</strong> This route uses local static data so you can review the employee page without
          logging into a real staff account.
        </div>
        {children}
      </main>
    </div>
  );
}
