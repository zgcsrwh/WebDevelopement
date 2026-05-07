// This member page shows Discover content, which used to find other matching members.
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Dumbbell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import "../pageStyles.css";
import "./memberWorkspace.css";
import "./Discover.css";
import { useAuth } from "../../provider/AuthContext";
import { ROUTE_PATHS } from "../../constants/routes";
import { getFacilitySportTypes } from "../../services/bookingService";
import { getCurrentMatchProfile, getPartnerProfiles, sendMatchRequest,} from "../../services/partnerService";
import { getAvatarForActor } from "../../utils/avatar";
import { getActionErrorMessage } from "../../utils/errors";
import { countMeaningfulCharacters } from "../../utils/text";
import MatchRequestModal from "../../components/member/MatchRequestModal";
import { FilterField, FilterPanel } from "../../components/common/FilterControls";
import PageLayout from "../../components/common/PageLayout";

// Day option, it will comboung by "value_label"
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

// Format a string to Title Case
function toTitleText(value) {
  return String(value || "")
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

// Parse a raw availability string
function parseAvailabilityEntry(entry) {
  const [day = "", time = ""] = String(entry || "").split("_");
  return { day, time,
    label: [toTitleText(day), toTitleText(time)].filter(Boolean).join(" - "),
  };
}

// Evaluate whether a partner profile matches the currently selected filter criteria
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

// This page can only be accessed thourgh Partner page and click View Recommendation button
export default function Discover() {
  // Extract navigation and authentication context
  const navigate = useNavigate();
  const { sessionProfile } = useAuth();
  
  // Hooks
  const [profiles, setProfiles] = useState([]);
  const [sportOptions, setSportOptions] = useState([]);
  const [currentProfile, setCurrentProfile] = useState(null);
  const [filters, setFilters] = useState({ sport: "all", day: "any", time: "any" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [requestTarget, setRequestTarget] = useState(null);
  const [detailTarget, setDetailTarget] = useState(null);
  const [requestDraft, setRequestDraft] = useState("");
  const [requestBusy, setRequestBusy] = useState(false);

  // Fetch the current user's profile, available partner profiles, and sport types when the component mounts
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
        // Redirect the user to the Partner page if their match profile is incomplete or inactive
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
          setError(getActionErrorMessage(loadError, "partner.discover.load", "Unable to load partner recommendations."));
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


  // Filter the raw profiles list based on the active sport, day, and time selections
  const filteredProfiles = useMemo(
    () => profiles.filter((profile) => applyProfileFilters(profile, filters)),
    [profiles, filters],
  );

  const requestCount = countMeaningfulCharacters(requestDraft);

  // Handle sending a match request
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
      setError(getActionErrorMessage(sendError, "partner.request.send", "Unable to send match request right now."));
    } finally {
      setRequestBusy(false);
    }
  }

  /***************************************************************************8 */
  // Main Rendering
  return (
    <PageLayout
      className="discover-page"
      backTo={ROUTE_PATHS.PARTNER}
      backLabel="Back to Match Profile"
      title="Partner Recommendations"
      subtitle="Find your perfect sports partner. Only displaying active members."
    >

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

      {/* Filter controls for narrowing down partner recommendations */}
      <FilterPanel
        className="discover-page__filters"
        columns={3}
        onClear={() => setFilters({ sport: "all", day: "any", time: "any" })}
      >
          <FilterField id="discover-sport" label="Sport">
            <select
              id="discover-sport"
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
          </FilterField>

          <FilterField id="discover-day" label="Day">
            <select
              id="discover-day"
              value={filters.day}
              onChange={(event) => setFilters((prev) => ({ ...prev, day: event.target.value }))}
            >
              {DAY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
                ))}
            </select>
          </FilterField>

          <FilterField id="discover-time" label="Time">
            <select
              id="discover-time"
              value={filters.time}
              onChange={(event) => setFilters((prev) => ({ ...prev, time: event.target.value }))}
            >
              {TIME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
                ))}
            </select>
          </FilterField>
      </FilterPanel>

      {loading ? (
        /* Loading and Empty States */
        <div className="member-card member-empty-state">Loading partner recommendations...</div>
      ) : filteredProfiles.length === 0 ? (
        <div className="member-card member-empty-state">
          <h2>Recommendations unavailable</h2>
          <p>Try adjusting your filters to see more active partners.</p>
        </div>
      ) : (
        /* Partner cards */
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
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => setDetailTarget(profile)}
                  >
                    View Details
                  </button>
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

      {/* Match request */}
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

      {/* Detailed partner profile */}
      {detailTarget ? (
        <div className="member-modal-overlay" role="presentation" onClick={() => setDetailTarget(null)}>
          <div
            className="member-modal discover-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="discover-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="discover-detail-modal__header">
              <div className="discover-detail-modal__identity">
                <img
                  alt={detailTarget.nickname}
                  className="discover-detail-modal__avatar"
                  src={getAvatarForActor(detailTarget)}
                />
                <div className="discover-detail-modal__identityText">
                  <h2 id="discover-detail-title">{detailTarget.nickname}</h2>
                  <span className="discover-card__status">MATCH READY</span>
                </div>
              </div>
              <button
                className="discover-detail-modal__close"
                type="button"
                aria-label="Close details"
                onClick={() => setDetailTarget(null)}
              >
                ×
              </button>
            </div>

            <div className="discover-detail-modal__section">
              <p className="member-card__eyebrow">About Me</p>
              <p>
                {detailTarget.description ||
                  detailTarget.selfDescription ||
                  detailTarget.bio ||
                  "No self-description provided."}
              </p>
            </div>

            <div className="discover-detail-modal__section">
              <p className="member-card__eyebrow">Sports Interests</p>
              <div className="discover-detail-modal__chips">
                {(detailTarget.interests || []).map((interest) => (
                  <span className="discover-detail-modal__chip" key={`${detailTarget.id}-${interest}`}>
                    {toTitleText(interest)}
                  </span>
                ))}
              </div>
            </div>

            <div className="discover-detail-modal__section">
              <p className="member-card__eyebrow">Availability</p>
              <div className="discover-detail-modal__availability">
                {(detailTarget.availableTime || []).map((entry) => (
                  <div className="discover-detail-modal__availabilityItem" key={`${detailTarget.id}-${entry}`}>
                    {parseAvailabilityEntry(entry).label}
                  </div>
                ))}
              </div>
            </div>

            <div className="member-modal__actions">
              <button className="btn btn-secondary" type="button" onClick={() => setDetailTarget(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageLayout>
  );
}
