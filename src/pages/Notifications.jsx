import { useEffect, useMemo, useState } from "react";
import "./pageStyles.css";
import "../components/layout/NotificationBell.css";
import { getBookingById } from "../services/bookingService";
import { markAllNotificationsRead, markNotificationRead, subscribeToNotifications } from "../services/notificationService";
import { getMatchRequests } from "../services/partnerService";
import { getRepairTicketById } from "../services/reportService";
import { useAuth } from "../provider/AuthContext";
import { displayStatus, statusTone, toTitleText } from "../utils/presentation";

function normalizeKey(value = "") {
  return String(value || "").trim().toLowerCase().replaceAll(" ", "_").replaceAll("-", "_");
}

function getNotificationGroup(type = "") {
  const value = normalizeKey(type);

  if (value === "facility_request" || value === "booking" || value === "booking_request") {
    return "booking";
  }

  if (value === "repair_report" || value === "repair" || value === "repair_ticket") {
    return "repair";
  }

  if (["match_request", "friend", "match", "matching", "partner_request"].includes(value)) {
    return "match";
  }

  return "all";
}

function getTypeLabel(type = "") {
  const group = getNotificationGroup(type);
  if (group === "booking") return "Booking";
  if (group === "repair") return "Repair";
  if (group === "match") return "Match";
  return toTitleText(type || "Notification");
}

function getStatusLabel(status = "") {
  return status ? displayStatus(status) : "Not available";
}

function getInvitedFriendNames(booking) {
  const applicantName = String(booking?.memberName || "").trim().toLowerCase();
  const names = Array.isArray(booking?.participantNames) ? booking.participantNames : [];

  return names
    .map((name) => String(name || "").trim())
    .filter(Boolean)
    .filter((name, index, list) => list.indexOf(name) === index)
    .filter((name) => name.toLowerCase() !== applicantName);
}

function NotificationModal({ item, detail, loading, error, onClose }) {
  if (!item) return null;

  const group = getNotificationGroup(item.type);
  const title =
    group === "booking"
      ? "Booking Notification"
      : group === "repair"
        ? "Repair Notification"
        : group === "match"
          ? "Match Notification"
          : "Notification Details";

  return (
    <div className="notification-bell__modalOverlay" role="presentation">
      <div className="notification-bell__modal" role="dialog" aria-modal="true" aria-labelledby="notifications-page-modal-title">
        <div className="notification-bell__modalBody">
          <div className="notification-bell__modalCopy">
            <div className="notification-bell__modalHeading">
              <h3 id="notifications-page-modal-title">{title}</h3>
              <button className="notification-bell__modalClose" type="button" aria-label="Close notification details" onClick={onClose}>
                X
              </button>
            </div>
            <p>
              {item.referenceId
                ? "Review the related update without leaving the current page."
                : "Review the notification summary from the database record."}
            </p>
          </div>

          {loading ? (
            <div className="notification-bell__loading">
              <span>Loading details...</span>
            </div>
          ) : null}

          {!loading && error ? (
            <section className="notification-bell__alert notification-bell__alert--error">
              <strong>{getTypeLabel(item.type)} details unavailable</strong>
              <p>{error}</p>
            </section>
          ) : null}

          {!loading ? (
            <div className="notification-bell__modalDetail">
              <div className="notification-bell__modalMeta">
                <span className={`notification-bell__typeBadge notification-bell__typeBadge--${group}`}>
                  {getTypeLabel(item.type)}
                </span>
                {item.statusContext ? (
                  <span className={`status-pill ${statusTone(item.statusContext)}`}>
                    {getStatusLabel(item.statusContext)}
                  </span>
                ) : null}
              </div>

              {renderNotificationDetail(item, detail, group)}
            </div>
          ) : null}

          <div className="notification-bell__modalActions">
            <button className="btn-secondary" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderNotificationDetail(item, detail, group) {
  if (!item.referenceId || !detail) {
    return (
      <>
        <strong>{item.message || "Notification"}</strong>
        <div className="notification-bell__detailGrid">
          <div>
            <span>Category</span>
            <strong>{getTypeLabel(item.type)}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{getStatusLabel(item.statusContext)}</strong>
          </div>
          <div>
            <span>Received At</span>
            <strong>{item.createdAt || "Not available"}</strong>
          </div>
        </div>
        <div className="notification-bell__applicationBox">
          <span>Message</span>
          <p>{item.message || "No notification message was provided."}</p>
        </div>
      </>
    );
  }

  if (group === "booking") {
    const invitedFriendNames = getInvitedFriendNames(detail);

    return (
      <>
        <strong>{detail.facilityLabel || detail.facilityName || item.message}</strong>
        <div className="notification-bell__detailGrid">
          <div>
            <span>Date</span>
            <strong>{detail.date || "Not available"}</strong>
          </div>
          <div>
            <span>Time</span>
            <strong>{detail.time || `${detail.startTime || "-"} - ${detail.endTime || "-"}`}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{getStatusLabel(detail.status)}</strong>
          </div>
          <div>
            <span>Created At</span>
            <strong>{detail.createdAt || "Not available"}</strong>
          </div>
        </div>
        <div className="notification-bell__applicationBox">
          <span>Applicant</span>
          <p>{detail.memberName || "Member"}</p>
        </div>
        <div className="notification-bell__applicationBox">
          <span>Invited Friends</span>
          <p>{invitedFriendNames.length ? invitedFriendNames.join(", ") : "No invited friends were included."}</p>
        </div>
        <div className="notification-bell__applicationBox">
          <span>Activity Description</span>
          <p>{detail.activityDescription || "No activity description was provided."}</p>
        </div>
        <div className="notification-bell__applicationBox">
          <span>Staff Feedback</span>
          <p>{detail.feedback || "No staff response available."}</p>
        </div>
      </>
    );
  }

  if (group === "repair") {
    return (
      <>
        <strong>{detail.facilityLabel || detail.facility || item.message}</strong>
        <div className="notification-bell__detailGrid">
          <div>
            <span>Status</span>
            <strong>{getStatusLabel(detail.status)}</strong>
          </div>
          <div>
            <span>Reported At</span>
            <strong>{detail.createdAt || "Not available"}</strong>
          </div>
          <div>
            <span>Resolved At</span>
            <strong>{detail.completedAt || "Not available"}</strong>
          </div>
          <div>
            <span>Faulty Part</span>
            <strong>{(detail.type || []).join(" / ") || "Not available"}</strong>
          </div>
        </div>
        <div className="notification-bell__applicationBox">
          <span>Issue Description</span>
          <p>{detail.description || "No repair description was provided."}</p>
        </div>
      </>
    );
  }

  if (group === "match") {
    return (
      <>
        <strong>{detail.counterpartName || item.message || "Match update"}</strong>
        <div className="notification-bell__detailGrid">
          <div>
            <span>Status</span>
            <strong>{getStatusLabel(detail.status)}</strong>
          </div>
          <div>
            <span>Created At</span>
            <strong>{detail.createdAt || "Not available"}</strong>
          </div>
          <div>
            <span>Completed At</span>
            <strong>{detail.completedAt || "Not available"}</strong>
          </div>
        </div>
        <div className="notification-bell__applicationBox">
          <span>Application</span>
          <p>{detail.message || "No application message was provided."}</p>
        </div>
        <div className="notification-bell__applicationBox">
          <span>Reply Message</span>
          <p>{detail.response || "No reply message was provided."}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <strong>{item.message || "Notification"}</strong>
      <div className="notification-bell__applicationBox">
        <span>Message</span>
        <p>{item.message || "No notification message was provided."}</p>
      </div>
    </>
  );
}

export default function Notifications() {
  const { sessionProfile } = useAuth();
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all");
  const [activeItem, setActiveItem] = useState(null);
  const [activeDetail, setActiveDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

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

  function markItemReadLocally(id) {
    setItems((prev) =>
      prev.map((current) =>
        current.id === id ? { ...current, isRead: true } : current,
      ),
    );
  }

  async function markItemRead(item) {
    if (item.isRead) return;
    try {
      await markNotificationRead(item.id);
      markItemReadLocally(item.id);
    } catch {
      // Reading details should not be blocked by a read-state write failure.
    }
  }

  async function openDetails(item) {
    setActiveItem(item);
    setActiveDetail(null);
    setDetailError("");
    void markItemRead(item);

    if (!item.referenceId) {
      setDetailLoading(false);
      return;
    }

    const group = getNotificationGroup(item.type);
    setDetailLoading(true);

    try {
      if (group === "booking") {
        setActiveDetail(await getBookingById(item.referenceId, sessionProfile));
        return;
      }

      if (group === "repair") {
        setActiveDetail(await getRepairTicketById(item.referenceId, sessionProfile));
        return;
      }

      if (group === "match") {
        const matches = await getMatchRequests(sessionProfile);
        const match = matches.find((entry) => entry.id === item.referenceId);
        if (!match) {
          throw new Error("The related match request could not be found.");
        }
        setActiveDetail(match);
      }
    } catch (error) {
      setDetailError(error?.message || "Detailed information could not be loaded.");
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <h1>Notifications</h1>
          <p>Review booking updates, repair logs, and partner notices from your notification records.</p>
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
          {filteredItems.map((item) => {
            const group = getNotificationGroup(item.type);

            return (
              <article key={item.id} className="notification-bell__item">
                <div className="notification-bell__cardHead">
                  <div className="notification-bell__badgeRow">
                    <span className={`notification-bell__typeBadge notification-bell__typeBadge--${group}`}>
                      {getTypeLabel(item.type)}
                    </span>
                    {item.statusContext ? (
                      <span className={`status-pill ${statusTone(item.statusContext)}`}>
                        {getStatusLabel(item.statusContext)}
                      </span>
                    ) : null}
                  </div>
                  {!item.isRead ? <span className="notification-bell__unreadDot" aria-label="Unread notification" /> : null}
                </div>
                <strong>{item.message}</strong>
                <span className="notification-bell__time">{item.createdAt}</span>
                <div className="notification-bell__itemActions">
                  <button className="btn-secondary" type="button" onClick={() => openDetails(item)}>
                    View Details
                  </button>
                  {!item.isRead ? (
                    <button
                      className="btn-secondary"
                      type="button"
                      onClick={async () => {
                        await markNotificationRead(item.id);
                        markItemReadLocally(item.id);
                      }}
                    >
                      Mark read
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {filteredItems.length === 0 && (
        <section className="page-panel">
          <p>No notifications match the selected filter.</p>
        </section>
      )}

      <NotificationModal
        item={activeItem}
        detail={activeDetail}
        loading={detailLoading}
        error={detailError}
        onClose={() => {
          setActiveItem(null);
          setActiveDetail(null);
          setDetailError("");
          setDetailLoading(false);
        }}
      />
    </div>
  );
}
