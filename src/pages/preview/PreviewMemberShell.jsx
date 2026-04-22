import { Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { ROUTE_PATHS } from "../../constants/routes";
import { getAvatarOptions } from "../../utils/avatar";
import "../../components/layout/AppShell.css";
import "./Preview.css";

const previewNavLinks = [
  { to: ROUTE_PATHS.FACILITIES, label: "Facilities", key: "facilities" },
  { to: ROUTE_PATHS.PREVIEW_BOOKINGS, label: "My bookings", key: "bookings" },
  { to: ROUTE_PATHS.PREVIEW_REPORTS, label: "Reports", key: "reports" },
  { to: ROUTE_PATHS.PREVIEW_PARTNER_DISCOVER, label: "Partner", key: "partner" },
];

export default function PreviewMemberShell({ children, activeSection }) {
  const avatar = getAvatarOptions()[0]?.src || "";

  return (
    <div className="member-shell">
      <header className="member-shell__topbar">
        <Link className="member-shell__brand" to={ROUTE_PATHS.PREVIEW_BOOKINGS}>
          Sports Center Booking System
        </Link>

        <nav className="member-shell__nav">
          {previewNavLinks.map((link) => (
            <Link
              key={link.key}
              to={link.to}
              className={`member-shell__navLink ${activeSection === link.key ? "is-active" : ""}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="member-shell__actions">
          <Link
            className="member-shell__iconButton"
            to={ROUTE_PATHS.PREVIEW_NOTIFICATIONS_BELL}
            aria-label="Open preview notifications"
          >
            <Bell size={24} />
          </Link>
          <Link className="member-shell__profileLink" to={ROUTE_PATHS.PREVIEW_PROFILE} aria-label="Open preview profile">
            <div className="member-shell__avatar">
              <img src={avatar} alt="Preview user" />
            </div>
          </Link>
        </div>
      </header>

      <main className="member-shell__main">
        <div className="preview-shell__note">
          <strong>Preview only.</strong> This route uses local static data so you can inspect hidden states without
          touching the real database or APIs.
        </div>
        {children}
      </main>
    </div>
  );
}
