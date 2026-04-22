import { useEffect, useMemo, useState } from "react";
import "../pageStyles.css";
import "../workspaceStyles.css";
import { getRepairTickets, updateTicketStatus } from "../../services/reportService";
import { useAuth } from "../../provider/AuthContext";
import { getErrorMessage } from "../../utils/errors";
import { displayStatus, statusTone, toTitleText } from "../../utils/presentation";

export default function Repair() {
  const { sessionProfile } = useAuth();
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState("");
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

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const statusMatch = filters.status === "All" || item.status === filters.status;
      const searchMatch =
        !filters.search ||
        item.facility.toLowerCase().includes(filters.search.toLowerCase()) ||
        item.description.toLowerCase().includes(filters.search.toLowerCase()) ||
        item.memberName.toLowerCase().includes(filters.search.toLowerCase());
      return statusMatch && searchMatch;
    });
  }, [filters, items]);

  return (
    <div className="workspace-page">
      <section className="workspace-header">
        <div>
          <h1>Repair management</h1>
          <p>Track real repair records, resolve pending tickets, and surface suspended or terminated cases that staff can no longer change.</p>
        </div>
      </section>

      {error && (
        <section className="workspace-surface">
          <p className="errorMessage">{error}</p>
        </section>
      )}
      {message && (
        <section className="workspace-surface">
          <p className="successMessage">{message}</p>
        </section>
      )}

      <section className="workspace-surface">
        <div className="filter-grid">
          <div>
            <label>Status</label>
            <select
              value={filters.status}
              onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
            >
              <option value="All">All</option>
              <option value="pending">Pending</option>
              <option value="suspended">Suspended</option>
              <option value="terminated">Terminated</option>
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

      <section className="workspace-surface">
        <h2>Repair tickets</h2>
        <div className="workspace-table-wrap" style={{ marginTop: 18 }}>
          <table className="workspace-table">
            <thead>
              <tr>
                <th>Facility</th>
                <th>Reported by</th>
                <th>Type</th>
                <th>Status</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const lockedStatus = ["resolved", "suspended", "terminated"].includes(item.status);

                return (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.facilityLabel}</strong>
                      <div className="workspace-note" style={{ marginTop: 8 }}>
                        {item.description}
                      </div>
                    </td>
                    <td>{item.memberName}</td>
                    <td>{item.type.map((part) => toTitleText(part)).join(", ")}</td>
                    <td>
                      <span className={`status-pill ${statusTone(item.status)}`}>
                        {item.statusLabel || displayStatus(item.status)}
                      </span>
                    </td>
                    <td>{item.createdAt}</td>
                    <td>
                      {!lockedStatus ? (
                        <button
                          className="btn"
                          type="button"
                          disabled={updatingId !== ""}
                          onClick={async () => {
                            setUpdatingId(item.id);
                            try {
                              await updateTicketStatus({ repairt_id: item.id, status: ["resolved"] }, sessionProfile);
                              setMessage(`Repair ticket ${item.id} marked as resolved.`);
                              await refresh();
                            } catch (updateError) {
                              setError(getErrorMessage(updateError, "Unable to update this repair ticket."));
                            } finally {
                              setUpdatingId("");
                            }
                          }}
                        >
                          {updatingId === item.id ? "Updating..." : "Mark resolved"}
                        </button>
                      ) : (
                        <div className="workspace-note">
                          {item.status === "resolved"
                            ? "Locked after resolution."
                            : item.status === "suspended"
                              ? "Suspended while the facility is off shelf."
                              : "Terminated because the facility was removed."}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredItems.length === 0 && !error && (
          <p style={{ marginTop: 16 }}>No repair tickets match the current filters.</p>
        )}
      </section>
    </div>
  );
}
