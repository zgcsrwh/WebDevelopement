import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import "../../pages/pageStyles.css";
import "../member/memberWorkspace.css";
import "../member/PartnerDetail.css";
import MatchRequestModal from "../../components/member/MatchRequestModal";
import { ROUTE_PATHS } from "../../constants/routes";
import { previewPartnerProfiles } from "../../previews/memberPreviewData";
import { getAvatarOptions } from "../../utils/avatar";
import { countMeaningfulCharacters, hasMeaningfulText } from "../../utils/text";

function findAvatar(id) {
  return getAvatarOptions().find((item) => item.id === id)?.src || getAvatarOptions()[0]?.src || "";
}

function splitAvailability(value) {
  const [day, time] = String(value).split("_");
  return [
    day ? day.charAt(0).toUpperCase() + day.slice(1).toLowerCase() : "",
    time ? time.charAt(0).toUpperCase() + time.slice(1).toLowerCase() : "",
  ];
}

export default function PreviewPartnerDetail() {
  const [searchParams] = useSearchParams();
  const profileId = searchParams.get("id");
  const profile = useMemo(
    () => previewPartnerProfiles.find((item) => item.id === profileId) || previewPartnerProfiles[0],
    [profileId],
  );
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function handleConfirm() {
    const count = countMeaningfulCharacters(draft);
    if (!hasMeaningfulText(draft)) {
      setError("Please enter an application description.");
      return;
    }
    if (count > 200) {
      setError("Application description must be 200 characters or fewer.");
      return;
    }
    setMessage(`Preview only: request prepared for ${profile.nickname}.`);
    setOpen(false);
    setDraft("");
    setError("");
  }

  return (
    <div className="member-workspace">
      <Link className="member-back-link" to={ROUTE_PATHS.PREVIEW_PARTNER_DISCOVER}>
        Back to Partner Recommendations
      </Link>

      {message ? (
        <section className="member-alert member-alert--success">
          <strong>Preview only</strong>
          <p>{message}</p>
        </section>
      ) : null}

      <section className="partner-detail">
        <article className="partner-detail__card">
          <div className="partner-detail__header">
            <div className="partner-detail__identity">
              <img
                className="partner-detail__avatar"
                src={findAvatar(profile.avatarId)}
                alt={profile.nickname}
              />
              <div className="partner-detail__identityText">
                <h1>{profile.nickname}</h1>
                <span className="partner-detail__status">MATCH READY</span>
              </div>
            </div>
          </div>

          <div className="partner-detail__section">
            <h2>About Me</h2>
            <p>{profile.description}</p>
          </div>

          <div className="partner-detail__section">
            <h2>Sports Interests</h2>
            <div className="partner-detail__chips">
              {profile.interests.map((item) => (
                <span key={item} className="partner-detail__chip">
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="partner-detail__section">
            <h2>Availability</h2>
            <div className="partner-detail__availabilityList">
              {profile.availableTime.map((item) => {
                const [day, time] = splitAvailability(item);
                return (
                  <div key={item} className="partner-detail__availabilityItem">
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
                setMessage("");
                setOpen(true);
              }}
            >
              Send Match Request
            </button>
          </div>
        </article>
      </section>

      <MatchRequestModal
        open={open}
        targetName={profile.nickname}
        value={draft}
        error={error}
        onChange={(nextValue) => {
          setDraft(nextValue);
          setError("");
        }}
        onCancel={() => {
          setOpen(false);
          setDraft("");
          setError("");
        }}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
