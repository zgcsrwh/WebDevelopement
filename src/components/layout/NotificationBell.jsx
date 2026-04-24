import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, CalendarDays, CheckCheck, LoaderCircle, ShieldAlert, Users, Wrench, X } from "lucide-react";
import "../../pages/pageStyles.css";
import {
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToNotifications,
} from "../../services/notificationService";
import { getBookingById } from "../../services/bookingService";
import { getRepairTicketById } from "../../services/reportService";
import {
  getMatchRequests,
  respondToMatchRequest,
  subscribeToMatchRequests,
} from "../../services/partnerService";
import { useAuth } from "../../provider/AuthContext";
import { statusTone, toTitleText } from "../../utils/presentation";
import "./NotificationBell.css";

const NOTIFICATION_TABS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "booking", label: "Booking" },
  { key: "repair", label: "Repair" },
  { key: "match", label: "Match" },
];

function sortByNewest(items = []) {
  return [...items].sort((left, right) =>
    String(right.sortValue || right.createdAt || "").localeCompare(String(left.sortValue || left.createdAt || "")),
  );
}

function getNotificationGroup(type = "") {
  const value = String(type || "").trim().toLowerCase();
  if (value === "facility_request") return "booking";
  if (value === "repair_report") return "repair";
  if (["match_request", "friend", "match", "matching", "partner_request"].includes(value)) return "match";
  return "all";
}

function getTypeLabel(type = "") {
  const value = String(type || "").trim().toLowerCase();
  if (value === "facility_request") return "Booking";
  if (value === "repair_report") return "Repair";
  if (["match_request", "friend", "match", "matching", "partner_request"].includes(value)) return "Match";
  return toTitleText(type || "notification");
}

function getStatusLabel(status = "") {
  const value = String(status || "").trim();
  return value || "unknown";
}

function getTypeIcon(type = "") {
  const props = { size: 18, strokeWidth: 2.2 };
  const value = String(type || "").trim().toLowerCase();

  if (value === "facility_request") {
    return <CalendarDays {...props} />;
  }

  if (value === "repair_report") {
    return <Wrench {...props} />;
  }

  if (["match_request", "friend", "match", "matching", "partner_request"].includes(value)) {
    return <Users {...props} />;
  }

  return <Bell {...props} />;
}

function buildMatchNotificationKey(referenceId, status = "") {
  if (!referenceId) {
    return "";
  }

  return `${referenceId}:${String(status || "").trim().toLowerCase()}`;
}

function createSyntheticMatchItem(request, isRead = false) {
  const status = String(request.status || "").trim().toLowerCase();
  const direction = request.direction;
  const counterpartName = request.counterpartName || "This member";
  let message = "Match request updated.";

  if (status === "pending" && direction === "incoming") {
    message = `${counterpartName} sent you a new partner request.`;
  } else if (status === "accepted" && direction === "outgoing") {
    message = `${counterpartName} accepted your partner request.`;
  } else if (status === "rejected" && direction === "outgoing") {
    message = `${counterpartName} rejected your partner request.`;
  } else if (status === "invalidated") {
    message =
      direction === "incoming"
        ? `A partner request from ${counterpartName} is now invalidated.`
        : `Your partner request to ${counterpartName} is now invalidated.`;
  }

  return {
    id: `matching:${request.id}:${status}`,
    source: "matching",
    group: "match",
    type: "match_request",
    message,
    statusContext: status,
    referenceId: request.id,
    isRead,
    createdAt: request.completedAt || request.createdAt,
    sortValue: request.completedAt || request.createdAt,
    request,
    syntheticReadKey: `matching:${request.id}:${status}`,
  };
}

function normalizeNotificationItem(item) {
  const group = getNotificationGroup(item.type);

  return {
    id: item.id,
    source: "notification",
    group,
    type: item.type,
    message: item.message,
    statusContext: item.statusContext,
    referenceId: item.referenceId,
    isRead: item.isRead,
    createdAt: item.createdAt,
    sortValue: item.createdAt,
    raw: item,
  };
}

function ModalShell({ title, description, onClose, children }) {
  return (
    <div className="notification-bell__modalOverlay" role="presentation">
      <div className="notification-bell__modal" role="dialog" aria-modal="true" aria-labelledby="notification-bell-modal-title">
        <div className="notification-bell__modalBody">
          <div className="notification-bell__modalCopy">
            <div className="notification-bell__modalHeading">
              <h3 id="notification-bell-modal-title">{title}</h3>
              <button
                className="notification-bell__modalClose"
                type="button"
                aria-label="Close notifications modal"
                onClick={onClose}
              >
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

function ModalAlert({ tone = "error", title, message }) {
  if (!message) {
    return null;
  }

  return (
    <section className={`notification-bell__alert notification-bell__alert--${tone}`}>
      {title ? <strong>{title}</strong> : null}
      <p>{message}</p>
    </section>
  );
}

function LoadingState({ label }) {
  return (
    <div className="notification-bell__loading">
      <LoaderCircle className="notification-bell__spinner" size={20} />
      <span>{label}</span>
    </div>
  );
}

function NotificationSummaryCard({ item, children }) {
  return (
    <div className="notification-bell__modalCard">
      <div className="notification-bell__modalMeta">
        <span className={`notification-bell__typeBadge notification-bell__typeBadge--${item.group}`}>
          {getTypeLabel(item.type)}
        </span>
        {item.statusContext ? (
          <span className={`status-pill ${statusTone(item.statusContext)}`}>
            {getStatusLabel(item.statusContext)}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function BookingDetailModal({ item, detail, loading, error, onClose }) {
  return (
    <ModalShell
      title="Booking Notification"
      description="Open a full booking summary directly from the bell without leaving the current page."
      onClose={onClose}
    >
      {loading ? <LoadingState label="Loading booking details..." /> : null}
      {!loading && error ? <ModalAlert title="Booking details unavailable" message={error} /> : null}

      {!loading ? (
        <NotificationSummaryCard item={item}>
          <strong>{detail?.facilityLabel || detail?.facilityName || item.message}</strong>
          {detail ? (
            <>
              <div className="notification-bell__detailGrid">
                <div>
                  <span>Date</span>
                  <strong>{detail.date || "Not available"}</strong>
                </div>
                <div>
                  <span>Start Time</span>
                  <strong>{detail.startTime || "Not available"}</strong>
                </div>
                <div>
                  <span>End Time</span>
                  <strong>{detail.endTime || "Not available"}</strong>
                </div>
                <div>
                  <span>Attendees</span>
                  <strong>{detail.attendees || "Not available"}</strong>
                </div>
              </div>
              <div className="notification-bell__applicationBox">
                <span>Activity Description</span>
                <p>{detail.activityDescription || "No activity description was provided."}</p>
              </div>
              <div className="notification-bell__applicationBox">
                <span>Staff Response</span>
                <p>{detail.feedback || "No staff response has been added yet."}</p>
              </div>
              <div className="notification-bell__applicationBox">
                <span>Participants</span>
                <p>{(detail.participantNames || []).join(" / ") || "No invited participants."}</p>
              </div>
            </>
          ) : (
            <div className="notification-bell__applicationBox">
              <span>Summary</span>
              <p>{item.message}</p>
            </div>
          )}
        </NotificationSummaryCard>
      ) : null}

      <div className="notification-bell__modalActions">
        <button className="btn-secondary" type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </ModalShell>
  );
}

function RepairDetailModal({ item, detail, loading, error, onClose }) {
  return (
    <ModalShell
      title="Repair Notification"
      description="Review the submitted repair record without leaving the current page."
      onClose={onClose}
    >
      {loading ? <LoadingState label="Loading repair details..." /> : null}
      {!loading && error ? <ModalAlert title="Repair details unavailable" message={error} /> : null}

      {!loading ? (
        <NotificationSummaryCard item={item}>
          <strong>{detail?.facilityLabel || item.message}</strong>
          {detail ? (
            <>
              <div className="notification-bell__detailGrid">
                <div>
                  <span>Reported At</span>
                  <strong>{detail.createdAt || "Not available"}</strong>
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
          ) : (
            <div className="notification-bell__applicationBox">
              <span>Summary</span>
              <p>{item.message}</p>
            </div>
          )}
        </NotificationSummaryCard>
      ) : null}

      <div className="notification-bell__modalActions">
        <button className="btn-secondary" type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </ModalShell>
  );
}

function MatchReviewModal({
  item,
  detail,
  loading,
  error,
  pending,
  respondMessage,
  onRespondMessageChange,
  onClose,
  onDecision,
}) {
  const counterpartInterests = detail?.counterpartInterestsRaw || detail?.counterpartInterests || [];
  const counterpartAvailability = detail?.counterpartAvailabilityRaw || detail?.counterpartAvailability || [];
  const actorName = detail?.counterpartName || "this member";

  return (
    <ModalShell
      title="Review Match Request"
      description={`${actorName} wants to connect with you. Review the application before responding.`}
      onClose={onClose}
    >
      {loading ? <LoadingState label="Loading match request..." /> : null}
      {!loading && error ? <ModalAlert title="Match request unavailable" message={error} /> : null}

      {!loading ? (
        <>
          <NotificationSummaryCard item={item}>
            <strong>{detail?.counterpartName || actorName}</strong>
            <p className="notification-bell__description">
              {detail?.counterpartBio || "No profile description has been added yet."}
            </p>
            <div className="notification-bell__applicationBox">
              <span>Application</span>
              <p>{detail?.message || item.message}</p>
            </div>
            <div className="notification-bell__detailGrid">
              <div>
                <span>Interests</span>
                <strong>{counterpartInterests.join(" / ") || "No interests listed"}</strong>
              </div>
              <div>
                <span>Availability</span>
                <strong>{counterpartAvailability.join(" / ") || "No availability listed"}</strong>
              </div>
            </div>
          </NotificationSummaryCard>

          <label className="notification-bell__field">
            <span>Reply Message</span>
            <textarea
              className="notification-bell__textarea"
              value={respondMessage}
              onChange={(event) => onRespondMessageChange(event.target.value)}
              placeholder="Add an optional response for this member..."
              rows={4}
            />
          </label>
        </>
      ) : null}

      <div className="notification-bell__modalActions">
        <button className="btn-secondary" type="button" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-secondary" type="button" disabled={pending || loading} onClick={() => onDecision("rejected")}>
          Reject
        </button>
        <button className="btn" type="button" disabled={pending || loading} onClick={() => onDecision("accepted")}>
          {pending ? "Updating..." : "Accept"}
        </button>
      </div>
    </ModalShell>
  );
}

function MatchInfoModal({ item, detail, loading, error, onClose }) {
  const counterpartInterests = detail?.counterpartInterestsRaw || detail?.counterpartInterests || [];
  const counterpartAvailability = detail?.counterpartAvailabilityRaw || detail?.counterpartAvailability || [];

  return (
    <ModalShell
      title="Match Notification"
      description="Review this partner matching update without leaving the current page."
      onClose={onClose}
    >
      {loading ? <LoadingState label="Loading match details..." /> : null}
      {!loading && error ? <ModalAlert title="Match details unavailable" message={error} /> : null}

      {!loading ? (
        <NotificationSummaryCard item={item}>
          <strong>{detail?.counterpartName || "Match update"}</strong>
          <p className="notification-bell__description">
            {detail?.counterpartBio || item.message}
          </p>
          {detail?.message ? (
            <div className="notification-bell__applicationBox">
              <span>Application</span>
              <p>{detail.message}</p>
            </div>
          ) : null}
          {detail?.response ? (
            <div className="notification-bell__applicationBox">
              <span>Reply Message</span>
              <p>{detail.response}</p>
            </div>
          ) : null}
          {!detail && item.message ? (
            <div className="notification-bell__applicationBox">
              <span>Summary</span>
              <p>{item.message}</p>
            </div>
          ) : null}
          {detail ? (
            <div className="notification-bell__detailGrid">
              <div>
                <span>Interests</span>
                <strong>{counterpartInterests.join(" / ") || "No interests listed"}</strong>
              </div>
              <div>
                <span>Availability</span>
                <strong>{counterpartAvailability.join(" / ") || "No availability listed"}</strong>
              </div>
            </div>
          ) : null}
        </NotificationSummaryCard>
      ) : null}

      <div className="notification-bell__modalActions">
        <button className="btn-secondary" type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </ModalShell>
  );
}

function StaffNotificationModal({ item, onClose }) {
  return (
    <ModalShell
      title="Staff Notification"
      description="Review this staff update without leaving the current page."
      onClose={onClose}
    >
      <NotificationSummaryCard item={item}>
        <strong>{item.message || "Staff update"}</strong>
        <div className="notification-bell__applicationBox">
          <span>Message</span>
          <p>{item.message || "No additional message was provided."}</p>
        </div>
        <div className="notification-bell__detailGrid">
          <div>
            <span>Received At</span>
            <strong>{item.createdAt || "Not available"}</strong>
          </div>
          {item.referenceId ? (
            <div>
              <span>Reference ID</span>
              <strong>{item.referenceId}</strong>
            </div>
          ) : null}
        </div>
      </NotificationSummaryCard>

      <div className="notification-bell__modalActions">
        <button className="btn-secondary" type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </ModalShell>
  );
}

export default function NotificationBell({ variant = "member" }) {
  const { sessionProfile, sessionRole } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [matchRequests, setMatchRequests] = useState([]);
  const [syntheticReadKeys, setSyntheticReadKeys] = useState(() => new Set());
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [panelError, setPanelError] = useState("");
  const [panelMessage, setPanelMessage] = useState("");
  const [activeModal, setActiveModal] = useState(null);
  const [modalDetail, setModalDetail] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState("");
  const [matchRespondMessage, setMatchRespondMessage] = useState("");
  const [matchDecisionPending, setMatchDecisionPending] = useState(false);
  const containerRef = useRef(null);
  const isMemberVariant = variant === "member";
  const isStaffVariant = variant === "staff";

  useEffect(() => {
    let unsubscribeNotifications = () => {};
    let unsubscribeMatches = () => {};
    let cancelled = false;

    subscribeToNotifications(
      sessionProfile,
      (items) => {
        if (!cancelled) {
          setNotifications(items);
          setPanelError("");
        }
      },
      () => {
        if (!cancelled) {
          setNotifications([]);
          setPanelError("Notifications could not be loaded.");
        }
      },
    ).then((unsubscribe) => {
      if (cancelled) {
        unsubscribe();
        return;
      }
      unsubscribeNotifications = unsubscribe;
    });

    if (sessionRole === "Member" && !isStaffVariant) {
      subscribeToMatchRequests(
        sessionProfile,
        (items) => {
          if (!cancelled) {
            setMatchRequests(items);
          }
        },
        () => {
          if (!cancelled) {
            setMatchRequests([]);
          }
        },
      ).then((unsubscribe) => {
        if (cancelled) {
          unsubscribe();
          return;
        }
        unsubscribeMatches = unsubscribe;
      });
    } else {
      setMatchRequests([]);
    }

    return () => {
      cancelled = true;
      unsubscribeNotifications();
      unsubscribeMatches();
    };
  }, [sessionProfile, sessionRole, isStaffVariant]);

  useEffect(() => {
    if (!panelOpen) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (!containerRef.current?.contains(event.target)) {
        setPanelOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setPanelOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [panelOpen]);

  const matchRequestIndex = useMemo(
    () => new Map(matchRequests.map((request) => [request.id, request])),
    [matchRequests],
  );

  const notificationItems = useMemo(
    () => notifications.map(normalizeNotificationItem),
    [notifications],
  );

  const syntheticMatchItems = useMemo(() => {
    if (sessionRole !== "Member") {
      return [];
    }

    const notificationKeys = new Set(
      notificationItems
        .filter((item) => item.group === "match")
        .map((item) => buildMatchNotificationKey(item.referenceId, item.statusContext))
        .filter(Boolean),
    );

    return matchRequests
      .filter((request) => {
        const status = String(request.status || "").trim().toLowerCase();
        if (status === "pending") {
          return request.direction === "incoming";
        }
        if (status === "accepted" || status === "rejected") {
          return request.direction === "outgoing";
        }
        if (status === "invalidated") {
          return true;
        }
        return false;
      })
      .filter((request) => !notificationKeys.has(buildMatchNotificationKey(request.id, request.status)))
      .map((request) =>
        createSyntheticMatchItem(request, syntheticReadKeys.has(`matching:${request.id}:${request.status}`)),
      );
  }, [matchRequests, notificationItems, sessionRole, syntheticReadKeys]);

  const allItems = useMemo(
    () => sortByNewest(isStaffVariant ? notificationItems : [...notificationItems, ...syntheticMatchItems]),
    [notificationItems, syntheticMatchItems, isStaffVariant],
  );

  const unreadCount = useMemo(
    () => allItems.filter((item) => !item.isRead).length,
    [allItems],
  );

  const visibleItems = useMemo(() => {
    if (isStaffVariant) {
      return allItems;
    }

    if (activeTab === "all") {
      return allItems;
    }

    if (activeTab === "unread") {
      return allItems.filter((item) => !item.isRead);
    }

    return allItems.filter((item) => item.group === activeTab);
  }, [activeTab, allItems, isStaffVariant]);

  function markSyntheticItemRead(item) {
    if (!item?.syntheticReadKey) {
      return;
    }

    setSyntheticReadKeys((current) => {
      const next = new Set(current);
      next.add(item.syntheticReadKey);
      return next;
    });
  }

  async function markItemRead(item) {
    if (!item || item.isRead) {
      return;
    }

    if (item.source === "notification") {
      await markNotificationRead(item.id);
      setNotifications((current) =>
        current.map((entry) => (entry.id === item.id ? { ...entry, isRead: true } : entry)),
      );
      return;
    }

    markSyntheticItemRead(item);
  }

  async function loadMatchDetail(referenceId) {
    if (!referenceId) {
      return null;
    }

    const existing = matchRequestIndex.get(referenceId);
    if (existing) {
      return existing;
    }

    const latest = await getMatchRequests(sessionProfile);
    setMatchRequests(latest);
    return latest.find((request) => request.id === referenceId) || null;
  }

  function resetModalState() {
    setModalDetail(null);
    setModalError("");
    setModalLoading(false);
    setMatchRespondMessage("");
    setMatchDecisionPending(false);
  }

  function closeModal() {
    setActiveModal(null);
    resetModalState();
  }

  function openModal(kind, item) {
    setPanelOpen(false);
    setActiveModal({ kind, item });
    setModalDetail(null);
    setModalError("");
    setModalLoading(true);
    setMatchDecisionPending(false);
  }

  async function openBookingDetails(item) {
    openModal("booking", item);
    void markItemRead(item);

    if (!item.referenceId) {
      setModalError("Detailed booking data is unavailable for this notification.");
      setModalLoading(false);
      return;
    }

    try {
      const detail = await getBookingById(item.referenceId, sessionProfile);
      setModalDetail(detail);
    } catch (error) {
      setModalError(error?.message || "Detailed booking data could not be loaded.");
    } finally {
      setModalLoading(false);
    }
  }

  async function openRepairDetails(item) {
    openModal("repair", item);
    void markItemRead(item);

    if (!item.referenceId) {
      setModalError("Detailed repair data is unavailable for this notification.");
      setModalLoading(false);
      return;
    }

    try {
      const detail = await getRepairTicketById(item.referenceId, sessionProfile);
      setModalDetail(detail);
    } catch (error) {
      setModalError(error?.message || "Detailed repair data could not be loaded.");
    } finally {
      setModalLoading(false);
    }
  }

  async function openMatchReview(item) {
    openModal("match-review", item);
    void markItemRead(item);

    try {
      const detail = await loadMatchDetail(item.referenceId);
      if (!detail) {
        throw new Error("This match request is no longer available.");
      }

      setModalDetail(detail);
      setMatchRespondMessage(detail.response || "");
    } catch (error) {
      setModalError(error?.message || "The full match request could not be loaded.");
    } finally {
      setModalLoading(false);
    }
  }

  async function openMatchInfo(item) {
    openModal("match-info", item);
    void markItemRead(item);

    try {
      const detail = item.referenceId ? await loadMatchDetail(item.referenceId) : null;
      setModalDetail(detail);
    } catch (error) {
      setModalError(error?.message || "The full match details could not be loaded.");
    } finally {
      setModalLoading(false);
    }
  }

  function openStaffNotification(item) {
    setPanelOpen(false);
    setActiveModal({ kind: "staff-info", item });
    setModalDetail(null);
    setModalError("");
    setModalLoading(false);
    setMatchRespondMessage("");
    setMatchDecisionPending(false);
    void markItemRead(item);
  }

  async function handleMatchDecision(nextStatus) {
    if (!activeModal?.item) {
      return;
    }

    const currentItem = activeModal.item;
    const detail = modalDetail;

    if (!detail?.id || detail.direction !== "incoming" || detail.status !== "pending") {
      setModalError("This request has expired or has already been processed.");
      return;
    }

    setMatchDecisionPending(true);
    setModalError("");

    try {
      await respondToMatchRequest(
        {
          match_id: detail.id,
          status: [nextStatus],
          respond_message: matchRespondMessage.trim(),
        },
        sessionProfile,
      );

      const latestRequests = await getMatchRequests(sessionProfile);
      setMatchRequests(latestRequests);
      setPanelMessage(
        nextStatus === "accepted" ? "Partner request accepted." : "Partner request rejected.",
      );
      if (currentItem.source === "matching") {
        markSyntheticItemRead(currentItem);
      }
      closeModal();
    } catch (error) {
      if (String(error?.code || "").toLowerCase().includes("failed-precondition")) {
        setModalError("This request has expired or has already been processed.");
      } else {
        setModalError(error?.message || "The request could not be updated.");
      }
    } finally {
      setMatchDecisionPending(false);
    }
  }

  async function handleMarkAllAsRead() {
    setPanelMessage("");
    try {
      await markAllNotificationsRead(sessionProfile);
      setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
      setSyntheticReadKeys((current) => {
        const next = new Set(current);
        syntheticMatchItems.forEach((item) => {
          if (item.syntheticReadKey) {
            next.add(item.syntheticReadKey);
          }
        });
        return next;
      });
    } catch (error) {
      setPanelError(error?.message || "Notifications could not be marked as read.");
    }
  }

  function renderModal() {
    if (!activeModal) {
      return null;
    }

    if (activeModal.kind === "booking") {
      return (
        <BookingDetailModal
          item={activeModal.item}
          detail={modalDetail}
          loading={modalLoading}
          error={modalError}
          onClose={closeModal}
        />
      );
    }

    if (activeModal.kind === "repair") {
      return (
        <RepairDetailModal
          item={activeModal.item}
          detail={modalDetail}
          loading={modalLoading}
          error={modalError}
          onClose={closeModal}
        />
      );
    }

    if (activeModal.kind === "match-review") {
      return (
        <MatchReviewModal
          item={activeModal.item}
          detail={modalDetail}
          loading={modalLoading}
          error={modalError}
          pending={matchDecisionPending}
          respondMessage={matchRespondMessage}
          onRespondMessageChange={setMatchRespondMessage}
          onClose={closeModal}
          onDecision={handleMatchDecision}
        />
      );
    }

    if (activeModal.kind === "staff-info") {
      return <StaffNotificationModal item={activeModal.item} onClose={closeModal} />;
    }

    return (
      <MatchInfoModal
        item={activeModal.item}
        detail={modalDetail}
        loading={modalLoading}
        error={modalError}
        onClose={closeModal}
      />
    );
  }

  return (
    <div className={`notification-bell ${isMemberVariant ? "notification-bell--member" : "notification-bell--shell"}`} ref={containerRef}>
      <button
        className={
          isMemberVariant
            ? "member-shell__iconButton notification-bell__trigger"
            : `notification-bell__trigger notification-bell__trigger--shell ${panelOpen ? "is-open" : ""}`
        }
        type="button"
        aria-label="Notifications"
        aria-pressed={panelOpen}
        onClick={() => {
          setPanelOpen((current) => !current);
          setPanelMessage("");
        }}
      >
        <Bell size={isMemberVariant ? 24 : 28} />
        {unreadCount > 0 ? <span className="notification-bell__badge">{unreadCount}</span> : null}
      </button>

      {panelOpen ? (
        <div className={`notification-bell__panel ${isMemberVariant ? "" : "notification-bell__panel--shell"}`}>
          <div className="notification-bell__head">
            <div>
              <h2>Notifications</h2>
              <p>{unreadCount} unread</p>
            </div>
            <div className="notification-bell__headActions">
              <button className="btn-ghost notification-bell__markAll" type="button" onClick={handleMarkAllAsRead}>
                <CheckCheck size={16} />
                Mark all as read
              </button>
              <button
                className="notification-bell__close"
                type="button"
                aria-label="Close notifications"
                onClick={() => setPanelOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {panelError ? (
            <div className="notification-bell__panelMessage notification-bell__panelMessage--error">{panelError}</div>
          ) : null}
          {panelMessage ? (
            <div className="notification-bell__panelMessage notification-bell__panelMessage--success">{panelMessage}</div>
          ) : null}

          {!isStaffVariant ? (
            <div className="notification-bell__tabs">
              {NOTIFICATION_TABS.map((tab) => (
                <button
                  key={tab.key}
                  className={`notification-bell__tab ${activeTab === tab.key ? "is-active" : ""}`}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="notification-bell__list">
            {visibleItems.length > 0 ? (
              visibleItems.map((item) => (
                <article
                  key={item.id}
                  className={`notification-bell__item ${item.isRead ? "" : "is-unread"} ${isStaffVariant ? "notification-bell__item--staff" : ""}`}
                  onClick={isStaffVariant ? () => openStaffNotification(item) : undefined}
                  role={isStaffVariant ? "button" : undefined}
                  tabIndex={isStaffVariant ? 0 : undefined}
                  onKeyDown={
                    isStaffVariant
                      ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openStaffNotification(item);
                          }
                        }
                      : undefined
                  }
                >
                  {!isStaffVariant ? (
                    <div className={`notification-bell__icon notification-bell__icon--${item.group}`}>
                      {getTypeIcon(item.type)}
                    </div>
                  ) : null}

                  <div className="notification-bell__content">
                    <div className="notification-bell__meta">
                      <span className={`notification-bell__typeBadge notification-bell__typeBadge--${item.group}`}>
                        {getTypeLabel(item.type)}
                      </span>
                      {item.statusContext ? (
                        <span className={`status-pill ${statusTone(item.statusContext)}`}>
                          {getStatusLabel(item.statusContext)}
                        </span>
                      ) : null}
                    </div>
                    <strong>{item.message}</strong>
                    <span>{item.createdAt || "Just now"}</span>
                  </div>

                  <div className="notification-bell__state">
                    {!item.isRead ? <span className="notification-bell__unreadDot" aria-hidden="true" /> : null}
                  </div>

                  <div className="notification-bell__actions">

                    {!isStaffVariant && item.group === "booking" ? (
                      <button className="btn-secondary" type="button" onClick={() => openBookingDetails(item)}>
                        View Details
                      </button>
                    ) : null}

                    {!isStaffVariant && item.group === "repair" ? (
                      <button className="btn-secondary" type="button" onClick={() => openRepairDetails(item)}>
                        View Details
                      </button>
                    ) : null}

                    {!isStaffVariant &&
                    item.group === "match" &&
                    String(item.statusContext || "").trim().toLowerCase() === "pending" ? (
                      <button className="btn" type="button" onClick={() => openMatchReview(item)}>
                        Review Request
                      </button>
                    ) : null}

                    {!isStaffVariant &&
                    item.group === "match" &&
                    String(item.statusContext || "").trim().toLowerCase() !== "pending" ? (
                      <button className="btn-secondary" type="button" onClick={() => openMatchInfo(item)}>
                        Open Details
                      </button>
                    ) : null}
                  </div>
                </article>
              ))
            ) : (
              <div className="notification-bell__empty">
                <ShieldAlert size={18} />
                <span>{isStaffVariant ? "No staff notifications yet." : "No notifications match the selected tab."}</span>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {renderModal()}
    </div>
  );
}
