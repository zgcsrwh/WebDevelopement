import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "../../pages/pageStyles.css";
import "../member/memberWorkspace.css";
import "../member/BookingNew.css";
import "./Preview.css";
import { ROUTE_PATHS } from "../../constants/routes";
import { previewBookingFriends } from "../../previews/memberPreviewData";
import { getAvatarOptions } from "../../utils/avatar";

function findAvatar(id) {
  return getAvatarOptions().find((item) => item.id === id)?.src || getAvatarOptions()[0]?.src || "";
}

function summarizeSelectedFriends(items) {
  if (items.length === 0) {
    return "Select partners...";
  }
  if (items.length === 1) {
    return items[0].name;
  }
  return `${items[0].name} +${items.length - 1}`;
}

export default function PreviewBookingNew() {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState(
    [previewBookingFriends[0]?.id, previewBookingFriends[1]?.id].filter(Boolean),
  );

  const selectedFriends = useMemo(
    () => previewBookingFriends.filter((friend) => selectedIds.includes(friend.id)),
    [selectedIds],
  );

  return (
    <div className="member-workspace preview-booking-new-page booking-new-page">
      <Link className="booking-new__back" to={ROUTE_PATHS.PREVIEW_BOOKINGS}>
        Back to Preview Bookings
      </Link>

      <section className="booking-new__intro">
        <h1>Create a 1-hour booking request</h1>
        <p>
          Select a real facility, choose one open time slot, optionally attach matched friends,
          and preview the form layout.
        </p>
      </section>

      <section className="preview-booking-new-page__alert">
        Preview only: this route lets you inspect the invite dropdown and selected-friends layout
        without requiring real matched friends.
      </section>

      <div className="booking-new__layout">
        <article className="booking-new__card booking-new__card--form">
          <div className="booking-new__summary">
            <div className="booking-new__summaryText">
              <h2>Badminton Court A</h2>
              <p>Badminton</p>
            </div>
            <div className="booking-new__summaryPills">
              <span className="status-pill status-active">normal</span>
              <span className="booking-new__capacityPill">Capacity: Max 6</span>
            </div>
          </div>

          <div className="booking-new__grid">
            <div className="booking-new__field">
              <label>Booking Date</label>
              <input type="date" value="2026-04-21" readOnly />
            </div>
            <div className="booking-new__field">
              <label>Total Attendees</label>
              <input value="3" readOnly />
            </div>
            <div className="booking-new__field">
              <label>Start Time</label>
              <select value="18:00" disabled>
                <option>18:00</option>
              </select>
            </div>
            <div className="booking-new__field">
              <label>End Time</label>
              <select value="19:00" disabled>
                <option>19:00</option>
              </select>
            </div>

            <div className="booking-new__field booking-new__field--full">
              <label>
                Invite Partners{" "}
                <span className="booking-new__labelNote">
                  (Preview of matched-friends dropdown)
                </span>
              </label>
              <button
                className={`booking-new__inviteTrigger ${inviteOpen ? "is-open" : ""}`}
                type="button"
                onClick={() => setInviteOpen((current) => !current)}
              >
                <span>{summarizeSelectedFriends(selectedFriends)}</span>
                <span className="booking-new__inviteCaret">v</span>
              </button>

              {inviteOpen ? (
                <div className="booking-new__invitePanel">
                  <div className="booking-new__inviteHeader">
                    <strong>Matched Friends</strong>
                    <span>{selectedFriends.length} selected</span>
                  </div>
                  <div className="booking-new__inviteList">
                    {previewBookingFriends.map((friend) => {
                      const checked = selectedIds.includes(friend.id);
                      return (
                        <label
                          key={friend.id}
                          className={`booking-new__inviteOption ${checked ? "is-selected" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setSelectedIds((current) =>
                                current.includes(friend.id)
                                  ? current.filter((item) => item !== friend.id)
                                  : [...current, friend.id],
                              );
                            }}
                          />
                          <div>
                            <strong>{friend.name}</strong>
                            <span>{friend.summary}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="booking-new__selectedFriends">
                {selectedFriends.map((friend) => (
                  <span key={friend.id} className="member-chip">
                    <img
                      src={findAvatar(friend.avatarId)}
                      alt={friend.name}
                      style={{ width: 24, height: 24, borderRadius: "999px", objectFit: "cover" }}
                    />
                    {friend.name}
                  </span>
                ))}
              </div>
            </div>

            <div className="booking-new__field booking-new__field--full">
              <label>Activity Description</label>
              <textarea value="Friendly practice match before dinner." readOnly />
            </div>
          </div>

          <div className="booking-new__actions">
            <button className="btn-secondary" type="button">
              Cancel
            </button>
            <button className="btn" type="button">
              Submit Request
            </button>
          </div>
        </article>

        <article className="booking-new__card booking-new__card--rules">
          <h2>Booking Rules</h2>
          <ul className="booking-new__rulesList">
            <li>Minimum booking duration is 1 hour.</li>
            <li>Maximum booking duration is 4 hours per session.</li>
            <li>Please do not bring strong-smelling food or beverages.</li>
            <li>Proper sports attire and indoor non-marking shoes are strictly required.</li>
          </ul>
        </article>
      </div>
    </div>
  );
}
