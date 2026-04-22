import { useMemo, useState } from "react";
import "../../pages/pageStyles.css";
import "../member/memberWorkspace.css";
import "./Preview.css";
import { previewMatchedFriends } from "../../previews/memberPreviewData";
import { getAvatarOptions } from "../../utils/avatar";
import { statusTone, toTitleText } from "../../utils/presentation";

function findAvatar(id) {
  return getAvatarOptions().find((item) => item.id === id)?.src || getAvatarOptions()[0]?.src || "";
}

export default function PreviewProfile() {
  const [activeId, setActiveId] = useState(previewMatchedFriends[0]?.id || "");
  const activeFriend = useMemo(
    () => previewMatchedFriends.find((item) => item.id === activeId) || previewMatchedFriends[0],
    [activeId],
  );

  return (
    <div className="member-workspace preview-profile-page">
      <section className="member-page-heading">
        <h1>Profile</h1>
        <p>Preview the matched friends area without changing your real profile data.</p>
      </section>

      <article className="member-card">
        <div className="member-card__head">
          <div>
            <p className="member-card__eyebrow">Matched Friends</p>
            <h2>Connected partners preview</h2>
            <p>This section is powered by static preview data only.</p>
          </div>
        </div>

        <div className="member-friend-grid">
          <div className="member-friend-list">
            {previewMatchedFriends.map((friend) => (
              <button
                key={friend.id}
                type="button"
                className={`member-friend-card ${friend.id === activeFriend.id ? "is-active" : ""}`}
                onClick={() => setActiveId(friend.id)}
              >
                <img className="member-avatar-small" src={findAvatar(friend.avatarId)} alt={friend.nickname} />
                <div className="member-friend-card__body">
                  <strong>{friend.nickname}</strong>
                  <span>{friend.interests.join(" - ")}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="preview-profile-page__friendCard member-friend-detail">
            <div className="member-profile-banner">
              <img
                className="member-avatar-large"
                src={findAvatar(activeFriend.avatarId)}
                alt={activeFriend.nickname}
              />
              <div className="member-profile-banner__text">
                <h3>{activeFriend.nickname}</h3>
                <span className={`status-pill ${statusTone(activeFriend.status)}`}>
                  {toTitleText(activeFriend.status)}
                </span>
              </div>
            </div>

            <div className="member-note">
              <strong>Shared interests</strong>
              <p>{activeFriend.interests.join(" - ")}</p>
            </div>

            <div className="member-note">
              <strong>Preview note</strong>
              <p>{activeFriend.note}</p>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}
