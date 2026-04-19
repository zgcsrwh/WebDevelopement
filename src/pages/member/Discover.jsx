import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "../pageStyles.css";
import { useAuth } from "../../provider/AuthContext";
import { getPartnerProfiles, sendMatchRequest } from "../../services/partnerService";
import { getErrorMessage } from "../../utils/errors";

export default function Discover() {
  const { sessionProfile } = useAuth();
  const [items, setItems] = useState([]);
  const [matchingReady, setMatchingReady] = useState(true);
  const [filters, setFilters] = useState({
    sport: "All",
    search: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getPartnerProfiles(sessionProfile)
      .then((nextItems) => {
        setMatchingReady(true);
        setItems(nextItems);
      })
      .catch((loadError) => {
        const nextMessage = getErrorMessage(loadError, "Unable to load the partner list.");
        setItems([]);
        setMatchingReady(!nextMessage.includes("enable matching first"));
        setError(nextMessage);
      });
  }, [sessionProfile]);

  const sports = ["All", ...new Set(items.map((item) => item.sport))];
  const filteredItems = items.filter((item) => {
    const sportMatch = filters.sport === "All" || item.sport === filters.sport;
    const searchMatch =
      !filters.search ||
      item.nickname.toLowerCase().includes(filters.search.toLowerCase()) ||
      item.bio.toLowerCase().includes(filters.search.toLowerCase());
    return sportMatch && searchMatch;
  });

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <h1>Discover partners</h1>
          <p>Browse members who currently have matching enabled and send a request directly from their public profile.</p>
        </div>
      </section>

      <section className="page-panel">
        <h2>Filters</h2>
        <div className="filter-grid" style={{ marginTop: 16 }}>
          <div>
            <label>Sport</label>
            <select
              value={filters.sport}
              onChange={(event) => setFilters((prev) => ({ ...prev, sport: event.target.value }))}
            >
              {sports.map((sport) => (
                <option key={sport} value={sport}>
                  {sport}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label>Search</label>
            <input
              value={filters.search}
              onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
              placeholder="Search by nickname or profile text"
            />
          </div>
        </div>
      </section>

      {error && (
        <section className="page-panel">
          <p className="errorMessage">{error}</p>
          {!matchingReady && (
            <div className="panel-actions" style={{ marginTop: 16 }}>
              <Link className="btn" to="/partner">Go to partner profile</Link>
            </div>
          )}
        </section>
      )}

      <section className="cards-grid">
        {filteredItems.map((item) => (
          <article key={item.id} className="detail-card">
            <div className="item-row">
              <div>
                <h2>{item.nickname}</h2>
                <p>{item.sport} | {item.level}</p>
              </div>
              <span className="status-pill status-active">Open</span>
            </div>
            <p style={{ marginTop: 16 }}>{item.bio}</p>
            <div className="tags-row" style={{ marginTop: 16 }}>
              {item.availability ? <span className="tag">{item.availability}</span> : null}
            </div>
            <div className="panel-actions" style={{ marginTop: 18 }}>
              <Link className="btn-secondary" to={`/partner/${item.id}`}>View details</Link>
              <button
                className="btn"
                onClick={async () => {
                  setError("");
                  setMessage("");
                  try {
                    await sendMatchRequest(
                      {
                        reciever_id: item.memberId || item.id,
                        apply_description: `Hi ${item.nickname}, would you like to arrange a shared training session?`,
                      },
                      sessionProfile,
                    );
                    setMessage(`Request sent to ${item.nickname}.`);
                  } catch (requestError) {
                    setError(getErrorMessage(requestError, "Unable to send the partner request."));
                  }
                }}
              >
                Send request
              </button>
            </div>
          </article>
        ))}
      </section>

      {message && <section className="page-panel"><p className="successMessage">{message}</p></section>}

      {filteredItems.length === 0 && !error && (
        <section className="page-panel">
          <p>No partner profiles match your current filters.</p>
        </section>
      )}
    </div>
  );
}
