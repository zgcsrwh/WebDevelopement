import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import "../pageStyles.css";
import "./PartnerDetail.css";
import "./Profile.css";
import {
  checkAccountDeletable,
  deleteMyAccount,
  updateOwnPassword,
  updateUserProfile,
} from "../../services/profileService";
import { getFriendProfiles, removeFriend } from "../../services/partnerService";
import { useAuth } from "../../provider/AuthContext";
import { ROUTE_PATHS } from "../../constants/routes";
import { getAvatarForActor } from "../../utils/avatar";
import { getErrorMessage } from "../../utils/errors";
import { displayStatus, toTitleText } from "../../utils/presentation";
import { hasMeaningfulText } from "../../utils/text";

function formatDateInput(value) {
  if (!value) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return String(value);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().slice(0, 10);
}

function formatDateDisplay(value) {
  if (!value) {
    return "Not available";
  }

  const normalized = formatDateInput(value);
  if (!normalized) {
    return String(value);
  }

  const [year, month, day] = normalized.split("-");
  return `${day}/${month}/${year}`;
}

function formatDateTime(value) {
  if (!value) {
    return "Not available";
  }

  if (typeof value === "object" && value !== null) {
    const seconds = value.seconds ?? value._seconds;
    const nanoseconds = value.nanoseconds ?? value._nanoseconds ?? 0;
    if (typeof seconds === "number") {
      const milliseconds = seconds * 1000 + Math.floor(nanoseconds / 1000000);
      return formatDateTime(new Date(milliseconds));
    }
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function isStrongPassword(value) {
  return /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(String(value || ""));
}

function formatAvailabilityParts(value = "") {
  const [day = "", time = ""] = String(value)
    .split("_")
    .filter(Boolean)
    .map((part) => toTitleText(part));
  return [day, time];
}

function sortFriends(items = []) {
  return [...items].sort((left, right) =>
    String(left.nickname || left.name || "").localeCompare(String(right.nickname || right.name || "")),
  );
}

function buildAlert(title, body, tone = "success") {
  return { title, body, tone };
}

function renderAlert(alert, className = "") {
  if (!alert) {
    return null;
  }

  return (
    <section className={`profile-alert profile-alert--${alert.tone} ${className}`.trim()}>
      <strong>{alert.title}</strong>
      <p>{alert.body}</p>
    </section>
  );
}

function renderFieldError(error) {
  if (!error) {
    return null;
  }

  return <p className="profile-fieldError">{error}</p>;
}

function PasswordToggleButton({ visible, onToggle }) {
  return (
    <button
      aria-label={visible ? "Hide password" : "Show password"}
      className="profile-passwordToggle"
      type="button"
      onClick={onToggle}
    >
      {visible ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M3 3l18 18M10.6 10.6A2 2 0 0012 14a2 2 0 001.4-.6M9.9 5.1A10.9 10.9 0 0112 5c5.4 0 9 7 9 7a17.6 17.6 0 01-3 3.7M6.6 6.6C4 8.4 3 12 3 12a17.8 17.8 0 003.8 4.3M14.1 18.9A10.9 10.9 0 0112 19c-5.4 0-9-7-9-7a17.6 17.6 0 012.3-3.2"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7S18.5 19 12 19 1.5 12 1.5 12z"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
          <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      )}
    </button>
  );
}

export default function Profile() {
  const navigate = useNavigate();
  const { logout, sessionProfile, sessionRole } = useAuth();

  const [profileView, setProfileView] = useState({
    name: "",
    dateOfBirth: "",
    address: "",
    email: "",
    status: "",
    createdAt: "",
  });
  const [form, setForm] = useState({
    name: "",
    dateOfBirth: "",
    address: "",
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [profileAlert, setProfileAlert] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const [friends, setFriends] = useState([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendAlert, setFriendAlert] = useState(null);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [friendModalError, setFriendModalError] = useState("");
  const [removingFriend, setRemovingFriend] = useState(false);

  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    nextPassword: "",
    confirmPassword: "",
  });
  const [showNextPassword, setShowNextPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordFieldErrors, setPasswordFieldErrors] = useState({});
  const [passwordAlert, setPasswordAlert] = useState(null);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const [dangerAlert, setDangerAlert] = useState(null);
  const [blockingReasons, setBlockingReasons] = useState([]);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteModalError, setDeleteModalError] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    if (!sessionProfile) {
      return;
    }

    const nextView = {
      name: sessionProfile.name || "",
      dateOfBirth: formatDateInput(sessionProfile.dateOfBirth),
      address: sessionProfile.address || "",
      email: sessionProfile.email || "",
      status: sessionProfile.status || "active",
      createdAt: sessionProfile.createdAt || "",
    };

    setProfileView(nextView);
    setForm({
      name: nextView.name,
      dateOfBirth: nextView.dateOfBirth,
      address: nextView.address,
    });
  }, [sessionProfile]);

  const loadFriends = useCallback(async () => {
    if (!sessionProfile) {
      setFriends([]);
      return;
    }

    setFriendsLoading(true);
    try {
      const nextFriends = await getFriendProfiles(sessionProfile);
      setFriends(sortFriends(nextFriends));
    } catch (loadError) {
      setFriendAlert(
        buildAlert(
          "Unable to load friends",
          getErrorMessage(loadError, "Unable to load your partners."),
          "error",
        ),
      );
    } finally {
      setFriendsLoading(false);
    }
  }, [sessionProfile]);

  useEffect(() => {
    loadFriends();
  }, [loadFriends]);

  const friendCountLabel = useMemo(
    () => `${friends.length} friend${friends.length === 1 ? "" : "s"}`,
    [friends.length],
  );
  const accountStatus = useMemo(
    () => displayStatus(profileView.status || "active"),
    [profileView.status],
  );

  function validateBasicForm() {
    const errors = {};
    if (!hasMeaningfulText(form.name)) {
      errors.name = "Please enter your full name.";
    }
    if (!form.dateOfBirth) {
      errors.dateOfBirth = "Please choose your date of birth.";
    }
    if (!hasMeaningfulText(form.address)) {
      errors.address = "Please enter your address.";
    }
    return errors;
  }

  async function handleProfileAction() {
    setProfileAlert(null);
    setFieldErrors({});

    if (!isEditing) {
      setIsEditing(true);
      return;
    }

    const errors = validateBasicForm();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSavingProfile(true);
    try {
      await updateUserProfile(form, sessionProfile);
      setProfileView((previous) => ({
        ...previous,
        name: form.name.trim(),
        dateOfBirth: formatDateInput(form.dateOfBirth),
        address: form.address.trim(),
      }));
      setForm((previous) => ({
        ...previous,
        name: previous.name.trim(),
        address: previous.address.trim(),
      }));
      setIsEditing(false);
      setProfileAlert(buildAlert("Saved", "Basic information updated successfully."));
    } catch (saveError) {
      setProfileAlert(
        buildAlert(
          "Save failed",
          getErrorMessage(saveError, "Unable to update the profile."),
          "error",
        ),
      );
    } finally {
      setSavingProfile(false);
    }
  }

  function openPasswordModal() {
    setPasswordModalOpen(true);
    setPasswordForm({ nextPassword: "", confirmPassword: "" });
    setPasswordFieldErrors({});
    setPasswordAlert(null);
    setShowNextPassword(false);
    setShowConfirmPassword(false);
  }

  function closePasswordModal() {
    setPasswordModalOpen(false);
    setPasswordForm({ nextPassword: "", confirmPassword: "" });
    setPasswordFieldErrors({});
    setPasswordAlert(null);
    setShowNextPassword(false);
    setShowConfirmPassword(false);
    setUpdatingPassword(false);
  }

  async function handlePasswordUpdate(event) {
    event.preventDefault();

    const errors = {};
    if (!hasMeaningfulText(passwordForm.nextPassword)) {
      errors.nextPassword = "Please enter a new password.";
    } else if (!isStrongPassword(passwordForm.nextPassword)) {
      errors.nextPassword =
        "Password must be at least 8 characters long and include both letters and numbers.";
    }

    if (!hasMeaningfulText(passwordForm.confirmPassword)) {
      errors.confirmPassword = "Please confirm the new password.";
    } else if (passwordForm.nextPassword !== passwordForm.confirmPassword) {
      errors.confirmPassword = "The two passwords must match.";
    }

    setPasswordFieldErrors(errors);
    setPasswordAlert(null);

    if (Object.keys(errors).length > 0) {
      return;
    }

    setUpdatingPassword(true);
    try {
      await updateOwnPassword(passwordForm.nextPassword);
      setPasswordAlert(buildAlert("Password updated", "Password updated."));
      setPasswordForm({ nextPassword: "", confirmPassword: "" });
      setShowNextPassword(false);
      setShowConfirmPassword(false);
    } catch (passwordError) {
      setPasswordAlert(
        buildAlert(
          "Update failed",
          getErrorMessage(passwordError, "Unable to update the password."),
          "error",
        ),
      );
    } finally {
      setUpdatingPassword(false);
    }
  }

  async function handleDeleteIntent() {
    setDangerAlert(null);
    setBlockingReasons([]);

    try {
      const result = await checkAccountDeletable(sessionProfile);
      if (!result?.isDeletable) {
        setBlockingReasons(Array.isArray(result?.blockingReasons) ? result.blockingReasons : []);
        setDangerAlert(
          buildAlert("Action blocked", "Your account cannot be deleted right now.", "error"),
        );
        return;
      }

      setDeleteModalError("");
      setDeleteModalOpen(true);
    } catch (checkError) {
      setDangerAlert(
        buildAlert(
          "Check failed",
          getErrorMessage(checkError, "Unable to check the account status."),
          "error",
        ),
      );
    }
  }

  async function handleConfirmDeleteAccount() {
    setDeletingAccount(true);
    setDeleteModalError("");

    try {
      await deleteMyAccount(sessionProfile);
      await logout().catch(() => {});
      navigate(ROUTE_PATHS.LOGIN, { replace: true });
    } catch (deleteError) {
      setDeleteModalError(
        getErrorMessage(deleteError, "Unable to delete this account right now."),
      );
      setDeletingAccount(false);
    }
  }

  async function handleDeleteFriend() {
    if (!selectedFriend) {
      return;
    }

    setFriendModalError("");
    setRemovingFriend(true);

    try {
      await removeFriend(selectedFriend.memberId || selectedFriend.id, sessionProfile);
      await loadFriends();
      setSelectedFriend(null);
      setFriendAlert(buildAlert("Friend removed", "Friend removed successfully."));
    } catch (removeError) {
      setFriendModalError(
        getErrorMessage(removeError, "Unable to remove this friend right now."),
      );
    } finally {
      setRemovingFriend(false);
    }
  }

  async function handleSignOut() {
    await logout();
    navigate(ROUTE_PATHS.LOGIN, { replace: true });
  }

  if (!sessionProfile) {
    return (
      <div className="profile-page">
        <main className="profile-main">
          <div className="profile-empty">Loading profile...</div>
        </main>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <aside className="profile-sidebar">
        <Link className="profile-sidebar__brand" to={ROUTE_PATHS.FACILITIES}>
          <span>Sports Center</span>
          <span>Booking System</span>
        </Link>

        <nav className="profile-sidebar__nav" aria-label="Profile navigation">
          <NavLink className="profile-sidebar__navItem" to={ROUTE_PATHS.FACILITIES}>
            Facilities
          </NavLink>
          <NavLink className="profile-sidebar__navItem" to={ROUTE_PATHS.BOOKINGS}>
            My Bookings
          </NavLink>
          <NavLink className="profile-sidebar__navItem" to={ROUTE_PATHS.REPORTS}>
            Reports
          </NavLink>
          <NavLink className="profile-sidebar__navItem" to={ROUTE_PATHS.PARTNER}>
            Partner
          </NavLink>
        </nav>

        <section className="profile-sidebar__friends">
          <div className="profile-sidebar__friendsHead">
            <span>My Partners</span>
            <small className="profile-sidebar__friendsCount">{friendCountLabel}</small>
          </div>

          {renderAlert(friendAlert, "profile-sidebar__alert")}

          <div className="profile-sidebar__friendList">
            {friendsLoading ? (
              <p className="profile-sidebar__empty">Loading friends...</p>
            ) : friends.length === 0 ? (
              <p className="profile-sidebar__empty">No friends</p>
            ) : (
              friends.map((friend) => (
                <button
                  key={friend.memberId || friend.id}
                  className="profile-sidebar__friendItem"
                  type="button"
                  onClick={() => {
                    setSelectedFriend(friend);
                    setFriendModalError("");
                    setFriendAlert(null);
                  }}
                >
                  <img
                    alt={friend.nickname || friend.name}
                    className="profile-sidebar__friendAvatar"
                    src={getAvatarForActor(
                      { id: friend.memberId || friend.id },
                      friend.nickname || friend.name,
                    )}
                  />
                  <span>{friend.nickname || friend.name}</span>
                </button>
              ))
            )}
          </div>
        </section>

        <div className="profile-sidebar__footer">
          <span className="profile-sidebar__navItem profile-sidebar__navItem--active">
            Profile
          </span>
          <button className="profile-sidebar__logout" type="button" onClick={handleSignOut}>
            Log Out
          </button>
        </div>
      </aside>

      <main className="profile-main">
        <header className="profile-main__heading">
          <h1>Profile</h1>
          <p>Manage your personal details and account security.</p>
        </header>

        <section className="profile-card">
          <div className="profile-card__head">
            <div>
              <h2>Basic Information</h2>
            </div>
          </div>

          {renderAlert(profileAlert)}

          <div className="profile-card__body">
            <div className="profile-field">
              <label htmlFor="profile-name">Full Name</label>
              {isEditing ? (
                <>
                  <input
                    id="profile-name"
                    value={form.name}
                    onChange={(event) =>
                      setForm((previous) => ({ ...previous, name: event.target.value }))
                    }
                  />
                  {renderFieldError(fieldErrors.name)}
                </>
              ) : (
                <div className="profile-staticValue">{profileView.name || "Not available"}</div>
              )}
            </div>

            <div className="profile-field">
              <label htmlFor="profile-birth">Date of Birth</label>
              {isEditing ? (
                <>
                  <input
                    id="profile-birth"
                    type="date"
                    value={form.dateOfBirth}
                    onChange={(event) =>
                      setForm((previous) => ({ ...previous, dateOfBirth: event.target.value }))
                    }
                  />
                  {renderFieldError(fieldErrors.dateOfBirth)}
                </>
              ) : (
                <div className="profile-staticValue">{formatDateDisplay(profileView.dateOfBirth)}</div>
              )}
            </div>

            <div className="profile-field">
              <label htmlFor="profile-address">Address</label>
              {isEditing ? (
                <>
                  <input
                    id="profile-address"
                    value={form.address}
                    onChange={(event) =>
                      setForm((previous) => ({ ...previous, address: event.target.value }))
                    }
                  />
                  {renderFieldError(fieldErrors.address)}
                </>
              ) : (
                <div className="profile-staticValue">{profileView.address || "Not available"}</div>
              )}
            </div>
          </div>

          <div className="profile-card__actions profile-card__actions--spread">
            <button
              className="profile-button profile-button--secondary"
              type="button"
              onClick={openPasswordModal}
            >
              Change Password
            </button>
            <button
              className="profile-button profile-button--secondary"
              type="button"
              onClick={handleProfileAction}
              disabled={savingProfile}
            >
              {savingProfile ? "Saving..." : isEditing ? "Save" : "Edit Profile"}
            </button>
          </div>
        </section>

        <section className="profile-card">
          <div className="profile-card__head">
            <div>
              <h2>Account Information</h2>
            </div>
          </div>

          <div className="profile-accountGrid">
            <div className="profile-field profile-field--full">
              <label>Email Address</label>
              <div className="profile-staticValue">{profileView.email || "Not available"}</div>
            </div>

            <div className="profile-field">
              <label>Role</label>
              <div className="profile-staticValue">{sessionRole || "Member"}</div>
            </div>

            <div className="profile-field">
              <label>Account Status</label>
              <div className="profile-staticValue">{accountStatus}</div>
            </div>

            <div className="profile-field profile-field--full">
              <label>Registered At</label>
              <div className="profile-staticValue">{formatDateTime(profileView.createdAt)}</div>
            </div>
          </div>
        </section>

        <section className="profile-card profile-card--danger">
          <div className="profile-card__head">
            <div>
              <h2>Danger Zone</h2>
            </div>
          </div>

          {renderAlert(dangerAlert)}

          <div className="profile-danger__body">
            <div>
              <strong>Delete Account</strong>
              <p>Permanently delete your account and remove all personal data.</p>
              <p className="profile-danger__hint">
                You cannot delete your account if you have unfinished bookings or unresolved reports.
              </p>
              {blockingReasons.length > 0 ? (
                <ul className="profile-danger__reasons">
                  {blockingReasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              ) : null}
            </div>

            <button className="profile-button profile-button--danger" type="button" onClick={handleDeleteIntent}>
              Delete Account
            </button>
          </div>
        </section>
      </main>

      {selectedFriend ? (
        <div className="profile-modalOverlay" role="presentation">
          <div
            className="profile-modal profile-modal--wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="friend-detail-title"
          >
            <button
              aria-label="Close"
              className="profile-modal__close"
              type="button"
              onClick={() => {
                setSelectedFriend(null);
                setFriendModalError("");
              }}
            >
              ×
            </button>

            {friendModalError ? renderAlert(buildAlert("Delete failed", friendModalError, "error")) : null}

            <section className="partner-detail partner-detail--modal">
              <article className="partner-detail__card">
                <div className="partner-detail__header">
                  <div className="partner-detail__identity">
                    <img
                      alt={selectedFriend.nickname || selectedFriend.name}
                      className="partner-detail__avatar"
                      src={getAvatarForActor(
                        { id: selectedFriend.memberId || selectedFriend.id },
                        selectedFriend.nickname || selectedFriend.name,
                      )}
                    />
                    <div className="partner-detail__identityText">
                      <h1 id="friend-detail-title">{selectedFriend.nickname || selectedFriend.name}</h1>
                    </div>
                  </div>
                </div>

                <div className="partner-detail__section">
                  <h2>About Me</h2>
                  <p>
                    {selectedFriend.description ||
                      selectedFriend.selfDescription ||
                      selectedFriend.bio ||
                      "No self-description provided."}
                  </p>
                </div>

                <div className="partner-detail__section">
                  <h2>Sports Interests</h2>
                  <div className="partner-detail__chips">
                    {(selectedFriend.interests || []).map((entry) => (
                      <span key={entry} className="partner-detail__chip">
                        {toTitleText(entry)}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="partner-detail__section">
                  <h2>Availability</h2>
                  <div className="partner-detail__availabilityList">
                    {(selectedFriend.availableTime || []).length ? (
                      (selectedFriend.availableTime || []).map((slot) => {
                        const [day, time] = formatAvailabilityParts(slot);
                        return (
                          <div key={slot} className="partner-detail__availabilityItem">
                            <strong>{day}</strong>
                            <span>{time}</span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="partner-detail__availabilityItem">
                        <strong>Not available</strong>
                        <span>No availability added.</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="profile-partnerModal__actions">
                  <button
                    className="profile-button profile-button--danger"
                    type="button"
                    onClick={handleDeleteFriend}
                    disabled={removingFriend}
                  >
                    {removingFriend ? "Deleting..." : "Delete Friend"}
                  </button>
                </div>
              </article>
            </section>
          </div>
        </div>
      ) : null}

      {passwordModalOpen ? (
        <div className="profile-modalOverlay" role="presentation">
          <div className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="password-modal-title">
            <button aria-label="Close" className="profile-modal__close" type="button" onClick={closePasswordModal}>
              ×
            </button>

            <div className="profile-modal__header">
              <h2 id="password-modal-title">Change Password</h2>
              <p>Password must be at least 8 characters long and include both letters and numbers.</p>
            </div>

            {renderAlert(passwordAlert)}

            <form className="profile-modal__form" onSubmit={handlePasswordUpdate}>
              <div className="profile-field">
                <label htmlFor="next-password">New Password</label>
                <div className="profile-passwordField">
                  <input
                    id="next-password"
                    type={showNextPassword ? "text" : "password"}
                    value={passwordForm.nextPassword}
                    onChange={(event) =>
                      setPasswordForm((previous) => ({
                        ...previous,
                        nextPassword: event.target.value,
                      }))
                    }
                  />
                  <PasswordToggleButton
                    visible={showNextPassword}
                    onToggle={() => setShowNextPassword((previous) => !previous)}
                  />
                </div>
                {renderFieldError(passwordFieldErrors.nextPassword)}
              </div>

              <div className="profile-field">
                <label htmlFor="confirm-password">Confirm Password</label>
                <div className="profile-passwordField">
                  <input
                    id="confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    value={passwordForm.confirmPassword}
                    onChange={(event) =>
                      setPasswordForm((previous) => ({
                        ...previous,
                        confirmPassword: event.target.value,
                      }))
                    }
                  />
                  <PasswordToggleButton
                    visible={showConfirmPassword}
                    onToggle={() => setShowConfirmPassword((previous) => !previous)}
                  />
                </div>
                {renderFieldError(passwordFieldErrors.confirmPassword)}
              </div>

              <div className="profile-modal__actions">
                <button
                  className="profile-button profile-button--secondary"
                  type="button"
                  onClick={closePasswordModal}
                >
                  Cancel
                </button>
                <button className="profile-button" type="submit" disabled={updatingPassword}>
                  {updatingPassword ? "Updating..." : "Confirm Update"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteModalOpen ? (
        <div className="profile-modalOverlay" role="presentation">
          <div className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="delete-account-title">
            <button
              aria-label="Close"
              className="profile-modal__close"
              type="button"
              onClick={() => {
                if (!deletingAccount) {
                  setDeleteModalOpen(false);
                  setDeleteModalError("");
                }
              }}
            >
              ×
            </button>

            <div className="profile-modal__header">
              <h2 id="delete-account-title">Delete Account</h2>
              <p>This action permanently removes your account and signs you out.</p>
            </div>

            {deleteModalError ? renderAlert(buildAlert("Delete failed", deleteModalError, "error")) : null}

            <div className="profile-modal__actions">
              <button
                className="profile-button profile-button--secondary"
                type="button"
                onClick={() => {
                  setDeleteModalOpen(false);
                  setDeleteModalError("");
                }}
                disabled={deletingAccount}
              >
                Cancel
              </button>
              <button
                className="profile-button profile-button--danger"
                type="button"
                onClick={handleConfirmDeleteAccount}
                disabled={deletingAccount}
              >
                {deletingAccount ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
