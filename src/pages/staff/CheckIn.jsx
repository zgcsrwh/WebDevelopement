import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";
import "../pageStyles.css";
import "./CheckIn.css";
import {
  checkInBooking,
  getStaffCheckInPageStatus,
  getStaffCheckIns,
  isBookingCheckInOpen,
  subscribeToStaffCheckIns,
} from "../../services/bookingService";
import { useAuth } from "../../provider/AuthContext";
import { getErrorMessage } from "../../utils/errors";
import { displayStatus, statusTone } from "../../utils/presentation";

const ALL_STATUS_VALUE = "all";
const CHECK_IN_PAGE_STATUSES = new Set(["accepted", "in_progress", "no_show"]);

function toDateInputValue(value = "") {
  if (!value) {
    return "";
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().slice(0, 10);
}

function formatStoredDateTime(value = "") {
  if (!value) {
    return "";
  }

  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateLabel(value = "") {
  if (!value) {
    return "";
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  if (value === todayKey) {
    return "Today";
  }

  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

function sortCheckInItems(items = []) {
  return [...items].sort((left, right) => {
    if (left.date !== right.date) {
      return String(right.date || "").localeCompare(String(left.date || ""));
    }

    if (left.startTime !== right.startTime) {
      return String(right.startTime || "").localeCompare(String(left.startTime || ""));
    }

    return String(right.createdAt || "").localeCompare(String(left.createdAt || ""));
  });
}

function toPageItem(item, now) {
  return {
    ...item,
    pageStatus: getStaffCheckInPageStatus(item.raw || item, now),
  };
}

function getParticipants(item) {
  return [item.memberName, ...(Array.isArray(item.participantNames) ? item.participantNames : [])].filter(
    (participant, index, participants) => Boolean(participant) && participants.indexOf(participant) === index,
  );
}

function getStatusBanner(item, canCheckIn) {
  if (item.pageStatus === "accepted") {
    if (canCheckIn) {
      return {
        tone: "accepted",
        title: "Ready for Check-in",
        body: "The member has arrived within the valid time window.",
      };
    }

    return {
      tone: "accepted",
      title: "Awaiting Check-in Window",
      body: "Check-in opens 15 minutes before the session starts and closes when the session begins.",
    };
  }

  if (item.pageStatus === "in_progress") {
    return {
      tone: "in_progress",
      title: "Session in Progress",
      body: "This session has already been checked in.",
    };
  }

  return {
    tone: "no_show",
    title: "No-show",
    body: "This booking missed the valid check-in window and can no longer be confirmed.",
  };
}

function getHistoryEntries(item, pageStatus) {
  const entries = [];

  if (item.createdAt) {
    entries.push(`Request submitted on ${formatStoredDateTime(item.createdAt)}`);
  }

  if (item.completedAt) {
    entries.push(`Staff last updated this booking on ${formatStoredDateTime(item.completedAt)}`);
  }

  if (pageStatus === "in_progress") {
    entries.push("Arrival has been confirmed and the session is now in progress.");
  }

  if (pageStatus === "no_show") {
    entries.push("The valid check-in window expired before the member was confirmed on arrival.");
  }

  return entries;
}

function getReadonlyMessage(item) {
  if (item.pageStatus === "in_progress") {
    return "This session has already been checked in.";
  }

  if (item.pageStatus === "no_show") {
    return "This booking missed the valid check-in window and can no longer be confirmed.";
  }

  return "This booking cannot be checked in from the current state.";
}

export default function CheckIn() {
  const { sessionProfile } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [draftDate, setDraftDate] = useState("");
  const [draftStatus, setDraftStatus] = useState(ALL_STATUS_VALUE);
  const [appliedFilters, setAppliedFilters] = useState({
    search: "",
    date: "",
    status: ALL_STATUS_VALUE,
  });
  const [pageMessage, setPageMessage] = useState("");
  const [pageError, setPageError] = useState("");
  const [checkingInId, setCheckingInId] = useState("");
  const [clockTick, setClockTick] = useState(Date.now());

  const now = useMemo(() => new Date(clockTick), [clockTick]);
  const staffCreatedDate = useMemo(
    () => toDateInputValue(sessionProfile?.created_at || sessionProfile?.createdAt),
    [sessionProfile?.createdAt, sessionProfile?.created_at],
  );
  const maxFilterDate = useMemo(() => {
    const next = new Date();
    next.setDate(next.getDate() + 7);
    return next.toISOString().slice(0, 10);
  }, []);

  async function refresh(preferredId = "") {
    try {
      const nextItems = sortCheckInItems(await getStaffCheckIns(sessionProfile));
      setItems(nextItems);
      setSelectedId((current) => {
        const candidate = preferredId || current;
        if (candidate && nextItems.some((item) => item.id === candidate)) {
          return candidate;
        }
        return "";
      });
      setPageError("");
    } catch (loadError) {
      setPageError(getErrorMessage(loadError, "Unable to load check-in bookings."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setClockTick(Date.now());
    }, 60 * 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let unsubscribe = null;

    async function loadPage() {
      setLoading(true);
      try {
        const nextItems = sortCheckInItems(await getStaffCheckIns(sessionProfile));
        if (!active) {
          return;
        }

        setItems(nextItems);
        setSelectedId("");
        setPageError("");
      } catch (loadError) {
        if (active) {
          setPageError(getErrorMessage(loadError, "Unable to load check-in bookings."));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }

      try {
        unsubscribe = await subscribeToStaffCheckIns(
          sessionProfile,
          (nextItems) => {
            if (!active) {
              return;
            }
            setItems(sortCheckInItems(nextItems));
            setLoading(false);
          },
          (subscriptionError) => {
            if (!active) {
              return;
            }
            setPageError(getErrorMessage(subscriptionError, "Unable to keep check-in bookings up to date."));
          },
        );
      } catch (subscriptionError) {
        if (active) {
          setPageError(getErrorMessage(subscriptionError, "Unable to keep check-in bookings up to date."));
        }
      }
    }

    if (sessionProfile?.id) {
      loadPage();
    }

    return () => {
      active = false;
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [sessionProfile]);

  const pageItems = useMemo(() => {
    return sortCheckInItems(
      items
        .map((item) => toPageItem(item, now))
        .filter((item) => CHECK_IN_PAGE_STATUSES.has(item.pageStatus)),
    );
  }, [items, now]);

  const visibleItems = useMemo(() => {
    const normalizedSearch = appliedFilters.search.trim().toLowerCase();

    return sortCheckInItems(
      pageItems.filter((item) => {
        const searchMatch = !normalizedSearch || item.memberName.toLowerCase().includes(normalizedSearch);
        const dateMatch = !appliedFilters.date || item.date === appliedFilters.date;
        const statusMatch = appliedFilters.status === ALL_STATUS_VALUE || item.pageStatus === appliedFilters.status;
        return searchMatch && dateMatch && statusMatch;
      }),
    );
  }, [appliedFilters.date, appliedFilters.search, appliedFilters.status, pageItems]);

  useEffect(() => {
    if (!visibleItems.length) {
      setSelectedId("");
      return;
    }

    if (selectedId && !visibleItems.some((item) => item.id === selectedId)) {
      setSelectedId("");
    }
  }, [selectedId, visibleItems]);

  const selectedItem = useMemo(
    () => visibleItems.find((item) => item.id === selectedId) || null,
    [selectedId, visibleItems],
  );
  const canCheckIn = useMemo(
    () => (selectedItem?.pageStatus === "accepted" ? isBookingCheckInOpen(selectedItem.raw, now) : false),
    [now, selectedItem],
  );

  function applyFilters() {
    setAppliedFilters({
      search: draftSearch,
      date: draftDate,
      status: draftStatus,
    });
    setPageError("");
    setPageMessage("");
  }

  function toggleSelection(id) {
    setSelectedId((current) => (current === id ? "" : id));
  }

  async function handleConfirmArrival() {
    if (!selectedItem || selectedItem.pageStatus !== "accepted" || !canCheckIn) {
      return;
    }

    setCheckingInId(selectedItem.id);
    setPageError("");
    setPageMessage("");

    try {
      await checkInBooking({ request_id: selectedItem.id }, sessionProfile);
      setPageMessage(`Request ${selectedItem.id} was updated to in_progress.`);
      await refresh(selectedItem.id);
    } catch (checkInError) {
      setPageError(getErrorMessage(checkInError, "Unable to confirm arrival for this booking."));
    } finally {
      setCheckingInId("");
    }
  }

  return (
    <div className="staff-checkin-page">
      <section className="staff-checkin-page__hero">
        <div>
          <h1>Bookings Archive</h1>
          <p>Track, verify, and manage all booking statuses from here.</p>
        </div>
      </section>

      {pageError ? (
        <section className="staff-checkin-banner staff-checkin-banner--error">
          <strong>Cannot continue</strong>
          <p>{pageError}</p>
        </section>
      ) : null}

      {pageMessage ? (
        <section className="staff-checkin-banner staff-checkin-banner--success">
          <strong>Success</strong>
          <p>{pageMessage}</p>
        </section>
      ) : null}

      <section className="staff-checkin-filters">
        <div className="staff-checkin-filters__grid">
          <div className="staff-checkin-filters__field">
            <label htmlFor="staff-checkin-member">Member Name</label>
            <input
              id="staff-checkin-member"
              type="text"
              value={draftSearch}
              onChange={(event) => setDraftSearch(event.target.value)}
              placeholder="Search member name"
            />
          </div>

          <div className="staff-checkin-filters__field">
            <label htmlFor="staff-checkin-date">Date</label>
            <input
              id="staff-checkin-date"
              type="date"
              min={staffCreatedDate}
              max={maxFilterDate}
              value={draftDate}
              onChange={(event) => setDraftDate(event.target.value)}
            />
          </div>

          <div className="staff-checkin-filters__field">
            <label htmlFor="staff-checkin-status">Status</label>
            <select
              id="staff-checkin-status"
              value={draftStatus}
              onChange={(event) => setDraftStatus(event.target.value)}
            >
              <option value={ALL_STATUS_VALUE}>All Status</option>
              <option value="accepted">accepted</option>
              <option value="in_progress">in_progress</option>
              <option value="no_show">no_show</option>
            </select>
          </div>
        </div>

        <button className="btn staff-checkin-filters__button" type="button" onClick={applyFilters}>
          Filter
        </button>
      </section>

      <section className="staff-checkin-layout">
        <div className="staff-checkin-list">
          {loading ? (
            <div className="staff-checkin-empty">
              <p>Loading check-in bookings...</p>
            </div>
          ) : visibleItems.length > 0 ? (
            visibleItems.map((item) => (
              <article
                key={item.id}
                className={`staff-checkin-card ${selectedItem?.id === item.id ? "is-active" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => toggleSelection(item.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleSelection(item.id);
                  }
                }}
              >
                <div className="staff-checkin-card__header">
                  <div className="staff-checkin-card__titleBlock">
                    <h3>{item.facilityName}</h3>
                    <p className="staff-checkin-card__member">{item.memberName}</p>
                  </div>

                  <div className="staff-checkin-card__meta">
                    <p className="staff-checkin-card__requestId">Request ID: {item.id}</p>
                    <span className={`status-pill ${statusTone(item.pageStatus)}`}>
                      {displayStatus(item.pageStatus)}
                    </span>
                  </div>
                </div>

                <p className="staff-checkin-card__time">
                  <Clock3 size={18} />
                  <span>
                    {formatDateLabel(item.date)}, {item.startTime} - {item.endTime}
                  </span>
                </p>
              </article>
            ))
          ) : (
            <div className="staff-checkin-empty">
              <p>No bookings match the current check-in filters.</p>
            </div>
          )}
        </div>

        <aside className="staff-checkin-detail">
          {selectedItem ? (
            <div className="staff-checkin-detail__card">
              <div className="staff-checkin-detail__head">
                <div>
                  <h2>{selectedItem.facilityName}</h2>
                  <p className="staff-checkin-detail__requestId">Request ID: {selectedItem.id}</p>
                </div>
                <span className={`status-pill ${statusTone(selectedItem.pageStatus)}`}>
                  {displayStatus(selectedItem.pageStatus)}
                </span>
              </div>

              <div className={`staff-checkin-detail__banner is-${selectedItem.pageStatus}`}>
                {selectedItem.pageStatus === "accepted" ? (
                  <CheckCircle2 size={24} />
                ) : selectedItem.pageStatus === "in_progress" ? (
                  <Clock3 size={24} />
                ) : (
                  <AlertTriangle size={24} />
                )}
                <div>
                  <strong>{getStatusBanner(selectedItem, canCheckIn).title}</strong>
                  <p>{getStatusBanner(selectedItem, canCheckIn).body}</p>
                </div>
              </div>

              <div className="staff-checkin-detail__grid">
                <div>
                  <span>Member Name</span>
                  <strong>{selectedItem.memberName}</strong>
                </div>
                <div>
                  <span>Attendees</span>
                  <strong>{selectedItem.attendees} People</strong>
                </div>
                <div>
                  <span>Date</span>
                  <strong>{formatDateLabel(selectedItem.date)}</strong>
                </div>
                <div>
                  <span>Time Slot</span>
                  <strong>
                    {selectedItem.startTime} - {selectedItem.endTime}
                  </strong>
                </div>
              </div>

              <div className="staff-checkin-detail__section">
                <h3>Participants</h3>
                <div className="staff-checkin-detail__tags">
                  {getParticipants(selectedItem).map((participant) => (
                    <span key={participant}>{participant}</span>
                  ))}
                </div>
              </div>

              <div className="staff-checkin-detail__section">
                <h3>Order History</h3>
                <ul className="staff-checkin-detail__history">
                  {getHistoryEntries(selectedItem, selectedItem.pageStatus).map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              </div>

              {selectedItem.pageStatus === "accepted" ? (
                <div className="staff-checkin-detail__actions">
                  <button
                    className="btn staff-checkin-detail__action"
                    type="button"
                    disabled={checkingInId !== "" || !canCheckIn}
                    onClick={handleConfirmArrival}
                  >
                    {checkingInId === selectedItem.id ? "Confirming..." : "Confirm Arrival"}
                  </button>
                  {!canCheckIn ? (
                    <span className="staff-checkin-detail__note">
                      Check-in is available from 15 minutes before the session starts.
                    </span>
                  ) : null}
                </div>
              ) : (
                <div className="staff-checkin-detail__readonly">
                  <Clock3 size={18} />
                  <span>{getReadonlyMessage(selectedItem)}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="staff-checkin-empty">
              <p>Select a booking card to preview the check-in detail panel, or click the same card again to hide it.</p>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
