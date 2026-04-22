import { useMemo, useState } from "react";
import { Bell, CalendarDays, CheckCheck, ShieldAlert, Users, Wrench, X } from "lucide-react";
import "../../pages/pageStyles.css";
import "../member/memberWorkspace.css";
import "./Preview.css";
import { previewNotifications } from "../../previews/notificationPreviewData";
import { statusTone, toTitleText } from "../../utils/presentation";
import { countMeaningfulCharacters, hasMeaningfulText } from "../../utils/text";

const NOTIFICATION_TABS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "booking", label: "Booking" },
  { key: "repair", label: "Repair" },
  { key: "match", label: "Match" },
];

function sortNotificationsByNewest(items = []) {
  return [...items].sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || "")));
}

function getNotificationGroup(type = "") {
  if (type === "facility_request") return "booking";
  if (type === "repair_report") return "repair";
  if (type === "match_request" || type === "friend") return "match";
  return "all";
}

function getTypeLabel(type = "") {
  if (type === "facility_request") return "Booking";
  if (type === "repair_report") return "Repair";
  if (type === "match_request") return "Match";
  if (type === "friend") return "Friend";
  return toTitleText(type || "notification");
}

function getTypeBadgeClass(type = "") {
  const group = getNotificationGroup(type);
  return `preview-notifications__typeBadge preview-notifications__typeBadge--${group}`;
}

function getNotificationIcon(type = "") {
  const props = { size: 18, strokeWidth: 2.2 };

  if (type === "facility_request") {
    return <CalendarDays {...props} />;
  }

  if (type === "repair_report") {
    return <Wrench {...props} />;
  }

  if (type === "match_request" || type === "friend") {
    return <Users {...props} />;
  }

  return <Bell {...props} />;
}

function getStatusLabel(status = "") {
  const value = String(status || "").trim();
  return value || "unknown";
}

function ModalShell({ title, description, onClose, children }) {
  return (
    <div className="member-modal-overlay preview-notifications__modalOverlay" role="presentation">
      <div className="member-modal preview-notifications__modal" role="dialog" aria-modal="true" aria-labelledby="preview-notification-modal-title">
        <div className="preview-notifications__modalBody">
          <div className="preview-notifications__modalCopy">
            <div className="preview-notifications__modalHeading">
              <h3 id="preview-notification-modal-title">{title}</h3>
              <button className="preview-notifications__modalClose" type="button" aria-label="Close preview modal" onClick={onClose}>
                <X size={20} />
              </button>
            </div>
            {description ? <p>{description}</p> : null}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function BookingDetailPreviewModal({ notification, onClose }) {
  if (!notification) {
    return null;
  }

  return (
    <ModalShell
      title="Booking Notification"
      description="This static preview shows how a booking notification would expand into a full booking summary."
      onClose={onClose}
    >
      <div className="preview-notifications__modalCard">
        <div className="preview-notifications__modalMeta">
          <span className="preview-notifications__typeBadge preview-notifications__typeBadge--booking">Booking</span>
          <span className={`status-pill ${statusTone(notification.status_context)}`}>{getStatusLabel(notification.status_context)}</span>
        </div>
        <strong>{notification.facility_name} ({notification.facility_type})</strong>
        <div className="preview-notifications__detailGrid">
          <div>
            <span>Date</span>
            <strong>{notification.booking_date}</strong>
          </div>
          <div>
            <span>Start Time</span>
            <strong>{notification.start_time}</strong>
          </div>
          <div>
            <span>End Time</span>
            <strong>{notification.end_time}</strong>
          </div>
          <div>
            <span>Attendees</span>
            <strong>{notification.attendees}</strong>
          </div>
        </div>
        <div className="preview-notifications__applicationBox">
          <span>Activity Description</span>
          <p>{notification.activity_description}</p>
        </div>
        <div className="preview-notifications__applicationBox">
          <span>Staff Response</span>
          <p>{notification.staff_response || "No staff response has been added yet."}</p>
        </div>
        <div className="preview-notifications__applicationBox">
          <span>Participants</span>
          <p>{(notification.participants || []).join(" / ") || "No invited participants."}</p>
        </div>
      </div>

      <div className="member-modal__actions preview-notifications__modalActions">
        <button className="btn-secondary" type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </ModalShell>
  );
}

function RepairDetailPreviewModal({ notification, onClose }) {
  if (!notification) {
    return null;
  }

  return (
    <ModalShell
      title="Repair Notification"
      description="This static preview shows how a repair notification would open the underlying repair details."
      onClose={onClose}
    >
      <div className="preview-notifications__modalCard">
        <div className="preview-notifications__modalMeta">
          <span className="preview-notifications__typeBadge preview-notifications__typeBadge--repair">Repair</span>
          <span className={`status-pill ${statusTone(notification.status_context)}`}>{getStatusLabel(notification.status_context)}</span>
        </div>
        <strong>{notification.facility_name} ({notification.facility_type})</strong>
        <div className="preview-notifications__detailGrid">
          <div>
            <span>Reported At</span>
            <strong>{notification.repair_time}</strong>
          </div>
          <div>
            <span>Faulty Part</span>
            <strong>{(notification.faulty_parts || []).map((item) => toTitleText(item)).join(", ")}</strong>
          </div>
        </div>
        <div className="preview-notifications__applicationBox">
          <span>Issue Description</span>
          <p>{notification.repair_description}</p>
        </div>
      </div>

      <div className="member-modal__actions preview-notifications__modalActions">
        <button className="btn-secondary" type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </ModalShell>
  );
}

function MatchDecisionPreviewModal({ notification, respondMessage, error, onRespondMessageChange, onClose, onDecision }) {
  if (!notification) {
    return null;
  }

  return (
    <ModalShell
      title="Review Match Request"
      description={`${notification.actor_name || "This member"} wants to connect with you. This is a static preview, so submitting a decision only updates the local preview state.`}
      onClose={onClose}
    >
      {error ? (
        <section className="member-alert member-alert--error">
          <strong>Cannot send response</strong>
          <p>{error}</p>
        </section>
      ) : null}

      <div className="preview-notifications__modalCard">
        <div className="preview-notifications__modalMeta">
          <span className="preview-notifications__typeBadge preview-notifications__typeBadge--match">Match</span>
          <span className={`status-pill ${statusTone(notification.status_context)}`}>{getStatusLabel(notification.status_context)}</span>
        </div>
        <strong>{notification.actor_name || "Match request"}</strong>
        <p>{notification.actor_bio || notification.message}</p>
        <div className="preview-notifications__applicationBox">
          <span>Application</span>
          <p>{notification.apply_description || "No application message was provided."}</p>
        </div>
        <div className="preview-notifications__detailGrid">
          <div>
            <span>Interests</span>
            <strong>{(notification.actor_interests || []).join(" / ") || "No interests listed"}</strong>
          </div>
          <div>
            <span>Availability</span>
            <strong>{(notification.actor_availability || []).join(" / ") || "No availability listed"}</strong>
          </div>
        </div>
      </div>

      <label className="preview-notifications__field">
        <span>Reply Message</span>
        <textarea
          className="preview-notifications__textarea"
          value={respondMessage}
          onChange={(event) => onRespondMessageChange(event.target.value)}
          placeholder="Add an optional response for this member..."
          rows={4}
        />
      </label>

      <div className="member-modal__actions preview-notifications__modalActions">
        <button className="btn-secondary" type="button" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-secondary" type="button" onClick={() => onDecision("rejected")}>
          Reject
        </button>
        <button className="btn" type="button" onClick={() => onDecision("accepted")}>
          Accept
        </button>
      </div>
    </ModalShell>
  );
}

function MatchInfoPreviewModal({ notification, onClose }) {
  if (!notification) {
    return null;
  }

  return (
    <ModalShell
      title="Match Notification"
      description="This static preview shows a read-only match notification summary."
      onClose={onClose}
    >
      <div className="preview-notifications__modalCard">
        <div className="preview-notifications__modalMeta">
          <span className="preview-notifications__typeBadge preview-notifications__typeBadge--match">Match</span>
          <span className={`status-pill ${statusTone(notification.status_context)}`}>{getStatusLabel(notification.status_context)}</span>
        </div>
        <strong>{notification.actor_name || "Match update"}</strong>
        <p>{notification.message}</p>
        {notification.apply_description ? (
          <div className="preview-notifications__applicationBox">
            <span>Application</span>
            <p>{notification.apply_description}</p>
          </div>
        ) : null}
        {notification.respond_message ? (
          <div className="preview-notifications__applicationBox">
            <span>Reply Message</span>
            <p>{notification.respond_message}</p>
          </div>
        ) : null}
      </div>

      <div className="member-modal__actions preview-notifications__modalActions">
        <button className="btn-secondary" type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </ModalShell>
  );
}

export default function PreviewNotificationsBell() {
  const [items, setItems] = useState(() => sortNotificationsByNewest(previewNotifications.map((item) => ({ ...item }))));
  const [activeTab, setActiveTab] = useState("all");
  const [panelOpen, setPanelOpen] = useState(true);
  const [banner, setBanner] = useState("");
  const [activeModal, setActiveModal] = useState(null);
  const [matchReplyMessage, setMatchReplyMessage] = useState("");
  const [matchDecisionError, setMatchDecisionError] = useState("");

  const unreadCount = useMemo(() => items.filter((item) => !item.is_read).length, [items]);

  const visibleItems = useMemo(() => {
    if (activeTab === "all") {
      return sortNotificationsByNewest(items);
    }

    if (activeTab === "unread") {
      return sortNotificationsByNewest(items.filter((item) => !item.is_read));
    }

    return sortNotificationsByNewest(items.filter((item) => getNotificationGroup(item.type) === activeTab));
  }, [activeTab, items]);

  function markItemRead(id) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, is_read: true } : item)),
    );
  }

  function openModal(notification, mode) {
    markItemRead(notification.id);
    setMatchDecisionError("");
    setMatchReplyMessage(notification.respond_message || "");
    setActiveModal({ mode, notification });
  }

  function closeModal() {
    setActiveModal(null);
    setMatchDecisionError("");
  }

  function handlePreviewAction(message) {
    setBanner(message);
  }

  function handleMatchDecision(nextStatus) {
    if (!activeModal?.notification) {
      return;
    }

    if (!["accepted", "rejected"].includes(nextStatus)) {
      setMatchDecisionError("This request has expired or has already been processed.");
      return;
    }

    const actorName = activeModal.notification.actor_name || "this member";
    setItems((current) =>
      current.map((item) =>
        item.id === activeModal.notification.id
          ? {
              ...item,
              is_read: true,
              status_context: nextStatus,
              respond_message: hasMeaningfulText(matchReplyMessage) ? matchReplyMessage.trim() : "",
            }
          : item,
      ),
    );
    setBanner(
      nextStatus === "accepted"
        ? `Preview only: would accept ${actorName}'s match request.`
        : `Preview only: would reject ${actorName}'s match request.`,
    );
    closeModal();
  }

  function renderModal() {
    if (!activeModal) {
      return null;
    }

    if (activeModal.mode === "booking") {
      return <BookingDetailPreviewModal notification={activeModal.notification} onClose={closeModal} />;
    }

    if (activeModal.mode === "repair") {
      return <RepairDetailPreviewModal notification={activeModal.notification} onClose={closeModal} />;
    }

    if (activeModal.mode === "match-pending") {
      return (
        <MatchDecisionPreviewModal
          notification={activeModal.notification}
          respondMessage={matchReplyMessage}
          error={matchDecisionError}
          onRespondMessageChange={setMatchReplyMessage}
          onClose={closeModal}
          onDecision={handleMatchDecision}
        />
      );
    }

    return <MatchInfoPreviewModal notification={activeModal.notification} onClose={closeModal} />;
  }

  return (
    <div className="preview-notifications-page">
      <section className="preview-notifications-page__hero">
        <div>
          <h1>Notification Bell Preview</h1>
          <p>
            This static route previews the final bell-only notification center without reading the real database or
            calling any live APIs.
          </p>
        </div>
      </section>

      {banner ? (
        <section className="member-alert member-alert--success">
          <strong>Preview only</strong>
          <p>{banner}</p>
        </section>
      ) : null}

      <section className="preview-notifications-page__dock">
        <div className="preview-notifications-page__bellRow">
          <button
            className="member-shell__iconButton preview-notifications-page__bellButton"
            type="button"
            aria-label="Toggle preview notifications"
            onClick={() => setPanelOpen((current) => !current)}
          >
            <Bell size={24} />
            {unreadCount > 0 ? <span className="member-shell__badge">{unreadCount}</span> : null}
          </button>
        </div>

        {panelOpen ? (
          <div className="preview-notifications">
            <div className="preview-notifications__head">
              <div>
                <h2>Notifications</h2>
                <p>{unreadCount} unread</p>
              </div>
              <div className="preview-notifications__headActions">
                <button
                  className="btn-ghost preview-notifications__markAll"
                  type="button"
                  onClick={() => setItems((current) => current.map((item) => ({ ...item, is_read: true })))}
                >
                  <CheckCheck size={16} />
                  Mark all as read
                </button>
                <button
                  className="preview-notifications__close"
                  type="button"
                  aria-label="Close preview notifications panel"
                  onClick={() => setPanelOpen(false)}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="preview-notifications__tabs">
              {NOTIFICATION_TABS.map((tab) => (
                <button
                  key={tab.key}
                  className={`preview-notifications__tab ${activeTab === tab.key ? "is-active" : ""}`}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="preview-notifications__list">
              {visibleItems.length > 0 ? (
                visibleItems.map((notification) => (
                  <article
                    key={notification.id}
                    className={`preview-notifications__item ${notification.is_read ? "" : "is-unread"}`}
                  >
                    <div className={`preview-notifications__icon preview-notifications__icon--${getNotificationGroup(notification.type)}`}>
                      {getNotificationIcon(notification.type)}
                    </div>

                    <div className="preview-notifications__content">
                      <div className="preview-notifications__meta">
                        <span className={getTypeBadgeClass(notification.type)}>{getTypeLabel(notification.type)}</span>
                        {notification.status_context ? (
                          <span className={`status-pill ${statusTone(notification.status_context)}`}>
                            {getStatusLabel(notification.status_context)}
                          </span>
                        ) : null}
                      </div>
                      <strong>{notification.message}</strong>
                      <span>{notification.created_at}</span>
                    </div>

                    <div className="preview-notifications__state">
                      {!notification.is_read ? <span className="preview-notifications__unreadDot" aria-hidden="true" /> : null}
                    </div>

                    <div className="preview-notifications__actions">
                      {notification.type === "facility_request" ? (
                        <button className="btn-secondary" type="button" onClick={() => openModal(notification, "booking")}>
                          View Details
                        </button>
                      ) : null}

                      {notification.type === "repair_report" ? (
                        <button className="btn-secondary" type="button" onClick={() => openModal(notification, "repair")}>
                          View Details
                        </button>
                      ) : null}

                      {notification.type === "match_request" && notification.status_context === "pending" ? (
                        <button className="btn" type="button" onClick={() => openModal(notification, "match-pending")}>
                          Review Request
                        </button>
                      ) : null}

                      {(notification.type === "friend" ||
                        (notification.type === "match_request" && notification.status_context !== "pending")) ? (
                        <button className="btn-secondary" type="button" onClick={() => openModal(notification, "match-info")}>
                          Open Details
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))
              ) : (
                <div className="preview-notifications__empty">
                  <ShieldAlert size={18} />
                  <span>No notifications match the selected tab.</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="preview-notifications-page__closedState">
            <strong>Notification panel hidden</strong>
            <p>Use the bell button above to reopen the static preview.</p>
          </div>
        )}
      </section>

      {renderModal()}
    </div>
  );
}

