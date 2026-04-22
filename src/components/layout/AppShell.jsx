import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CalendarRange, ClipboardList, House, LogOut, ShieldCheck, UserRound, Wrench } from "lucide-react";
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
    { to: ROUTE_PATHS.ADMIN_FACILITIES, label: "Facilities", icon: House },
    { to: ROUTE_PATHS.ADMIN_STAFF, label: "Staff", icon: ShieldCheck },
  ],
};

function AppShell({ children }) {
  const { sessionRole, sessionProfile, logout } = useAuth();
  const location = useLocation();
  const links = navConfig[sessionRole] || navConfig.Member;
  const profilePath = getProfileRouteForRole(sessionRole);
  const homePath = getDefaultRouteForRole(sessionRole);
  const [avatarVersion, setAvatarVersion] = useState(0);

  useEffect(() => subscribeToAvatarChanges(() => setAvatarVersion((value) => value + 1)), []);

  const profileAvatar = getAvatarForActor(sessionProfile, sessionProfile?.name || "User");

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

  if (sessionRole === "Member" || sessionRole === "Staff") {
    return (
      <div className="member-shell">
        <header className="member-shell__topbar">
          <div className="member-shell__brandRow">
            <Link className="member-shell__brand" to={homePath}>
              Sports Center Booking System
            </Link>
            {sessionRole === "Staff" ? <span className="member-shell__roleBadge">Staff</span> : null}
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
            <NotificationBell variant="member" />

            <Link className="member-shell__profileLink" to={profilePath} aria-label="Open profile">
              <div className="member-shell__avatar">
                <img key={avatarVersion} src={profileAvatar} alt={sessionProfile?.name || "User"} />
              </div>
            </Link>
          </div>
        </header>

        <main className={`member-shell__main ${sessionRole === "Staff" ? "member-shell__main--staff" : ""}`}>
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className="shell__sidebar">
        <div className="shell__brand">
          <div className="shell__logo">SC</div>
          <div>
            <p className="shell__eyebrow">System</p>
            <h1>Sports Centre Booking System</h1>
          </div>
        </div>

        <nav className="shell__nav">
          {links.map((link) => {
            const NavIcon = link.icon;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`shell__link ${location.pathname === link.to ? "is-active" : ""}`}
              >
                <NavIcon size={18} />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>

        <button className="shell__logout" onClick={logout} type="button">
          <LogOut size={18} />
          <span>Log out</span>
        </button>
      </aside>

      <div className="shell__content">
        <header className="shell__topbar">
          <div>
            <p className="shell__eyebrow">Signed in as</p>
            <h2>{sessionRole}</h2>
          </div>

          <div className="shell__topbarRight">
            <NotificationBell variant="shell" />

            <Link className="shell__profile shell__profileLink" to={profilePath}>
              <div className="shell__avatar">
                <img key={avatarVersion} src={profileAvatar} alt={sessionProfile?.name || "User"} />
              </div>
              <div>
                <strong>{sessionProfile?.name || "User"}</strong>
                <p>{sessionProfile?.email || "member@sports.local"}</p>
              </div>
            </Link>
          </div>
        </header>

        <main className="shell__main">{children}</main>
      </div>
    </div>
  );
}

export default AppShell;
