import { useEffect, useMemo, useState } from "react";
import "../pageStyles.css";
import { checkAccountDeletable, deleteMyAccount, updateUserProfile } from "../../services/profileService";
import { getFriendProfiles, removeFriend } from "../../services/partnerService";
import { useAuth } from "../../provider/AuthContext";
import { buildMemberAvatar } from "../../utils/avatar";
import { getErrorMessage } from "../../utils/errors";
import { displayStatus } from "../../utils/presentation";

function formatDateInput(value) {
  if (!value) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().slice(0, 10);
}

function formatCreatedAt(value) {
  if (!value) {
    return "Not available";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return parsed.toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Profile() {
  const { sessionProfile, sessionRole } = useAuth();
  const [form, setForm] = useState({
    name: "",
    dateOfBirth: "",
    address: "",
  });
  const [friends, setFriends] = useState([]);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!sessionProfile) {
      return;
    }

    setForm({
      name: sessionProfile.name || "",
      dateOfBirth: formatDateInput(sessionProfile.dateOfBirth),
      address: sessionProfile.address || "",
    });
  }, [sessionProfile]);

  useEffect(() => {
    getFriendProfiles(sessionProfile)
      .then(setFriends)
      .catch(() => setFriends([]));
  }, [sessionProfile]);

  const accountStatus = useMemo(() => displayStatus(sessionProfile?.status || "active"), [sessionProfile?.status]);
  const profileAvatar = useMemo(
    () => buildMemberAvatar(form.name || sessionProfile?.name || "Member"),
    [form.name, sessionProfile?.name],
  );

  const handleSave = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);

    try {
      await updateUserProfile(form, sessionProfile);
      setMessage("Profile updated successfully.");
    } catch (saveError) {
      setError(getErrorMessage(saveError, "Unable to update the profile."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCheck = async () => {
    setError("");
    setMessage("");

    try {
      const result = await checkAccountDeletable(sessionProfile);
      setMessage(result.isDeletable ? "Account can be deleted." : result.blockingReasons.join(" "));
    } catch (checkError) {
      setError(getErrorMessage(checkError, "Unable to check the account status."));
    }
  };

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <h1>Personal profile</h1>
          <p>Maintain your member details, review matched friends, and manage account deletion rules directly against the real booking and repair data.</p>
        </div>
      </section>

      <section className="split-layout">
        <article className="form-card">
          <h2>Basic information</h2>
          {error && <p className="errorMessage">{error}</p>}
          {message && <p className="successMessage">{message}</p>}
          <div className="profile-avatar-panel" style={{ marginTop: 18 }}>
            <img className="profile-avatar-large" src={profileAvatar} alt="Generated avatar" />
            <div style={{ flex: 1 }}>
              <p className="soft-text" style={{ marginBottom: 12 }}>
                The avatar is generated from your current profile name so this page no longer depends on browser-only demo data.
              </p>
              <p className="soft-text">
                Update your name below and the generated avatar will refresh automatically with the rest of your real profile details.
              </p>
            </div>
          </div>

          <form className="field-grid" style={{ marginTop: 18 }} onSubmit={handleSave}>
            <div className="field-span">
              <label>Full name</label>
              <input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
            </div>
            <div>
              <label>Date of birth</label>
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={(event) => setForm((prev) => ({ ...prev, dateOfBirth: event.target.value }))}
              />
            </div>
            <div className="field-span">
              <label>Address</label>
              <input
                value={form.address}
                onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
              />
            </div>
            <div className="field-span form-actions">
              <button className="btn" type="submit" disabled={submitting}>
                {submitting ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        </article>

        <article className="detail-card">
          <h2>Account information</h2>
          <div className="booking-summary" style={{ marginTop: 18 }}>
            <span>Email: {sessionProfile?.email || "Not available"}</span>
            <span>Role: {sessionRole || "Member"}</span>
            <span>Status: {accountStatus}</span>
            <span>Registered at: {formatCreatedAt(sessionProfile?.createdAt)}</span>
            <span>Cancel times: {sessionProfile?.cancelTimes ?? 0}</span>
            <span>No-show times: {sessionProfile?.noShowTimes ?? 0}</span>
          </div>

          <div className="helper-box" style={{ marginTop: 22 }}>
            <h3 style={{ marginTop: 0 }}>Friends</h3>
            <p className="soft-text" style={{ marginBottom: 14 }}>
              These friends come from the real `friends` collection and are created automatically when a matching request is accepted.
            </p>
            <div className="friend-strip">
              {friends.map((friend) => (
                <button
                  key={friend.id}
                  type="button"
                  className="friend-avatar-button"
                  onClick={() => setSelectedFriend(friend)}
                >
                  <img src={buildMemberAvatar(friend.nickname || friend.name)} alt={friend.name} />
                  <span>{friend.nickname || friend.name}</span>
                </button>
              ))}
            </div>
            {friends.length === 0 && <p className="soft-text">This account currently has no matched friends.</p>}
          </div>

          <div className="helper-box" style={{ marginTop: 22 }}>
            <h3 style={{ marginTop: 0 }}>Danger zone</h3>
            <p style={{ marginBottom: 14 }}>
              The system checks unfinished bookings and unresolved repair reports before allowing account deletion.
            </p>
            <button className="btn-danger" type="button" onClick={handleDeleteCheck}>
              Check deletion eligibility
            </button>
            <button
              className="btn-secondary"
              type="button"
              style={{ marginTop: 12 }}
              onClick={async () => {
                setError("");
                setMessage("");
                try {
                  const eligibility = await checkAccountDeletable(sessionProfile);
                  if (!eligibility.isDeletable) {
                    setMessage(eligibility.blockingReasons.join(" "));
                    return;
                  }

                  if (!window.confirm("Are you sure you want to permanently delete this member account? This action cannot be undone.")) {
                    return;
                  }

                  await deleteMyAccount(sessionProfile);
                } catch (deleteError) {
                  setError(getErrorMessage(deleteError, "Unable to delete this account right now."));
                }
              }}
            >
              Delete account
            </button>
          </div>
        </article>
      </section>

      {selectedFriend && (
        <section className="page-panel">
          <div className="friend-detail-card">
            <img className="profile-avatar-large" src={buildMemberAvatar(selectedFriend.nickname || selectedFriend.name)} alt={selectedFriend.name} />
            <div style={{ flex: 1 }}>
              <h2 style={{ marginBottom: 8 }}>{selectedFriend.nickname || selectedFriend.name}</h2>
              <p className="soft-text">Sport: {selectedFriend.sport}</p>
              <p className="soft-text">Level: {selectedFriend.level}</p>
              <p className="soft-text" style={{ marginTop: 8 }}>{selectedFriend.bio}</p>
              <div className="panel-actions" style={{ marginTop: 18 }}>
                <button className="btn-secondary" type="button" onClick={() => setSelectedFriend(null)}>
                  Close
                </button>
                <button
                  className="btn-danger"
                  type="button"
                  onClick={async () => {
                    try {
                      await removeFriend(selectedFriend.id, sessionProfile);
                      setFriends((prev) => prev.filter((item) => item.id !== selectedFriend.id));
                      setMessage(`${selectedFriend.nickname || selectedFriend.name} was removed from your friend list.`);
                      setSelectedFriend(null);
                    } catch (removeError) {
                      setError(getErrorMessage(removeError, "Unable to remove this friend."));
                    }
                  }}
                >
                  Delete friend
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
