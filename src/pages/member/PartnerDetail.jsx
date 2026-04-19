import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "../pageStyles.css";
import { useAuth } from "../../provider/AuthContext";
import {
  getMatchRequests,
  getPartnerProfiles,
  respondToMatchRequest,
  sendMatchRequest,
} from "../../services/partnerService";
import { getErrorMessage } from "../../utils/errors";
import { displayStatus, statusTone } from "../../utils/presentation";

export default function PartnerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { sessionProfile } = useAuth();
  const [profile, setProfile] = useState(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [requests, setRequests] = useState([]);
  const isRequestsPage = !id;

  useEffect(() => {
    if (isRequestsPage) {
      getMatchRequests(sessionProfile)
        .then(setRequests)
        .catch((loadError) => setError(getErrorMessage(loadError, "Unable to load match requests.")));
      return;
    }

    getPartnerProfiles(sessionProfile)
      .then((items) => {
        setProfile(items.find((item) => item.id === id) || null);
        setProfileLoaded(true);
      })
      .catch((loadError) => {
        setError(getErrorMessage(loadError, "Unable to load this profile."));
        setProfileLoaded(true);
      });
  }, [id, isRequestsPage, sessionProfile]);

  const incomingRequests = useMemo(
    () => requests.filter((request) => request.direction === "incoming"),
    [requests],
  );
  const outgoingRequests = useMemo(
    () => requests.filter((request) => request.direction === "outgoing"),
    [requests],
  );

  if (isRequestsPage) {
    return (
      <div className="page-stack">
        <section className="page-hero">
          <div>
            <h1>Partner requests</h1>
            <p>Review incoming requests, track sent requests, and update matching relationships through the real request collection.</p>
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

        <section className="split-layout">
          <article className="page-panel">
            <h2>Received requests</h2>
            <div className="card-list" style={{ marginTop: 18 }}>
              {incomingRequests.map((request) => (
                <article key={request.id} className="request-item">
                  <div className="item-row">
                    <div>
                      <h3>{request.from}</h3>
                      <p className="meta-row">{request.createdAt}</p>
                      <p className="soft-text" style={{ marginTop: 8 }}>{request.message}</p>
                      {request.response && (
                        <p className="soft-text" style={{ marginTop: 8 }}>Response: {request.response}</p>
                      )}
                    </div>
                    <span className={`status-pill ${statusTone(request.status)}`}>
                      {request.statusLabel || displayStatus(request.status)}
                    </span>
                  </div>
                  {request.status === "pending" && (
                    <div className="panel-actions" style={{ marginTop: 16 }}>
                      <button
                        className="btn"
                        onClick={async () => {
                          try {
                            await respondToMatchRequest(
                              {
                                match_id: request.id,
                                status: ["accepted"],
                                respond_message: "Happy to join.",
                              },
                              sessionProfile,
                            );
                            setRequests(await getMatchRequests(sessionProfile));
                            setMessage(`Request from ${request.from} accepted.`);
                          } catch (actionError) {
                            setError(getErrorMessage(actionError, "Unable to accept this request."));
                          }
                        }}
                      >
                        Accept
                      </button>
                      <button
                        className="btn-danger"
                        onClick={async () => {
                          try {
                            await respondToMatchRequest(
                              {
                                match_id: request.id,
                                status: ["rejected"],
                                respond_message: "Not available right now.",
                              },
                              sessionProfile,
                            );
                            setRequests(await getMatchRequests(sessionProfile));
                            setMessage(`Request from ${request.from} rejected.`);
                          } catch (actionError) {
                            setError(getErrorMessage(actionError, "Unable to reject this request."));
                          }
                        }}
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </article>
              ))}
              {incomingRequests.length === 0 && <p className="soft-text">No incoming requests found.</p>}
            </div>
          </article>

          <article className="page-panel">
            <h2>Sent requests</h2>
            <div className="card-list" style={{ marginTop: 18 }}>
              {outgoingRequests.map((request) => (
                <article key={request.id} className="request-item">
                  <div className="item-row">
                    <div>
                      <h3>{request.to}</h3>
                      <p className="meta-row">{request.createdAt}</p>
                      <p className="soft-text" style={{ marginTop: 8 }}>{request.message}</p>
                      {request.response && (
                        <p className="soft-text" style={{ marginTop: 8 }}>Response: {request.response}</p>
                      )}
                    </div>
                    <span className={`status-pill ${statusTone(request.status)}`}>
                      {request.statusLabel || displayStatus(request.status)}
                    </span>
                  </div>
                </article>
              ))}
              {outgoingRequests.length === 0 && <p className="soft-text">No sent requests found.</p>}
            </div>
          </article>
        </section>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="page-stack">
        <section className="page-panel">
          <p className="errorMessage">{error}</p>
          {error.includes("enable matching first") && (
            <div className="panel-actions" style={{ marginTop: 16 }}>
              <button className="btn" type="button" onClick={() => navigate("/partner")}>
                Go to partner profile
              </button>
            </div>
          )}
        </section>
      </div>
    );
  }

  if (!profileLoaded) {
    return <div className="app-loading">Loading profile...</div>;
  }

  if (!profile) {
    return (
      <div className="page-stack">
        <section className="page-panel">
          <p>No active partner profile was found for this request.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <h1>{profile.nickname}</h1>
          <p>{profile.interests.join(", ")} | {profile.level}</p>
        </div>
        <div className="hero-actions">
          <button
            className="btn"
            onClick={async () => {
              setError("");
              setMessage("");
              try {
                await sendMatchRequest(
                  {
                    reciever_id: profile.memberId || profile.id,
                    apply_description: `Hi ${profile.nickname}, would you like to arrange a shared training session?`,
                  },
                  sessionProfile,
                );
                setMessage("Match request sent.");
              } catch (requestError) {
                setError(getErrorMessage(requestError, "Unable to send this request."));
              }
            }}
          >
            Send match request
          </button>
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

      <section className="split-layout">
        <article className="detail-card">
          <h2>About</h2>
          <p>{profile.bio}</p>
        </article>

        <article className="detail-card">
          <h2>Availability</h2>
          <div className="tags-row" style={{ marginTop: 16 }}>
            {profile.availableTimeRaw?.map((slot) => (
              <span key={slot} className="tag">{slot.replaceAll("_", " ")}</span>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
