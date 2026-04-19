import { useEffect, useState } from "react";
import "../pageStyles.css";
import { checkInBooking, getStaffCheckIns } from "../../services/bookingService";
import { useAuth } from "../../provider/AuthContext";
import { getErrorMessage } from "../../utils/errors";
import { displayStatus, statusTone } from "../../utils/presentation";

export default function CheckIn() {
  const { sessionProfile } = useAuth();
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    status: "all",
    search: "",
  });

  const refresh = async () => {
    try {
      setItems(await getStaffCheckIns(sessionProfile));
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Unable to load check-in bookings."));
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function loadCheckIns() {
      try {
        const nextItems = await getStaffCheckIns(sessionProfile);
        if (!cancelled) {
          setItems(nextItems);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(getErrorMessage(loadError, "Unable to load check-in bookings."));
        }
      }
    }

    loadCheckIns();
    return () => {
      cancelled = true;
    };
  }, [sessionProfile]);

  const filteredItems = items.filter((item) => {
    const statusMatch = filters.status === "all" || item.status === filters.status;
    const searchMatch =
      !filters.search ||
      item.memberName.toLowerCase().includes(filters.search.toLowerCase()) ||
      item.facilityLabel.toLowerCase().includes(filters.search.toLowerCase());
    return statusMatch && searchMatch;
  });

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <h1>Session check-in</h1>
          <p>Confirm arrivals for approved bookings assigned to your facilities and move them into the in-progress state.</p>
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

      <section className="table-card">
        <h2>Filters</h2>
        <div className="filter-grid" style={{ marginTop: 16, marginBottom: 22 }}>
          <div>
            <label>Status</label>
            <select
              value={filters.status}
              onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
            >
              <option value="all">All</option>
              <option value="accepted">Accepted</option>
              <option value="in_progress">In Progress</option>
            </select>
          </div>
          <div>
            <label>Search</label>
            <input
              value={filters.search}
              onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
              placeholder="Search member or facility"
            />
          </div>
        </div>

        <h2>Bookings</h2>
        <table style={{ marginTop: 18 }}>
          <thead>
            <tr>
              <th>Member</th>
              <th>Facility</th>
              <th>Date</th>
              <th>Time</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => (
              <tr key={item.id}>
                <td>{item.memberName}</td>
                <td>{item.facilityLabel}</td>
                <td>{item.date}</td>
                <td>{item.time}</td>
                <td>
                  <span className={`status-pill ${statusTone(item.status)}`}>
                    {item.statusLabel || displayStatus(item.status)}
                  </span>
                </td>
                <td>
                  <button
                    className="btn-secondary"
                    onClick={async () => {
                      if (item.status !== "accepted") {
                        return;
                      }

                      try {
                        await checkInBooking(item.id, sessionProfile);
                        setMessage(`Arrival confirmed for ${item.id}.`);
                        await refresh();
                      } catch (checkInError) {
                        setError(getErrorMessage(checkInError, "Unable to confirm arrival."));
                      }
                    }}
                  >
                    {item.status === "accepted" ? "Confirm arrival" : "Checked in"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {filteredItems.length === 0 && !error && (
        <section className="page-panel">
          <p>No bookings match the current check-in filters.</p>
        </section>
      )}
    </div>
  );
}
