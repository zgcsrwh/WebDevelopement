import { useEffect, useState } from "react";
import "../pageStyles.css";
import { getRepairTickets, updateTicketStatus } from "../../services/reportService";
import { useAuth } from "../../provider/AuthContext";
import { getErrorMessage } from "../../utils/errors";
import { displayStatus, statusTone, toTitleText } from "../../utils/presentation";

export default function Repair() {
  const { sessionProfile } = useAuth();
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    status: "All",
    search: "",
  });

  const refresh = async () => {
    try {
      setItems(await getRepairTickets(sessionProfile));
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Unable to load repair tickets."));
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function loadRepairs() {
      try {
        const nextItems = await getRepairTickets(sessionProfile);
        if (!cancelled) {
          setItems(nextItems);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(getErrorMessage(loadError, "Unable to load repair tickets."));
        }
      }
    }

    loadRepairs();
    return () => {
      cancelled = true;
    };
  }, [sessionProfile]);

  const filteredItems = items.filter((item) => {
    const statusMatch = filters.status === "All" || item.status === filters.status;
    const searchMatch =
      !filters.search ||
      item.facility.toLowerCase().includes(filters.search.toLowerCase()) ||
      item.description.toLowerCase().includes(filters.search.toLowerCase()) ||
      item.memberName.toLowerCase().includes(filters.search.toLowerCase());
    return statusMatch && searchMatch;
  });

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <h1>Repair management</h1>
          <p>Review repair tickets assigned to your facilities and mark them as resolved once work is complete.</p>
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
            <label>Status</label>
            <select
              value={filters.status}
              onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
            >
              <option value="All">All</option>
              <option value="pending">Pending</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
          <div>
            <label>Search</label>
            <input
              value={filters.search}
              onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
              placeholder="Search facility, member, or ticket text"
            />
          </div>
        </div>
      </section>

      <section className="page-panel">
        <h2>Repair tickets</h2>
        <div className="card-list" style={{ marginTop: 18 }}>
          {filteredItems.map((item) => {
            const lockedStatus = item.status === "resolved";

            return (
              <article key={item.id} className="report-item">
                <div className="item-row">
                  <div>
                    <h3>{item.facilityLabel}</h3>
                    <p className="meta-row">{item.createdAt}</p>
                    <p className="soft-text" style={{ marginTop: 8 }}>Reported by: {item.memberName}</p>
                    <p className="soft-text" style={{ marginTop: 8 }}>
                      Type: {item.type.map((part) => toTitleText(part)).join(", ")}
                    </p>
                    <p className="soft-text" style={{ marginTop: 8 }}>
                      {item.description}
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span className={`status-pill ${statusTone(item.status)}`}>
                      {item.statusLabel || displayStatus(item.status)}
                    </span>
                    <div className="panel-actions" style={{ marginTop: 14 }}>
                      {!lockedStatus && (
                        <button
                          className="btn"
                          type="button"
                          onClick={async () => {
                            try {
                              await updateTicketStatus({ repairt_id: item.id, status: ["resolved"] }, sessionProfile);
                              setMessage(`Repair ticket ${item.id} marked as resolved.`);
                              await refresh();
                            } catch (updateError) {
                              setError(getErrorMessage(updateError, "Unable to update this repair ticket."));
                            }
                          }}
                        >
                          Mark resolved
                        </button>
                      )}
                    </div>
                    {lockedStatus && (
                      <p className="soft-text" style={{ marginTop: 12, maxWidth: 220 }}>
                        This record is locked because it has already been resolved.
                      </p>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {filteredItems.length === 0 && !error && (
        <section className="page-panel">
          <p>No repair tickets match the current filters.</p>
        </section>
      )}
    </div>
  );
}
