import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Bell, CalendarRange, ClipboardList, House, LogOut, ShieldCheck, UserRound, Wrench } from "lucide-react";
import { useAuth } from "../../provider/AuthContext";
import { subscribeToNotifications } from "../../services/notificationService";
import "./AppShell.css";

const navConfig = {
  Member: [
    { to: "/home", label: "Overview", icon: House },
    { to: "/facilities", label: "Facilities", icon: CalendarRange },
    { to: "/bookings", label: "My Bookings", icon: ClipboardList },
    { to: "/reports", label: "Reports", icon: Wrench },
    { to: "/partner", label: "Partner", icon: UserRound },
    { to: "/profile", label: "Profile", icon: ShieldCheck },
  ],
  Staff: [
    { to: "/staff/requests", label: "Requests", icon: ClipboardList },
    { to: "/staff/bookings", label: "Check-in", icon: CalendarRange },
    { to: "/staff/reports", label: "Reports", icon: Wrench },
    { to: "/staff/profile", label: "Profile", icon: UserRound },
  ],
  Admin: [
    { to: "/admin/facilities", label: "Facilities", icon: House },
    { to: "/admin/staff", label: "Staff", icon: ShieldCheck },
  ],
};

function AppShell({ children }) {
  const { sessionRole, sessionProfile, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const links = navConfig[sessionRole] || navConfig.Member;
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;

    subscribeToNotifications(
      sessionProfile,
      (items) => {
        if (!cancelled) {
          setUnreadCount(items.filter((item) => !item.isRead).length);
        }
      },
      () => {
        if (!cancelled) {
          setUnreadCount(0);
        }
      },
    ).then((nextUnsubscribe) => {
      if (!cancelled) {
        unsubscribe = nextUnsubscribe;
      } else {
        nextUnsubscribe();
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [sessionProfile]);

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
            <button
              className="shell__notification"
              type="button"
              aria-label="Notifications"
              onClick={() => navigate("/notifications")}
            >
              <Bell size={18} />
              <span>{unreadCount}</span>
            </button>

            <div className="shell__profile">
              <div className="shell__avatar">
                {(sessionProfile?.name || "U").slice(0, 1).toUpperCase()}
              </div>
              <div>
                <strong>{sessionProfile?.name || "User"}</strong>
                <p>{sessionProfile?.email || "member@sports.local"}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="shell__main">{children}</main>
      </div>
    </div>
  );
}

export default AppShell;
