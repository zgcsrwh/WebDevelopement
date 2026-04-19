import { useEffect, useState } from "react";
import "../pageStyles.css";
import { approveBooking, getStaffRequests } from "../../services/bookingService";
import { useAuth } from "../../provider/AuthContext";
import { getErrorMessage } from "../../utils/errors";
import { displayStatus, statusTone } from "../../utils/presentation";

export default function Requests() {
  const { sessionProfile } = useAuth();
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    search: "",
    date: "",
  });

  const refresh = async () => {
    try {
      setItems(await getStaffRequests(sessionProfile));
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Unable to load the approval queue."));
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function loadRequests() {
      try {
        const nextItems = await getStaffRequests(sessionProfile);
        if (!cancelled) {
          setItems(nextItems);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(getErrorMessage(loadError, "Unable to load the approval queue."));
        }
      }
    }

    loadRequests();
    return () => {
      cancelled = true;
    };
  }, [sessionProfile]);

  const filteredItems = items.filter((item) => {
    const searchMatch =
      !filters.search ||
      item.facilityLabel.toLowerCase().includes(filters.search.toLowerCase()) ||
      item.activityDescription.toLowerCase().includes(filters.search.toLowerCase()) ||
      item.memberName.toLowerCase().includes(filters.search.toLowerCase());
    const dateMatch = !filters.date || item.date === filters.date;
    return searchMatch && dateMatch;
  });

  async function handleDecision(item, nextStatus) {
    setError("");
    setMessage("");

    try {
      let responseText = "";
      if (["rejected", "suggested"].includes(nextStatus)) {
        responseText = window.prompt(
          nextStatus === "rejected" ? "Enter the rejection reason:" : "Enter the suggested change for the member:",
          nextStatus === "rejected" ? "Rejected due to suitability or availability." : "Please consider a nearby alternative slot.",
        ) || "";

        if (!responseText.trim()) {
          return;
        }
      }

      await approveBooking(item.id, nextStatus, responseText, sessionProfile);
      await refresh();
      setMessage(`Request ${item.id} was updated to ${displayStatus(nextStatus)}.`);
    } catch (decisionError) {
      setError(getErrorMessage(decisionError, "Unable to process this booking request."));
    }
  }

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <h1>Booking approval queue</h1>
          <p>Review pending requests for the facilities assigned to you and update their status with approval, rejection, or suggested changes.</p>
        </div>
      </section>

      {error && (
        <section className="page-panel">
          <p className="errorMessage">{error}</p>
        </section>
      )}
      {message && (
        <section className="page-panel">
          <p className="successMessage">{message}</p>
        </section>
      )}

      <section className="page-panel">
        <h2>Filters</h2>
        <div className="filter-grid" style={{ marginTop: 16 }}>
          <div>
            <label>Search</label>
            <input
              value={filters.search}
              onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
              placeholder="Search member, facility, or activity"
            />
          </div>
          <div>
            <label>Date</label>
            <input
              type="date"
              value={filters.date}
              onChange={(event) => setFilters((prev) => ({ ...prev, date: event.target.value }))}
            />
          </div>
        </div>
      </section>

      <section className="page-panel">
        <h2>Pending requests</h2>
        <div className="card-list" style={{ marginTop: 18 }}>
          {filteredItems.map((item) => (
            <article key={item.id} className="request-item">
              <div className="item-row">
                <div>
                  <h3>{item.facilityLabel}</h3>
                  <p className="meta-row">{item.memberName} | {item.date} | {item.time}</p>
                  <p className="soft-text" style={{ marginTop: 8 }}>Attendees: {item.attendees}</p>
                  <p className="soft-text" style={{ marginTop: 8 }}>{item.activityDescription}</p>
                  {item.participantNames.length ? (
                    <p className="soft-text" style={{ marginTop: 8 }}>Participants: {item.participantNames.join(", ")}</p>
                  ) : null}
                </div>
                <span className={`status-pill ${statusTone(item.status)}`}>{item.statusLabel || displayStatus(item.status)}</span>
              </div>
              <div className="panel-actions" style={{ marginTop: 16 }}>
                <button className="btn" onClick={() => handleDecision(item, "accepted")}>
                  Approve
                </button>
                <button className="btn-secondary" onClick={() => handleDecision(item, "suggested")}>
                  Suggest change
                </button>
                <button className="btn-danger" onClick={() => handleDecision(item, "rejected")}>
                  Reject
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {filteredItems.length === 0 && !error && (
        <section className="page-panel">
          <p>No approval requests match the current filters.</p>
        </section>
      )}
    </div>
  );
}
