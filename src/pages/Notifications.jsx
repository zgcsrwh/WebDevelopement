import { useEffect, useMemo, useState } from "react";
import "./pageStyles.css";
import { markAllNotificationsRead, markNotificationRead, subscribeToNotifications } from "../services/notificationService";
import { useAuth } from "../provider/AuthContext";
import { displayStatus, statusTone, toTitleText } from "../utils/presentation";

function getNotificationClass(type) {
  if (type === "facility_request") return "status-pending";
  if (type === "repair_report") return "status-active";
  return "status-unlisted";
}

export default function Notifications() {
  const { sessionProfile } = useAuth();
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;

    subscribeToNotifications(
      sessionProfile,
      (nextItems) => {
        if (!cancelled) {
          setItems(nextItems);
        }
      },
      () => {
        if (!cancelled) {
          setItems([]);
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

  const availableTypes = useMemo(
    () => ["all", "unread", ...new Set(items.map((item) => item.type).filter(Boolean))],
    [items],
  );

  const filteredItems = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "unread") return items.filter((item) => !item.isRead);
    return items.filter((item) => item.type === filter);
  }, [filter, items]);

  const unreadCount = items.filter((item) => !item.isRead).length;

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <h1>Notifications</h1>
          <p>Review booking updates, repair logs, and other system notices directly from the database notification records.</p>
        </div>
        <div className="hero-actions">
          <span className="status-pill status-pending">{unreadCount} unread</span>
        </div>
      </section>

      <section className="page-panel">
        <h2>Filter</h2>
        <div className="tags-row" style={{ marginTop: 16 }}>
          {availableTypes.map((option) => (
            <button
              key={option}
              className={filter === option ? "btn" : "btn-secondary"}
              type="button"
              onClick={() => setFilter(option)}
            >
              {option === "all" ? "All" : option === "unread" ? "Unread" : toTitleText(option.replaceAll("_", " "))}
            </button>
          ))}
          <button
            className="btn-ghost"
            type="button"
            onClick={async () => {
              await markAllNotificationsRead(sessionProfile);
              setItems((prev) => prev.map((item) => ({ ...item, isRead: true })));
            }}
          >
            Mark all as read
          </button>
        </div>
      </section>

      <section className="page-panel">
        <h2>Recent updates</h2>
        <div className="card-list" style={{ marginTop: 18 }}>
          {filteredItems.map((item) => (
            <article key={item.id} className="request-item">
              <div className="item-row">
                <div>
                  <div className="tags-row" style={{ marginBottom: 10 }}>
                    <span className={`status-pill ${getNotificationClass(item.type)}`}>
                      {toTitleText((item.type || "notification").replaceAll("_", " "))}
                    </span>
                    {item.statusContext && (
                      <span className={`status-pill ${statusTone(item.statusContext)}`}>
                        {displayStatus(item.statusContext)}
                      </span>
                    )}
                    {!item.isRead && <span className="tag">Unread</span>}
                  </div>
                  <h3>{item.message}</h3>
                  <p className="meta-row">{item.createdAt}</p>
                  {item.memberId && (
                    <p className="soft-text" style={{ marginTop: 8 }}>
                      Member ID: {item.memberId}
                    </p>
                  )}
                </div>
                <div className="inline-actions">
                  {!item.isRead && (
                    <button
                      className="btn-secondary"
                      onClick={async () => {
                        await markNotificationRead(item.id);
                        setItems((prev) =>
                          prev.map((current) =>
                            current.id === item.id ? { ...current, isRead: true } : current,
                          ),
                        );
                      }}
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {filteredItems.length === 0 && (
        <section className="page-panel">
          <p>No notifications match the selected filter.</p>
        </section>
      )}
    </div>
  );
}
