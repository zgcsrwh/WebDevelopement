// NotificationBell shows the bell list and opens detail dialogs above the page.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { getActionErrorMessage } from "../../utils/errors";
import { formatAvailabilityLabel, statusTone, toTitleText } from "../../utils/presentation";
import "./NotificationBell.css";

const NOTIFICATION_TABS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "booking", label: "Booking" },
  { key: "repair", label: "Repair" },
  { key: "match", label: "Match" },
];

// Keep the newest real notification or matching request at the top.
function sortByNewest(items = []) {
  return [...items].sort((left, right) => {
    const leftSort = Number(left.sortValue || 0);
    const rightSort = Number(right.sortValue || 0);
    if (leftSort !== rightSort) {
      return rightSort - leftSort;
    }

    return String(right.createdAt || "").localeCompare(String(left.createdAt || ""));
  });
}

// Firestore timestamps, Date objects, and string dates all need one sort number.
function getSortValue(value) {
  if (!value) {
    return 0;
  }

  if (value?.seconds) {
    return value.seconds * 1000;
  }

  if (value?.toDate) {
    return value.toDate().getTime();
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

// Database type values can use spaces, hyphens, or underscores.
function getNormalizedTypeKey(type = "") {
  return String(type || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function isMatchType(type = "") {
  const value = getNormalizedTypeKey(type);
  return (
    ["match_request", "friend", "friend_request", "match", "matching", "partner_request"].includes(value) ||
    value.includes("match") ||
    value.includes("partner")
  );
}

// The type decides which tab the notification card belongs to.
function getNotificationGroup(type = "") {
  const value = getNormalizedTypeKey(type);
  if (value === "facility_request") return "booking";
  if (value === "repair_report") return "repair";
  if (isMatchType(value)) return "match";
  return "all";
}

// Show friendly text, but keep the original database value for logic.
function getTypeLabel(type = "") {
  const value = getNormalizedTypeKey(type);
  if (value === "facility_request") return "Booking";
  if (value === "repair_report") return "Repair";
  if (isMatchType(value)) return "Match";
  return toTitleText(type || "notification");
}

// Notification documents use several status field names in the export.
function getStatusLabel(status = "") {
  const value = String(status || "").trim();
  return value || "unknown";
}

// Normalize only for comparisons. The original database value is still kept.
function getStatusKey(status = "") {
  return String(status || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function isPendingStatus(status = "") {
  return getStatusKey(status) === "pending";
}

function getMatchRoleLabel(detail) {
  if (detail?.direction === "incoming") return "Receiver";
  if (detail?.direction === "outgoing") return "Sender";
  return "Not available";
}

function formatAvailabilityItems(items = []) {
  return items.map((entry) => formatAvailabilityLabel(entry)).filter(Boolean);
}

// Use a small icon so cards are easy to scan by category.
function getTypeIcon(type = "") {
  const props = { size: 18, strokeWidth: 2.2 };
  const value = getNormalizedTypeKey(type);

  if (value === "facility_request") {
    return <CalendarDays {...props} />;
  }

  if (value === "repair_report") {
    return <Wrench {...props} />;
  }

  if (isMatchType(value)) {
    return <Users {...props} />;
  }

  return <Bell {...props} />;
}

// Turn notification documents into one shape for the panel UI.
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
    memberId: item.memberId,
    isRead: item.isRead,
    createdAt: item.createdAt,
    sortValue: item.sortValue || item.createdAt,
    raw: item,
  };
}

// Match requests can also appear in the Match tab, but the frontend does not write notifications.
function getMatchNotificationMessage(request) {
  const name = request.counterpartName || (request.direction === "incoming" ? request.from : request.to) || "A member";
  const status = getStatusKey(request.status);

  if (status === "invalidated") {
    const response = String(request.response || "").trim();
    if (/account deleted/i.test(response)) {
      return `This partner request with ${name} is no longer available because an account was deleted.`;
    }
    if (/already (matched|connected)|already.*friend/i.test(response)) {
      return `This partner request with ${name} is no longer available because you are already connected.`;
    }
    if (/matching was closed|closed matching|match.*closed/i.test(response)) {
      return `This partner request with ${name} is no longer available because matching was closed.`;
    }
    return `This partner request with ${name} is no longer available.`;
  }

  if (request.direction === "incoming" && status === "pending") {
    return `${name} sent you a partner request.`;
  }

  if (request.direction === "incoming") {
    if (status === "accepted") return `You accepted ${name}'s partner request.`;
    if (status === "rejected") return `You rejected ${name}'s partner request.`;
    return `You ${getStatusLabel(status || "updated")} ${name}'s partner request.`;
  }

  if (status === "pending") {
    return `Your partner request to ${name} is pending.`;
  }

  if (status === "accepted") return `${name} accepted your partner request.`;
  if (status === "rejected") return `${name} rejected your partner request.`;
  return `${name} ${getStatusLabel(status || "updated")} your partner request.`;
}

// Turn matching collection rows into notification-like cards for match actions.
function normalizeMatchRequestItem(request) {
  const createdSort = getSortValue(request.raw?.created_at);
  const completedSort = getSortValue(request.raw?.completed_at);

  return {
    id: `matching:${request.id}`,
    source: "matching",
    group: "match",
    type: "match_request",
    message: getMatchNotificationMessage(request),
    statusContext: request.status || "pending",
    referenceId: request.id,
    memberId: request.direction === "incoming" ? request.toId : request.fromId,
    isRead: true,
    createdAt: request.completedAt || request.createdAt,
    sortValue: completedSort || createdSort,
    raw: request,
  };
}

// Portal keeps the dialog above the page, even when the page has its own scroll area.
function ModalShell({ title, onClose, children }) {
  const modal = (
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
          </div>
          {children}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") {
    return modal;
  }

  return createPortal(modal, document.body);
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
    <div className="notification-bell__modalDetail">
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

function getInvitedFriendNames(detail) {
  const applicantName = String(detail?.memberName || "").trim().toLowerCase();
  const names = Array.isArray(detail?.participantNames) ? detail.participantNames : [];

  return names
    .map((name) => String(name || "").trim())
    .filter(Boolean)
    .filter((name, index, list) => list.indexOf(name) === index)
    .filter((name) => name.toLowerCase() !== applicantName);
}

function BookingDetailModal({ item, detail, loading, onClose }) {
  const invitedFriendNames = getInvitedFriendNames(detail);

  return (
    <ModalShell
      title="Booking Notification"
      onClose={onClose}
    >
      {loading ? <LoadingState label="Loading booking details..." /> : null}
      {!loading ? (
        <NotificationSummaryCard item={item}>
          {detail ? (
            <>
              <strong>{detail.facilityLabel || detail.facilityName || "Booking update"}</strong>
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
                <p>
                  Applicant: {detail.memberName || "Member"}
                  <br />
                  Invited Friends: {invitedFriendNames.join(" / ") || "No invited friends were included."}
                </p>
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

function RepairDetailModal({ item, detail, loading, onClose }) {
  return (
    <ModalShell
      title="Repair Notification"
      onClose={onClose}
    >
      {loading ? <LoadingState label="Loading repair details..." /> : null}
      {!loading ? (
        <NotificationSummaryCard item={item}>
          {detail ? (
            <>
              <strong>{detail.facilityLabel || "Repair update"}</strong>
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
  canRespond,
  respondMessage,
  onRespondMessageChange,
  onClose,
  onDecision,
}) {
  const counterpartInterests = detail?.counterpartInterestsRaw || detail?.counterpartInterests || [];
  const counterpartAvailability = formatAvailabilityItems(
    detail?.counterpartAvailabilityRaw?.length
      ? detail.counterpartAvailabilityRaw
      : detail?.counterpartAvailability || [],
  );
  const actorName = detail?.counterpartName || "this member";

  return (
    <ModalShell
      title="Review Match Request"
      onClose={onClose}
    >
      {loading ? <LoadingState label="Loading match request..." /> : null}
      {!loading && error ? <ModalAlert title="Match request unavailable" message={error} /> : null}

      {!loading ? (
        <>
          <NotificationSummaryCard item={item}>
            <strong>{detail?.counterpartName || actorName}</strong>
            <div className="notification-bell__applicationBox">
              <span>Application</span>
              <p>{detail?.message || item.message}</p>
            </div>
            <div className="notification-bell__detailGrid">
              <div>
                <span>Your Role</span>
                <strong>{getMatchRoleLabel(detail)}</strong>
              </div>
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

          {canRespond ? (
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
          ) : null}
        </>
      ) : null}

      <div className="notification-bell__modalActions">
        <button className="btn-secondary" type="button" onClick={onClose}>
          {canRespond ? "Cancel" : "Close"}
        </button>
        {canRespond ? (
          <>
            <button className="btn-secondary" type="button" disabled={pending || loading} onClick={() => onDecision("rejected")}>
              Reject
            </button>
            <button className="btn" type="button" disabled={pending || loading} onClick={() => onDecision("accepted")}>
              {pending ? "Updating..." : "Accept"}
            </button>
          </>
        ) : null}
      </div>
    </ModalShell>
  );
}

function MatchInfoModal({ item, detail, loading, onClose }) {
  const counterpartInterests = detail?.counterpartInterestsRaw || detail?.counterpartInterests || [];
  const counterpartAvailability = formatAvailabilityItems(
    detail?.counterpartAvailabilityRaw?.length
      ? detail.counterpartAvailabilityRaw
      : detail?.counterpartAvailability || [],
  );

  return (
    <ModalShell
      title="Match Notification"
      onClose={onClose}
    >
      {loading ? <LoadingState label="Loading match details..." /> : null}
      {!loading ? (
        <NotificationSummaryCard item={item}>
          {detail ? (
            <>
              <strong>{detail.counterpartName || "Match update"}</strong>
            </>
          ) : null}
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
                <span>Your Role</span>
                <strong>{getMatchRoleLabel(detail)}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{getStatusLabel(detail.status || item.statusContext)}</strong>
              </div>
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

function NotificationSummaryModal({ item, onClose }) {
  return (
    <ModalShell
      title="Notification Details"
      onClose={onClose}
    >
      <NotificationSummaryCard item={item}>
        <div className="notification-bell__detailGrid">
          <div>
            <span>Category</span>
            <strong>{getTypeLabel(item.type)}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{item.statusContext ? getStatusLabel(item.statusContext) : "Not available"}</strong>
          </div>
          {item.createdAt ? (
            <div>
              <span>Received At</span>
              <strong>{item.createdAt}</strong>
            </div>
          ) : null}
        </div>
        <div className="notification-bell__applicationBox">
          <span>Message</span>
          <p>{item.message || "No notification message was provided."}</p>
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

function StaffNotificationModal({ item, onClose }) {
  return (
    <ModalShell
      title="Staff Notification"
      onClose={onClose}
    >
      <NotificationSummaryCard item={item}>
        <div className="notification-bell__applicationBox">
          <span>Message</span>
          <p>{item.message || "No additional message was provided."}</p>
        </div>

        {item.createdAt ? (
          <div className="notification-bell__applicationBox">
            <span>Received At</span>
            <p>{item.createdAt}</p>
          </div>
        ) : null}

          {item.referenceId ? (
            <div  className="notification-bell__applicationBox">
              <span>Reference ID</span>
              <p>{item.referenceId}</p>
            </div>
          ) : null}

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

  // Load real data when this part opens or changes.
  useEffect(() => {
    let unsubscribeNotifications = () => {};
    let unsubscribeMatchRequests = () => {};
    let cancelled = false;

    subscribeToNotifications(
      sessionProfile,
      (items) => {
        if (!cancelled) {
          setNotifications(items);
          setPanelError("");
        }
      },
      (error) => {
        if (!cancelled) {
          setNotifications([]);
          setPanelError(getActionErrorMessage(error, "notifications.load"));
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
        (error) => {
          if (!cancelled) {
            setMatchRequests([]);
            setPanelError(getActionErrorMessage(error, "notifications.load"));
          }
        },
      ).then((unsubscribe) => {
        if (cancelled) {
          unsubscribe();
          return;
        }
        unsubscribeMatchRequests = unsubscribe;
      }).catch((error) => {
        if (!cancelled) {
          setMatchRequests([]);
          setPanelError(getActionErrorMessage(error, "notifications.load"));
        }
      });
    } else {
      setMatchRequests([]);
    }

    return () => {
      cancelled = true;
      unsubscribeNotifications();
      unsubscribeMatchRequests();
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

  const matchNotificationItems = useMemo(() => {
    if (isStaffVariant || sessionRole !== "Member") {
      return [];
    }

    return matchRequests
      .filter((request) => request.id)
      .map(normalizeMatchRequestItem);
  }, [isStaffVariant, matchRequests, sessionRole]);

  const allItems = useMemo(
    () => sortByNewest([...notificationItems, ...matchNotificationItems]),
    [matchNotificationItems, notificationItems],
  );

  const unreadCount = useMemo(
    () => allItems.filter((item) => !item.isRead).length,
    [allItems],
  );

  // Build the list that the user can see.
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

  async function markItemRead(item) {
    if (!item || item.isRead) {
      return;
    }

    if (item.source === "notification") {
      await markNotificationRead(item.id);
      setNotifications((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                isRead: true,
                rawDocument: {
                  ...(entry.rawDocument || {}),
                  is_read: true,
                },
              }
            : entry,
        ),
      );
      return;
    }

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

  function openNotificationSummaryDetails(item) {
    setPanelOpen(false);
    setActiveModal({ kind: "notification-summary", item });
    setModalDetail(null);
    setModalError("");
    setModalLoading(false);
    setMatchRespondMessage("");
    setMatchDecisionPending(false);
    void markItemRead(item);
  }

  async function openBookingDetails(item) {
    if (!item.referenceId) {
      openNotificationSummaryDetails(item);
      return;
    }

    openModal("booking", item);
    void markItemRead(item);

    try {
      const detail = await getBookingById(item.referenceId, sessionProfile);
      setModalDetail(detail);
    } catch {
      setModalDetail(null);
    } finally {
      setModalLoading(false);
    }
  }

  async function openRepairDetails(item) {
    if (!item.referenceId) {
      openNotificationSummaryDetails(item);
      return;
    }

    openModal("repair", item);
    void markItemRead(item);

    try {
      const detail = await getRepairTicketById(item.referenceId, sessionProfile);
      setModalDetail(detail);
    } catch {
      setModalDetail(null);
    } finally {
      setModalLoading(false);
    }
  }

  async function openMatchReview(item) {
    if (!item.referenceId) {
      openNotificationSummaryDetails(item);
      return;
    }

    if (!canRespondToMatchItem(item)) {
      await openMatchInfo(item);
      return;
    }

    openModal("match-review", item);
    void markItemRead(item);

    try {
      const detail = await loadMatchDetail(item.referenceId);
      if (!detail) {
        setModalError(getActionErrorMessage({ code: "not-found" }, "match.load"));
        return;
      }

      setModalDetail(detail);
      setMatchRespondMessage(detail.response || "");
    } catch (error) {
      setModalError(getActionErrorMessage(error, "match.load"));
    } finally {
      setModalLoading(false);
    }
  }

  async function openMatchInfo(item) {
    if (!item.referenceId) {
      openNotificationSummaryDetails(item);
      return;
    }

    openModal("match-info", item);
    void markItemRead(item);

    try {
      const detail = await loadMatchDetail(item.referenceId);
      setModalDetail(detail);
    } catch {
      setModalDetail(null);
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

    const detail = modalDetail;

    if (!canRespondToMatchDetail(detail, activeModal.item)) {
      setModalError(getActionErrorMessage({ code: "failed-precondition" }, "match.respond"));
      return;
    }

    setMatchDecisionPending(true);
    setModalError("");

    try {
      await respondToMatchRequest(
        {
          match_id: detail.id,
          status: nextStatus,
          respond_message: matchRespondMessage.trim(),
        },
        sessionProfile,
      );

      const latestRequests = await getMatchRequests(sessionProfile);
      setMatchRequests(latestRequests);
      setPanelMessage(
        nextStatus === "accepted" ? "Partner request accepted." : "Partner request rejected.",
      );
      closeModal();
    } catch (error) {
      setModalError(getActionErrorMessage(error, "match.respond"));
    } finally {
      setMatchDecisionPending(false);
    }
  }

  function getMatchDetailForItem(item) {
    if (item?.source === "matching") {
      return item.raw;
    }

    if (item?.referenceId) {
      return matchRequestIndex.get(item.referenceId) || null;
    }

    return null;
  }

  function canRespondToMatchDetail(detail, item) {
    const currentMemberId = sessionProfile?.id;
    const receiverId = detail?.toId || detail?.raw?.reciever_id || detail?.raw?.receiver_id;

    return Boolean(
      item?.source === "matching" &&
        detail?.id &&
        currentMemberId &&
        receiverId &&
        String(receiverId) === String(currentMemberId) &&
        isPendingStatus(detail.status),
    );
  }

  function canRespondToMatchItem(item) {
    const detail = getMatchDetailForItem(item);
    return canRespondToMatchDetail(detail, item);
  }

  function openMatchCardDetails(item) {
    if (canRespondToMatchItem(item)) {
      void openMatchReview(item);
      return;
    }

    void openMatchInfo(item);
  }

  async function handleMatchDecisionFromItem(item, nextStatus) {
    const detail = getMatchDetailForItem(item);

    if (!canRespondToMatchDetail(detail, item)) {
      setPanelError(getActionErrorMessage({ code: "failed-precondition" }, "match.respond"));
      return;
    }

    setMatchDecisionPending(true);
    setPanelError("");
    setPanelMessage("");

    try {
      await respondToMatchRequest(
        {
          match_id: detail.id,
          status: nextStatus,
          respond_message: "",
        },
        sessionProfile,
      );

      const latestRequests = await getMatchRequests(sessionProfile);
      setMatchRequests(latestRequests);
      await markItemRead(item);
      setPanelMessage(
        nextStatus === "accepted" ? "Partner request accepted." : "Partner request rejected.",
      );
    } catch (error) {
      setPanelError(getActionErrorMessage(error, "match.respond"));
    } finally {
      setMatchDecisionPending(false);
    }
  }

  async function handleMarkAllAsRead() {
    setPanelMessage("");
    try {
      await markAllNotificationsRead(sessionProfile);
      setNotifications((current) =>
        current.map((item) => ({
          ...item,
          isRead: true,
          rawDocument: {
            ...(item.rawDocument || {}),
            is_read: true,
          },
        })),
      );
    } catch (error) {
      setPanelError(getActionErrorMessage(error, "notifications.markRead"));
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
          canRespond={canRespondToMatchDetail(modalDetail, activeModal.item)}
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

    if (activeModal.kind === "notification-summary") {
      return <NotificationSummaryModal item={activeModal.item} onClose={closeModal} />;
    }

    return (
      <MatchInfoModal
        item={activeModal.item}
        detail={modalDetail}
        loading={modalLoading}
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
                    {item.createdAt ? <span>{item.createdAt}</span> : null}
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

                    {!isStaffVariant && item.group === "match" ? (
                      <div className="notification-bell__matchActions">
                        <button
                          className="btn-secondary"
                          type="button"
                          onClick={() => openMatchCardDetails(item)}
                        >
                          {canRespondToMatchItem(item) ? "Review Request" : "View Details"}
                        </button>
                        {canRespondToMatchItem(item) ? (
                          <div className="notification-bell__matchDecisionRow">
                            <button
                              className="btn-secondary"
                              type="button"
                              disabled={matchDecisionPending}
                              onClick={() => handleMatchDecisionFromItem(item, "rejected")}
                            >
                              Reject
                            </button>
                            <button
                              className="btn"
                              type="button"
                              disabled={matchDecisionPending}
                              onClick={() => handleMatchDecisionFromItem(item, "accepted")}
                            >
                              Accept
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {!isStaffVariant && item.group === "all" ? (
                      <button className="btn-secondary" type="button" onClick={() => openNotificationSummaryDetails(item)}>
                        View Details
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
