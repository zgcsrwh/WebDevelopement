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
import { formatStaffDateTime, getDateInputMaxValue, toDateInputValue } from "../../utils/staffPages";
import { FilterField, FilterPanel } from "../../components/common/FilterControls";
import PageLayout from "../../components/common/PageLayout";

const ALL_STATUS_VALUE = "all";
const CHECK_IN_PAGE_STATUSES = new Set(["accepted", "cancelled", "no_show", "completed"]);

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

  if (item.pageStatus === "completed") {
    return {
      tone: "completed",
      title: "Completed",
      body: "This booking has already been completed.",
    };
  }

  if (item.pageStatus === "cancelled") {
    return {
      tone: "cancelled",
      title: "Cancelled",
      body: "This booking was cancelled and can no longer be checked in.",
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
    entries.push(`Request submitted on ${formatStaffDateTime(item.createdAt)}`);
  }

  if (item.completedAt) {
    entries.push(`Staff last updated this booking on ${formatStaffDateTime(item.completedAt)}`);
  }

  if (pageStatus === "completed") {
    entries.push("This booking has already been completed.");
  }

  if (pageStatus === "cancelled") {
    entries.push("This booking was cancelled before check-in.");
  }

  if (pageStatus === "no_show") {
    entries.push("The valid check-in window expired before the member was confirmed on arrival.");
  }

  return entries;
}

function getReadonlyMessage(item) {
  if (item.pageStatus === "completed") {
    return "This booking has already been completed and is read-only.";
  }

  if (item.pageStatus === "cancelled") {
    return "This booking was cancelled and can no longer be checked in.";
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
  const [filters, setFilters] = useState({
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
  const maxFilterDate = useMemo(() => getDateInputMaxValue(0), []);

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
    const normalizedSearch = filters.search.trim().toLowerCase();

    return sortCheckInItems(
      pageItems.filter((item) => {
        const searchMatch = !normalizedSearch || item.memberName.toLowerCase().includes(normalizedSearch);
        const dateMatch = !filters.date || item.date === filters.date;
        const statusMatch = filters.status === ALL_STATUS_VALUE || item.pageStatus === filters.status;
        return searchMatch && dateMatch && statusMatch;
      }),
    );
  }, [filters.date, filters.search, filters.status, pageItems]);

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

  function clearFilters() {
    setFilters({
      search: "",
      date: "",
      status: ALL_STATUS_VALUE,
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
      setPageMessage(`Request ${selectedItem.id} was checked in successfully.`);
      await refresh(selectedItem.id);
    } catch (checkInError) {
      setPageError(getErrorMessage(checkInError, "Unable to confirm arrival for this booking."));
    } finally {
      setCheckingInId("");
    }
  }

  return (
    <PageLayout
      className="staff-checkin-page"
      title="Bookings Archive"
      subtitle="Track, verify, and manage all booking statuses from here."
    >

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

      <FilterPanel
        className="staff-checkin-filters"
        columns={3}
        onClear={clearFilters}
      >
          <FilterField id="staff-checkin-member" label="Member Name">
            <input
              id="staff-checkin-member"
              type="text"
              value={filters.search}
              onChange={(event) => {
                setFilters((previous) => ({ ...previous, search: event.target.value }));
                setPageError("");
                setPageMessage("");
              }}
              placeholder="Search member name"
            />
          </FilterField>

          <FilterField id="staff-checkin-date" label="Date">
            <input
              id="staff-checkin-date"
              type="date"
              min={staffCreatedDate}
              max={maxFilterDate}
              value={filters.date}
              onChange={(event) => {
                setFilters((previous) => ({ ...previous, date: event.target.value }));
                setPageError("");
                setPageMessage("");
              }}
            />
          </FilterField>

          <FilterField id="staff-checkin-status" label="Status">
            <select
              id="staff-checkin-status"
              value={filters.status}
              onChange={(event) => {
                setFilters((previous) => ({ ...previous, status: event.target.value }));
                setPageError("");
                setPageMessage("");
              }}
            >
              <option value={ALL_STATUS_VALUE}>All Status</option>
              <option value="accepted">accepted</option>
              <option value="cancelled">cancelled</option>
              <option value="no_show">no_show</option>
              <option value="completed">completed</option>
            </select>
          </FilterField>
      </FilterPanel>

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
                {["accepted", "completed"].includes(selectedItem.pageStatus) ? (
                  <CheckCircle2 size={24} />
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
    </PageLayout>
  );
}
