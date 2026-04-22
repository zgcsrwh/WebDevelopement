import { useMemo, useState } from "react";
import { CalendarDays, Dumbbell } from "lucide-react";
import { Link } from "react-router-dom";
import "../../pages/pageStyles.css";
import "../member/memberWorkspace.css";
import "../member/Discover.css";
import MatchRequestModal from "../../components/member/MatchRequestModal";
import { ROUTE_PATHS } from "../../constants/routes";
import { previewFacilityTypes, previewPartnerProfiles } from "../../previews/memberPreviewData";
import { getAvatarOptions } from "../../utils/avatar";
import { countMeaningfulCharacters, hasMeaningfulText } from "../../utils/text";

const DAY_OPTIONS = [
  "Any Day",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const TIME_OPTIONS = ["Any Time", "Morning", "Afternoon", "Evening"];

function findAvatar(id) {
  return getAvatarOptions().find((item) => item.id === id)?.src || getAvatarOptions()[0]?.src || "";
}

function formatAvailability(value) {
  return String(value)
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" - ");
}

export default function PreviewPartnerDiscover() {
  const [filters, setFilters] = useState({
    sport: "",
    day: "Any Day",
    time: "Any Time",
  });
  const [modalProfile, setModalProfile] = useState(null);
  const [draft, setDraft] = useState("");
  const [modalError, setModalError] = useState("");
  const [message, setMessage] = useState("");

  const sportOptions = useMemo(() => ["All Sports", ...previewFacilityTypes], []);

  const visibleProfiles = useMemo(() => {
    return previewPartnerProfiles.filter((profile) => {
      if (filters.sport && !profile.interests.includes(filters.sport)) {
        return false;
      }

      if (filters.day !== "Any Day") {
        const dayMatch = profile.availableTime.some((item) =>
          item.toLowerCase().startsWith(filters.day.toLowerCase()),
        );
        if (!dayMatch) {
          return false;
        }
      }

      if (filters.time !== "Any Time") {
        const timeMatch = profile.availableTime.some((item) =>
          item.toLowerCase().endsWith(filters.time.toLowerCase()),
        );
        if (!timeMatch) {
          return false;
        }
      }

      return true;
    });
  }, [filters]);

  function closeModal() {
    setModalProfile(null);
    setDraft("");
    setModalError("");
  }

  function confirmSend() {
    const count = countMeaningfulCharacters(draft);
    if (!hasMeaningfulText(draft)) {
      setModalError("Please enter an application description.");
      return;
    }
    if (count > 200) {
      setModalError("Application description must be 200 characters or fewer.");
      return;
    }
    setMessage(`Preview only: request prepared for ${modalProfile?.nickname || "this partner"}.`);
    closeModal();
  }

  return (
    <div className="member-workspace discover-page">
      <section className="discover-page__header">
        <div>
          <h1>Partner Recommendations</h1>
          <p>Find your perfect sports partner. Only displaying active members.</p>
        </div>
        <Link className="btn-secondary discover-page__back" to={ROUTE_PATHS.PARTNER}>
          Back to Match Profile
        </Link>
      </section>

      {message ? (
        <section className="member-alert member-alert--success">
          <strong>Preview only</strong>
          <p>{message}</p>
        </section>
      ) : null}

      <section className="discover-filterCard">
        <div className="discover-filterCard__grid">
          <label className="discover-filterCard__field">
            <span>Sport</span>
            <select
              value={filters.sport}
              onChange={(event) => setFilters((current) => ({ ...current, sport: event.target.value }))}
            >
              {sportOptions.map((option) => (
                <option key={option} value={option === "All Sports" ? "" : option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="discover-filterCard__field">
            <span>Day</span>
            <select
              value={filters.day}
              onChange={(event) => setFilters((current) => ({ ...current, day: event.target.value }))}
            >
              {DAY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="discover-filterCard__field">
            <span>Time</span>
            <select
              value={filters.time}
              onChange={(event) => setFilters((current) => ({ ...current, time: event.target.value }))}
            >
              {TIME_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <button
            className="btn-secondary discover-filterCard__clear"
            type="button"
            onClick={() => setFilters({ sport: "", day: "Any Day", time: "Any Time" })}
          >
            Clear Filters
          </button>
        </div>
      </section>

      {visibleProfiles.length > 0 ? (
        <section className="discover-cardGrid">
          {visibleProfiles.map((profile) => {
            const shownInterests = profile.interests.slice(0, 2);
            const shownAvailability = profile.availableTime.slice(0, 2);

            return (
              <article key={profile.id} className="discover-card">
                <div className="discover-card__identity">
                  <img className="discover-card__avatar" src={findAvatar(profile.avatarId)} alt={profile.nickname} />
                  <div>
                    <h2>{profile.nickname}</h2>
                    <span className="discover-card__status">MATCH READY</span>
                  </div>
                </div>

                <p className="discover-card__bio">{profile.description}</p>

                <div className="discover-card__meta">
                  <div className="discover-card__metaRow">
                    <span className="discover-card__icon" aria-hidden="true">
                      <Dumbbell size={16} />
                    </span>
                    <div className="discover-card__chips">
                      {shownInterests.map((item) => (
                        <span key={item} className="discover-card__chip">
                          {item}
                        </span>
                      ))}
                      {profile.interests.length > shownInterests.length ? (
                        <span className="discover-card__more">
                          +{profile.interests.length - shownInterests.length}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="discover-card__metaRow">
                    <span className="discover-card__icon" aria-hidden="true">
                      <CalendarDays size={16} />
                    </span>
                    <div className="discover-card__chips">
                      {shownAvailability.map((item) => (
                        <span key={item} className="discover-card__availability">
                          {formatAvailability(item)}
                        </span>
                      ))}
                      {profile.availableTime.length > shownAvailability.length ? (
                        <span className="discover-card__more">
                          +{profile.availableTime.length - shownAvailability.length}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="discover-card__actions">
                  <Link
                    className="btn-secondary"
                    to={`${ROUTE_PATHS.PREVIEW_PARTNER_DETAIL}?id=${profile.id}`}
                  >
                    View Details
                  </Link>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      setModalProfile(profile);
                      setDraft("");
                      setModalError("");
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
      ) : (
        <section className="member-alert member-alert--warning">
          <strong>No preview matches</strong>
          <p>The local preview data does not contain any partners for the current filter selection.</p>
        </section>
      )}

      <MatchRequestModal
        open={Boolean(modalProfile)}
        targetName={modalProfile?.nickname}
        value={draft}
        error={modalError}
        onChange={(nextValue) => {
          setDraft(nextValue);
          setModalError("");
        }}
        onCancel={closeModal}
        onConfirm={confirmSend}
      />
    </div>
  );
}
