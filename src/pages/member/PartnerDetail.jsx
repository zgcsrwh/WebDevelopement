import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import "../pageStyles.css";
import "./memberWorkspace.css";
import "./PartnerDetail.css";
import { useAuth } from "../../provider/AuthContext";
import {
  getMatchRequests,
  getPartnerProfiles,
  respondToMatchRequest,
  sendMatchRequest,
} from "../../services/partnerService";
import { ROUTE_PATHS } from "../../constants/routes";
import { getAvatarForActor } from "../../utils/avatar";
import { getErrorMessage } from "../../utils/errors";
import { displayStatus, statusTone, toTitleText } from "../../utils/presentation";
import { countMeaningfulCharacters, hasMeaningfulText } from "../../utils/text";
import MatchRequestModal from "../../components/member/MatchRequestModal";

function formatAvailabilityEntry(value = "") {
  return String(value)
    .split("_")
    .filter(Boolean)
    .map((part) => toTitleText(part))
    .join(" - ");
}

export default function PartnerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { sessionProfile } = useAuth();
  const [profile, setProfile] = useState(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [requests, setRequests] = useState([]);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestDraft, setRequestDraft] = useState("");
  const [requestError, setRequestError] = useState("");
  const [requestPending, setRequestPending] = useState(false);
  const isRequestsPage = !id;

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (isRequestsPage) {
        try {
          const nextRequests = await getMatchRequests(sessionProfile);
          if (!cancelled) {
            setRequests(nextRequests);
            setError("");
          }
        } catch (loadError) {
          if (!cancelled) {
            setError(getErrorMessage(loadError, "Unable to load match requests."));
          }
        } finally {
          if (!cancelled) {
            setProfileLoaded(true);
          }
        }
        return;
      }

      try {
        const items = await getPartnerProfiles(sessionProfile);
        if (!cancelled) {
          setProfile(items.find((item) => item.id === id) || null);
          setError("");
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(getErrorMessage(loadError, "Unable to load this profile."));
        }
      } finally {
        if (!cancelled) {
          setProfileLoaded(true);
        }
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [id, isRequestsPage, sessionProfile]);

  const incomingRequests = useMemo(
    () => requests.filter((request) => request.direction === "incoming"),
    [requests],
  );
  const outgoingRequests = useMemo(
    () => requests.filter((request) => request.direction === "outgoing"),
    [requests],
  );

  const pendingSummary = useMemo(
    () => ({
      incomingPending: incomingRequests.filter((request) => request.status === "pending").length,
      outgoingPending: outgoingRequests.filter((request) => request.status === "pending").length,
    }),
    [incomingRequests, outgoingRequests],
  );

  async function refreshRequests() {
    setRequests(await getMatchRequests(sessionProfile));
  }

  function closeRequestModal() {
    setRequestModalOpen(false);
    setRequestDraft("");
    setRequestError("");
    setRequestPending(false);
  }

  async function handleConfirmSend() {
    if (!profile) {
      return;
    }

    const count = countMeaningfulCharacters(requestDraft);
    if (!hasMeaningfulText(requestDraft)) {
      setRequestError("Please enter an application description.");
      return;
    }
    if (count > 200) {
      setRequestError("Application description must be 200 characters or fewer.");
      return;
    }

    setRequestPending(true);
    setRequestError("");

    try {
      await sendMatchRequest({
        reciever_id: profile.memberId || profile.id,
        apply_description: requestDraft.trim(),
      });
      setMessage("Match request sent.");
      closeRequestModal();
    } catch (sendError) {
      setRequestPending(false);
      setRequestError(getErrorMessage(sendError, "Unable to send this request."));
    }
  }

  if (!profileLoaded) {
    return (
      <div className="member-workspace">
        <div className="member-empty">
          <p>Loading matching data...</p>
        </div>
      </div>
    );
  }

  if (isRequestsPage) {
    return (
      <div className="member-workspace">
        <section className="member-hero">
          <div className="member-hero__top">
            <div>
              <p className="member-hero__eyebrow">Requests</p>
              <h1>Partner request inbox</h1>
              <p>
                Handle incoming requests, review sent requests, and keep the actions aligned with
                the matching API.
              </p>
            </div>
              <div className="member-hero__actions">
                <Link className="member-back-link" to={ROUTE_PATHS.PARTNER}>
                  ← Back to partner profile
                </Link>
              <Link className="btn-secondary" to={ROUTE_PATHS.PARTNER_DISCOVER}>
                Browse discover page
              </Link>
            </div>
          </div>
          <div className="member-chip-row">
            <span className="member-chip">{pendingSummary.incomingPending} incoming pending</span>
            <span className="member-chip member-chip--soft">
              {pendingSummary.outgoingPending} outgoing pending
            </span>
          </div>
        </section>

        {error ? (
          <section className="member-alert member-alert--error">
            <strong>Unable to load requests</strong>
            <p>{error}</p>
          </section>
        ) : null}
        {message ? (
          <section className="member-alert member-alert--success">
            <strong>Request updated</strong>
            <p>{message}</p>
          </section>
        ) : null}

        <section className="member-request-columns">
          <article className="member-card">
            <div className="member-card__head">
              <div>
                <p className="member-card__eyebrow">Incoming</p>
                <h2>Received requests</h2>
              </div>
            </div>

            {incomingRequests.length > 0 ? (
              <div className="member-record-list">
                {incomingRequests.map((request) => (
                  <article key={request.id} className="member-record member-request-card">
                    <div className="member-record__top">
                      <div className="member-request-card__person">
                        <img
                          className="member-avatar-small"
                          src={getAvatarForActor({ id: request.fromId }, request.from)}
                          alt={request.from}
                        />
                        <div>
                          <strong>{request.from}</strong>
                          <span>{request.createdAt}</span>
                        </div>
                      </div>
                      <span className={`status-pill ${statusTone(request.status)}`}>
                        {request.statusLabel || displayStatus(request.status)}
                      </span>
                    </div>

                    <p>{request.message || "No application message provided."}</p>

                    {request.response ? (
                      <div className="member-note">
                        <strong>Response</strong>
                        <p>{request.response}</p>
                      </div>
                    ) : null}

                    {request.status === "pending" ? (
                      <div className="member-inline-actions">
                        <button
                          className="btn"
                          type="button"
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
                              await refreshRequests();
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
                          type="button"
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
                              await refreshRequests();
                              setMessage(`Request from ${request.from} rejected.`);
                            } catch (actionError) {
                              setError(getErrorMessage(actionError, "Unable to reject this request."));
                            }
                          }}
                        >
                          Reject
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <div className="member-empty">
                <p>No incoming requests found.</p>
              </div>
            )}
          </article>

          <article className="member-card">
            <div className="member-card__head">
              <div>
                <p className="member-card__eyebrow">Outgoing</p>
                <h2>Sent requests</h2>
              </div>
            </div>

            {outgoingRequests.length > 0 ? (
              <div className="member-record-list">
                {outgoingRequests.map((request) => (
                  <article key={request.id} className="member-record member-request-card">
                    <div className="member-record__top">
                      <div className="member-request-card__person">
                        <img
                          className="member-avatar-small"
                          src={getAvatarForActor({ id: request.toId }, request.to)}
                          alt={request.to}
                        />
                        <div>
                          <strong>{request.to}</strong>
                          <span>{request.createdAt}</span>
                        </div>
                      </div>
                      <span className={`status-pill ${statusTone(request.status)}`}>
                        {request.statusLabel || displayStatus(request.status)}
                      </span>
                    </div>

                    <p>{request.message || "No application message provided."}</p>

                    {request.response ? (
                      <div className="member-note">
                        <strong>Response</strong>
                        <p>{request.response}</p>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <div className="member-empty">
                <p>No sent requests found.</p>
              </div>
            )}
          </article>
        </section>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="member-workspace">
          <Link className="member-back-link" to={ROUTE_PATHS.PARTNER_DISCOVER}>
            ← Back to Partner Recommendations
          </Link>
        <section className="member-alert member-alert--error">
          <strong>Profile unavailable</strong>
          <p>{error}</p>
          {error.toLowerCase().includes("enable matching first") ? (
            <div className="member-card__actions" style={{ marginTop: 12 }}>
              <button className="btn" type="button" onClick={() => navigate(ROUTE_PATHS.PARTNER)}>
                Go to partner profile
              </button>
            </div>
          ) : null}
        </section>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="member-workspace">
          <Link className="member-back-link" to={ROUTE_PATHS.PARTNER_DISCOVER}>
            ← Back to Partner Recommendations
          </Link>
        <div className="member-empty">
          <p>No active partner profile was found for this request.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="member-workspace">
        <Link className="member-back-link" to={ROUTE_PATHS.PARTNER_DISCOVER}>
          ← Back to Partner Recommendations
        </Link>

      {error ? (
        <section className="member-alert member-alert--error">
          <strong>Request failed</strong>
          <p>{error}</p>
        </section>
      ) : null}
      {message ? (
        <section className="member-alert member-alert--success">
          <strong>Request sent</strong>
          <p>{message}</p>
        </section>
      ) : null}

      <section className="partner-detail">
        <article className="partner-detail__card">
          <div className="partner-detail__header">
            <div className="partner-detail__identity">
              <img
                alt={profile.nickname}
                className="partner-detail__avatar"
                src={getAvatarForActor({ id: profile.memberId || profile.id }, profile.nickname)}
              />
              <div className="partner-detail__identityText">
                <h1>{profile.nickname}</h1>
                <span className="partner-detail__status">MATCH READY</span>
              </div>
            </div>
          </div>

          <div className="partner-detail__section">
            <h2>About Me</h2>
            <p>{profile.description || profile.selfDescription || profile.bio || "No self-description provided."}</p>
          </div>

          <div className="partner-detail__section">
            <h2>Sports Interests</h2>
            <div className="partner-detail__chips">
              {(profile.interests || profile.interestsRaw || []).map((entry) => (
                <span key={entry} className="partner-detail__chip">
                  {toTitleText(entry)}
                </span>
              ))}
            </div>
          </div>

          <div className="partner-detail__section">
            <h2>Availability</h2>
            <div className="partner-detail__availabilityList">
              {(profile.availableTime || profile.availableTimeRaw || []).map((slot) => {
                const [day, time] = formatAvailabilityEntry(slot).split(" - ");
                return (
                  <div key={slot} className="partner-detail__availabilityItem">
                    <strong>{day}</strong>
                    <span>{time}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="partner-detail__actions">
            <button
              className="btn partner-detail__send"
              type="button"
              onClick={() => {
                setRequestModalOpen(true);
                setRequestDraft("");
                setRequestError("");
                setMessage("");
                setError("");
              }}
            >
              Send Match Request
            </button>
          </div>
        </article>
      </section>

      <MatchRequestModal
        open={requestModalOpen}
        pending={requestPending}
        targetName={profile.nickname}
        value={requestDraft}
        error={requestError}
        onChange={(nextValue) => {
          setRequestDraft(nextValue);
          setRequestError("");
        }}
        onCancel={closeRequestModal}
        onConfirm={handleConfirmSend}
      />
    </div>
  );
}
