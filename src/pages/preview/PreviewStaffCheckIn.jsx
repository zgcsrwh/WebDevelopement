import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";
import "../../pages/pageStyles.css";
import "../member/memberWorkspace.css";
import { previewStaffActor, previewStaffCheckIns } from "../../previews/staffPreviewData";
import "./Preview.css";

const ALL_STATUS_VALUE = "";

function isSameDate(left = "", right = "") {
  return Boolean(left) && Boolean(right) && left === right;
}

function formatPreviewDate(value = "") {
  if (!value) {
    return "Not available";
  }

  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatPreviewDateShort(value = "") {
  if (!value) {
    return "Not available";
  }

  const today = new Date().toISOString().slice(0, 10);
  if (isSameDate(value, today)) {
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

function formatTimeRange(item) {
  return `${formatPreviewDateShort(item.date)}, ${item.startTime} - ${item.endTime}`;
}

function sortPreviewCheckIns(items = []) {
  return [...items];
}

function getStatusBadgeLabel(status = "") {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "accepted") {
    return "BOOKED";
  }
  if (normalized === "in_progress") {
    return "IN PROGRESS";
  }
  if (normalized === "no_show") {
    return "NO SHOW";
  }
  return normalized.toUpperCase();
}

function getStatusBannerIcon(status = "") {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "accepted") {
    return <CheckCircle2 size={24} />;
  }
  if (normalized === "in_progress") {
    return <Clock3 size={24} />;
  }
  return <AlertTriangle size={24} />;
}

function getParticipants(item) {
  const invited = Array.isArray(item.participantNames) ? item.participantNames : [];
  return [item.memberName, ...invited].filter(
    (name, index, names) => Boolean(name) && names.indexOf(name) === index,
  );
}

function getDetailReadonlyMessage(status = "") {
  if (status === "in_progress") {
    return "This session has already been checked in.";
  }
  if (status === "no_show") {
    return "This booking missed the valid check-in window and can no longer be confirmed.";
  }
  return "This booking cannot be checked in from the current state.";
}

export default function PreviewStaffCheckIn() {
  const [items, setItems] = useState(() => sortPreviewCheckIns(previewStaffCheckIns.map((item) => ({ ...item }))));
  const [draftSearch, setDraftSearch] = useState("");
  const [draftDate, setDraftDate] = useState("");
  const [draftStatus, setDraftStatus] = useState(ALL_STATUS_VALUE);
  const [appliedFilters, setAppliedFilters] = useState({
    search: "",
    date: "",
    status: ALL_STATUS_VALUE,
  });
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");

  const maxDate = useMemo(() => {
    const next = new Date();
    next.setDate(next.getDate() + 7);
    return next.toISOString().slice(0, 10);
  }, []);

  const visibleItems = useMemo(() => {
    const normalizedSearch = appliedFilters.search.trim().toLowerCase();

    return sortPreviewCheckIns(
      items.filter((item) => {
        const nameMatch = !normalizedSearch || item.memberName.toLowerCase().includes(normalizedSearch);
        const dateMatch = !appliedFilters.date || item.date === appliedFilters.date;
        const statusMatch = !appliedFilters.status || item.status === appliedFilters.status;
        return nameMatch && dateMatch && statusMatch;
      }),
    );
  }, [appliedFilters.date, appliedFilters.search, appliedFilters.status, items]);

  useEffect(() => {
    if (selectedId && !visibleItems.some((item) => item.id === selectedId)) {
      setSelectedId("");
    }
  }, [selectedId, visibleItems]);

  const selectedItem = useMemo(
    () => visibleItems.find((item) => item.id === selectedId) || null,
    [selectedId, visibleItems],
  );

  function applyFilters() {
    setAppliedFilters({
      search: draftSearch,
      date: draftDate,
      status: draftStatus,
    });
    setMessage("");
  }

  function toggleSelection(id) {
    setSelectedId((current) => (current === id ? "" : id));
  }

  function handleConfirmArrival() {
    if (!selectedItem || selectedItem.status !== "accepted") {
      return;
    }

    const timestamp = new Date().toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });

    setItems((current) =>
      sortPreviewCheckIns(
        current.map((item) =>
          item.id === selectedItem.id
            ? {
                ...item,
                status: "in_progress",
                statusTitle: "Session in Progress",
                statusMessage: "This session has already been checked in.",
                history: [...(item.history || []), `Check-in confirmed at ${timestamp}`],
              }
            : item,
        ),
      ),
    );
    setMessage(`Preview only: ${selectedItem.id} would now be updated to in_progress.`);
  }

  return (
    <div className="preview-staff-page preview-checkin-page">
      <section className="preview-staff-page__hero">
        <div>
          <h1>Bookings Archive</h1>
          <p>Track, verify, and manage all booking statuses from here.</p>
        </div>
      </section>

      {message ? (
        <section className="member-alert member-alert--success">
          <strong>Preview only</strong>
          <p>{message}</p>
        </section>
      ) : null}

      <section className="preview-staff-filters preview-checkin-filters">
        <div className="preview-staff-filters__grid">
          <div className="preview-staff-filters__field">
            <label htmlFor="preview-checkin-member">Member Name</label>
            <input
              id="preview-checkin-member"
              type="text"
              placeholder="Search member name"
              value={draftSearch}
              onChange={(event) => setDraftSearch(event.target.value)}
            />
          </div>

          <div className="preview-staff-filters__field">
            <label htmlFor="preview-checkin-date">Date</label>
            <input
              id="preview-checkin-date"
              type="date"
              min={previewStaffActor.createdAt}
              max={maxDate}
              value={draftDate}
              onChange={(event) => setDraftDate(event.target.value)}
            />
          </div>

          <div className="preview-staff-filters__field">
            <label htmlFor="preview-checkin-status">Status</label>
            <select
              id="preview-checkin-status"
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

        <button className="btn preview-staff-filters__button" type="button" onClick={applyFilters}>
          Filter
        </button>
      </section>

      <section className="preview-staff-layout preview-checkin-layout">
        <div className="preview-staff-list preview-checkin-list">
          {visibleItems.length > 0 ? (
            visibleItems.map((item) => (
              <article
                key={item.id}
                className={`preview-staff-requestCard preview-checkin-card ${selectedItem?.id === item.id ? "is-active" : ""}`}
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
                <div className="preview-checkin-card__header">
                  <div className="preview-checkin-card__titleBlock">
                    <h3>{item.facilityName}</h3>
                    <p className="preview-checkin-card__member">{item.memberName}</p>
                  </div>
                  <div className="preview-checkin-card__headerMeta">
                    <p className="preview-checkin-card__requestId">Request ID: {item.id}</p>
                    <span className={`preview-checkin-card__statusBadge is-${item.status}`}>
                      {getStatusBadgeLabel(item.status)}
                    </span>
                  </div>
                </div>

                <p className="preview-checkin-card__time">
                  <Clock3 size={18} />
                  <span>{formatTimeRange(item)}</span>
                </p>
              </article>
            ))
          ) : (
            <div className="preview-staff-empty preview-checkin-empty">
              <p>No check-in records match the current filters.</p>
            </div>
          )}
        </div>

        <aside className="preview-staff-detail preview-checkin-detail">
          {selectedItem ? (
            <div className="preview-staff-detail__card preview-checkin-detail__card">
              <div className="preview-checkin-detail__head">
                <div>
                  <h2>{selectedItem.facilityName}</h2>
                  <p className="preview-checkin-detail__requestId">Request ID: {selectedItem.id}</p>
                </div>
                <span className={`preview-checkin-card__statusBadge is-${selectedItem.status}`}>
                  {getStatusBadgeLabel(selectedItem.status)}
                </span>
              </div>

              <div className={`preview-checkin-detail__banner is-${selectedItem.status}`}>
                {getStatusBannerIcon(selectedItem.status)}
                <div>
                  <strong>{selectedItem.statusTitle}</strong>
                  <p>{selectedItem.statusMessage}</p>
                </div>
              </div>

              <div className="preview-checkin-detail__grid">
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
                  <strong>{formatPreviewDateShort(selectedItem.date)}</strong>
                </div>
                <div>
                  <span>Time Slot</span>
                  <strong>
                    {selectedItem.startTime} - {selectedItem.endTime}
                  </strong>
                </div>
              </div>

              <div className="preview-checkin-detail__section">
                <h3>Participants</h3>
                <div className="preview-staff-detail__tags">
                  {getParticipants(selectedItem).map((participant) => (
                    <span key={participant}>{participant}</span>
                  ))}
                </div>
              </div>

              <div className="preview-checkin-detail__section">
                <h3>Order History</h3>
                <ul className="preview-checkin-detail__history">
                  {(selectedItem.history || []).map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              </div>

              {selectedItem.status === "accepted" ? (
                <button className="btn preview-checkin-detail__action" type="button" onClick={handleConfirmArrival}>
                  Confirm Arrival
                </button>
              ) : (
                <div className="preview-checkin-detail__readonly">
                  <Clock3 size={18} />
                  <span>{getDetailReadonlyMessage(selectedItem.status)}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="preview-staff-empty preview-checkin-empty">
              <p>Select a booking card to preview the employee check-in detail panel.</p>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
