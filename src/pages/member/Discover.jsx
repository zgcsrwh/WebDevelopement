import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Dumbbell } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import "../pageStyles.css";
import "./memberWorkspace.css";
import "./Discover.css";
import { useAuth } from "../../provider/AuthContext";
import {
  getPartnerDetailRoute,
  ROUTE_PATHS,
} from "../../constants/routes";
import { getFacilitySportTypes } from "../../services/bookingService";
import {
  getCurrentMatchProfile,
  getPartnerProfiles,
  sendMatchRequest,
} from "../../services/partnerService";
import { getAvatarForActor } from "../../utils/avatar";
import { getErrorMessage } from "../../utils/errors";
import { countMeaningfulCharacters } from "../../utils/text";
import MatchRequestModal from "../../components/member/MatchRequestModal";

const DAY_OPTIONS = [
  { value: "any", label: "Any Day" },
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
];

const TIME_OPTIONS = [
  { value: "any", label: "Any Time" },
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
];

function toTitleText(value) {
  return String(value || "")
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseAvailabilityEntry(entry) {
  const [day = "", time = ""] = String(entry || "").split("_");
  return {
    day,
    time,
    label: [toTitleText(day), toTitleText(time)].filter(Boolean).join(" - "),
  };
}

function applyProfileFilters(profile, filters) {
  const sportMatch =
    filters.sport === "all" || (profile.interests || []).includes(filters.sport);
  const dayMatch =
    filters.day === "any" ||
    (profile.availableTime || []).some((entry) => parseAvailabilityEntry(entry).day === filters.day);
  const timeMatch =
    filters.time === "any" ||
    (profile.availableTime || []).some((entry) => parseAvailabilityEntry(entry).time === filters.time);
  return sportMatch && dayMatch && timeMatch;
}

export default function Discover() {
  const navigate = useNavigate();
  const { sessionProfile } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [sportOptions, setSportOptions] = useState([]);
  const [currentProfile, setCurrentProfile] = useState(null);
  const [filters, setFilters] = useState({ sport: "all", day: "any", time: "any" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [requestTarget, setRequestTarget] = useState(null);
  const [requestDraft, setRequestDraft] = useState("");
  const [requestBusy, setRequestBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      if (!sessionProfile) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const [selfProfile, partnerProfiles, sports] = await Promise.all([
          getCurrentMatchProfile(sessionProfile),
          getPartnerProfiles(sessionProfile),
          getFacilitySportTypes(),
        ]);
        if (cancelled) return;
        if (!selfProfile?.openMatch) {
          navigate(ROUTE_PATHS.PARTNER, {
              replace: true,
              state: { partnerError: "Please complete your profile and enable matching first." },
            });
          return;
        }
        setCurrentProfile(selfProfile);
        setProfiles(partnerProfiles);
        setSportOptions(sports);
      } catch (loadError) {
        if (!cancelled) {
          setError(getErrorMessage(loadError, "Unable to load partner recommendations."));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    loadData();
    return () => {
      cancelled = true;
    };
  }, [navigate, sessionProfile]);

  const filteredProfiles = useMemo(
    () => profiles.filter((profile) => applyProfileFilters(profile, filters)),
    [profiles, filters],
  );

  const requestCount = countMeaningfulCharacters(requestDraft);

  async function handleSendRequest() {
    if (!requestTarget) return;
    if (!currentProfile?.openMatch) {
      setError("Please complete your profile and enable matching first.");
      return;
    }
    if (requestTarget.id === currentProfile.id || requestTarget.memberId === currentProfile.memberId) {
      setError("You cannot send a match request to yourself.");
      return;
    }
    if (requestCount <= 0) {
      setError("Please enter an application message before sending.");
      return;
    }
    if (requestCount > 200) {
      setError("Application message cannot exceed 200 characters.");
      return;
    }

    setRequestBusy(true);
    setError("");
    try {
      await sendMatchRequest({
        reciever_id: requestTarget.memberId || requestTarget.id,
        apply_description: requestDraft.trim(),
      });
      setMessage("Match request sent successfully.");
      setRequestTarget(null);
      setRequestDraft("");
    } catch (sendError) {
      setError(getErrorMessage(sendError, "Unable to send match request right now."));
    } finally {
      setRequestBusy(false);
    }
  }

  return (
    <div className="member-workspace discover-page">
      <div className="discover-page__header">
        <div>
          <h1 className="member-page-title">Partner Recommendations</h1>
          <p className="member-page-subtitle">
            Find your perfect sports partner. Only displaying active members.
          </p>
        </div>
        <Link className="btn btn-secondary discover-page__back" to={ROUTE_PATHS.PARTNER}>
            Back to Match Profile
          </Link>
      </div>

      {error ? (
        <section className="member-alert member-alert--error">
          <strong>Unable to continue</strong>
          <p>{error}</p>
        </section>
      ) : null}
      {message ? (
        <section className="member-alert member-alert--success">
          <strong>Request sent</strong>
          <p>{message}</p>
        </section>
      ) : null}

      <section className="member-card discover-page__filters">
        <div className="discover-page__filtersGrid">
          <label className="form-field">
            <span>Sport</span>
            <select
              value={filters.sport}
              onChange={(event) => setFilters((prev) => ({ ...prev, sport: event.target.value }))}
            >
              <option value="all">All Sports</option>
              {sportOptions.map((sport) => (
                <option key={sport} value={sport}>
                  {sport}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Day</span>
            <select
              value={filters.day}
              onChange={(event) => setFilters((prev) => ({ ...prev, day: event.target.value }))}
            >
              {DAY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Time</span>
            <select
              value={filters.time}
              onChange={(event) => setFilters((prev) => ({ ...prev, time: event.target.value }))}
            >
              {TIME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn btn-secondary discover-page__clear"
            type="button"
            onClick={() => setFilters({ sport: "all", day: "any", time: "any" })}
          >
            Clear Filters
          </button>
        </div>
      </section>

      {loading ? (
        <div className="member-card member-empty-state">Loading partner recommendations...</div>
      ) : filteredProfiles.length === 0 ? (
        <div className="member-card member-empty-state">
          <h2>Recommendations unavailable</h2>
          <p>Try adjusting your filters to see more active partners.</p>
        </div>
      ) : (
        <section className="discover-page__grid">
          {filteredProfiles.map((profile) => {
            const shownInterests = (profile.interests || []).slice(0, 2);
            const remainingInterests = Math.max((profile.interests || []).length - shownInterests.length, 0);
            const shownAvailability = (profile.availableTime || []).slice(0, 2);
            const remainingAvailability = Math.max(
              (profile.availableTime || []).length - shownAvailability.length,
              0,
            );

            return (
              <article className="member-card discover-card" key={profile.id}>
                <div className="discover-card__header">
                  <img
                    alt={profile.nickname}
                    className="discover-card__avatar"
                    src={getAvatarForActor(profile)}
                  />
                  <div>
                    <h2>{profile.nickname}</h2>
                    <span className="discover-card__status">MATCH READY</span>
                  </div>
                </div>

                <p className="discover-card__bio">{profile.selfDescription}</p>

                <div className="discover-card__meta">
                  <div className="discover-card__metaRow">
                    <Dumbbell aria-hidden="true" size={16} />
                    <div className="discover-card__chips">
                      {shownInterests.map((interest) => (
                        <span className="discover-card__chip" key={`${profile.id}-${interest}`}>
                          {interest}
                        </span>
                      ))}
                      {remainingInterests > 0 ? (
                        <span className="discover-card__metaMore">+{remainingInterests}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="discover-card__metaRow">
                    <CalendarDays aria-hidden="true" size={16} />
                    <div className="discover-card__availability">
                      {shownAvailability.map((entry) => (
                        <span key={`${profile.id}-${entry}`}>{parseAvailabilityEntry(entry).label}</span>
                      ))}
                      {remainingAvailability > 0 ? (
                        <span className="discover-card__metaMore">+{remainingAvailability}</span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="discover-card__actions">
                  <Link className="btn btn-secondary" to={getPartnerDetailRoute(profile.id)}>
                    View Details
                  </Link>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => {
                      setRequestTarget(profile);
                      setRequestDraft("");
                      setError("");
                      setMessage("");
                    }}
                  >
                    Send Request
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      <MatchRequestModal
        error={error}
        open={Boolean(requestTarget)}
        pending={requestBusy}
        targetName={requestTarget?.nickname}
        value={requestDraft}
        onChange={setRequestDraft}
        onCancel={() => {
          if (requestBusy) return;
          setRequestTarget(null);
          setRequestDraft("");
          setError("");
        }}
        onConfirm={handleSendRequest}
      />
    </div>
  );
}
