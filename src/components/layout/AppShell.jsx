import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CalendarRange, ClipboardList, UserRound, Wrench } from "lucide-react";
import { useAuth } from "../../provider/AuthContext";
import { getAvatarForActor, subscribeToAvatarChanges } from "../../utils/avatar";
import { ROUTE_PATHS, getDefaultRouteForRole, getProfileRouteForRole } from "../../constants/routes";
import NotificationBell from "./NotificationBell";
import "./AppShell.css";

const navConfig = {
  Member: [
    {
      to: ROUTE_PATHS.FACILITIES,
      label: "Facilities",
      icon: CalendarRange,
      matches: [{ path: ROUTE_PATHS.FACILITIES, exact: true }],
    },
    {
      to: ROUTE_PATHS.BOOKINGS,
      label: "My bookings",
      icon: ClipboardList,
      matches: [{ path: ROUTE_PATHS.BOOKINGS, exact: true }],
    },
    { to: ROUTE_PATHS.REPORTS, label: "Reports", icon: Wrench, matches: [ROUTE_PATHS.REPORTS] },
    { to: ROUTE_PATHS.PARTNER, label: "Partner", icon: UserRound, matches: [ROUTE_PATHS.PARTNER] },
  ],
  Staff: [
    {
      to: ROUTE_PATHS.STAFF_REQUESTS,
      label: "Booking Requests",
      icon: ClipboardList,
      matches: [{ path: ROUTE_PATHS.STAFF_REQUESTS, exact: true }],
    },
    { to: ROUTE_PATHS.STAFF_BOOKINGS, label: "Check-in", icon: CalendarRange, matches: [ROUTE_PATHS.STAFF_BOOKINGS] },
    { to: ROUTE_PATHS.STAFF_REPORTS, label: "Reported Issues", icon: Wrench, matches: [ROUTE_PATHS.STAFF_REPORTS] },
  ],
  Admin: [
    {
      to: ROUTE_PATHS.ADMIN_FACILITIES,
      label: "Facility Management",
      matches: [{ path: ROUTE_PATHS.ADMIN_FACILITIES, exact: true }],
    },
    {
      to: ROUTE_PATHS.ADMIN_STAFF,
      label: "Staff Management",
      matches: [{ path: ROUTE_PATHS.ADMIN_STAFF, exact: true }],
    },
  ],
};

function AppShell({ children }) {
  const { sessionRole, sessionProfile } = useAuth();
  const location = useLocation();
  const links = navConfig[sessionRole] || navConfig.Member;
  const profilePath = getProfileRouteForRole(sessionRole);
  const homePath = getDefaultRouteForRole(sessionRole);
  const [avatarVersion, setAvatarVersion] = useState(0);

  useEffect(() => subscribeToAvatarChanges(() => setAvatarVersion((value) => value + 1)), []);

  const profileAvatar = getAvatarForActor(sessionProfile, sessionProfile?.name || "User");
  const profileInitial = String(sessionProfile?.name || "S").trim().charAt(0).toUpperCase() || "S";

  function isLinkActive(link) {
    const matches = Array.isArray(link.matches) && link.matches.length ? link.matches : [link.to];
    return matches.some((match) => {
      if (typeof match === "string") {
        return location.pathname === match || location.pathname.startsWith(`${match}/`);
      }

      if (!match?.path) {
        return false;
      }

      if (match.exact) {
        return location.pathname === match.path;
      }

      return location.pathname === match.path || location.pathname.startsWith(`${match.path}/`);
    });
  }

  if (sessionRole === "Member" || sessionRole === "Staff" || sessionRole === "Admin") {
    const isStaff = sessionRole === "Staff";
    const isAdmin = sessionRole === "Admin";
    const usesFixedLetterAvatar = isStaff || isAdmin;
    const roleBadgeLabel = isStaff ? "Staff" : isAdmin ? "Admin" : "";
    const avatarLinkClass = isStaff
      ? "member-shell__profileLink member-shell__profileLink--staff"
      : isAdmin
        ? "member-shell__profileLink member-shell__profileLink--admin"
        : "member-shell__profileLink";
    const avatarClass = isStaff
      ? "member-shell__avatar member-shell__avatar--staff"
      : isAdmin
        ? "member-shell__avatar member-shell__avatar--admin"
        : "member-shell__avatar";
    const avatarInitialClass = isStaff
      ? "member-shell__avatarInitial member-shell__avatarInitial--staff"
      : "member-shell__avatarInitial member-shell__avatarInitial--admin";
    const avatarBadgeClass = isAdmin
      ? "member-shell__avatarBadge member-shell__avatarBadge--admin"
      : "member-shell__avatarBadge";

    return (
      <div className="member-shell">
        <header className="member-shell__topbar">
          <div className="member-shell__brandRow">
            <Link className="member-shell__brand" to={homePath}>
              Sports Center Booking System
            </Link>
            {roleBadgeLabel ? (
              <span className={`member-shell__roleBadge ${isAdmin ? "member-shell__roleBadge--admin" : ""}`}>
                {roleBadgeLabel}
              </span>
            ) : null}
          </div>

          <nav className="member-shell__nav">
            {links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`member-shell__navLink ${isLinkActive(link) ? "is-active" : ""}`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="member-shell__actions">
            {!isAdmin ? <NotificationBell variant={isStaff ? "staff" : "member"} /> : null}

            <Link
              className={avatarLinkClass}
              to={profilePath}
              aria-label={
                isStaff ? "Open staff profile" : isAdmin ? "Open admin profile" : "Open profile"
              }
            >
              <div className={avatarClass}>
                {usesFixedLetterAvatar ? (
                  <span className={avatarInitialClass} aria-hidden="true">
                    {profileInitial}
                  </span>
                ) : (
                  <img key={avatarVersion} src={profileAvatar} alt={sessionProfile?.name || "User"} />
                )}
              </div>
              {usesFixedLetterAvatar ? <span className={avatarBadgeClass}>{roleBadgeLabel}</span> : null}
            </Link>
          </div>
        </header>

        <main
          className={`member-shell__main ${isStaff ? "member-shell__main--staff" : ""} ${isAdmin ? "member-shell__main--admin" : ""}`}
        >
          {children}
        </main>
      </div>
    );
  }
}

export default AppShell;
