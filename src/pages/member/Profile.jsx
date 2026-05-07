// This member page shows Profile content.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import "../pageStyles.css";
import "./PartnerDetail.css";
import "./Profile.css";
import { checkAccountDeletable, deleteMyAccount, updateUserProfile} from "../../services/profileService";
import { getDocById } from "../../services/firestoreService";
import { getFriendProfiles, removeFriend } from "../../services/partnerService";
import { useAuth } from "../../provider/AuthContext";
import { ROUTE_PATHS } from "../../constants/routes";
import { getAvatarForActor } from "../../utils/avatar";
import { formatDateOnly, formatDateTimeDisplay, toDateInputValue } from "../../utils/dateFields";
import { getActionErrorMessage } from "../../utils/errors";
import { displayStatus, formatAvailabilityLabel, toTitleText } from "../../utils/presentation";
import { hasMeaningfulText } from "../../utils/text";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import Toast from "../../components/common/Toast";
import PasswordChangePanel from "../../components/profile/PasswordChangePanel";

// Format a raw availability string into an array containing [day, time]
function formatAvailabilityParts(value = "") {
  const [day = "", ...timeParts] = formatAvailabilityLabel(value).split(" ").filter(Boolean);
  return [day, timeParts.join(" ")];
}

// Sort an array of friends alphabetically by their nickname or name
function sortFriends(items = []) {
  return [...items].sort((left, right) =>
    String(left.nickname || left.name || "").localeCompare(String(right.nickname || right.name || "")),
  );
}

// Helper to construct a standardized alert configuration object
function buildAlert(title, body, tone = "success") {
  return { title, body, tone };
}

// Normalize the profile record from the database, applying fallbacks and standardizing date formats
function normalizeProfileRecord(record = {}, fallback = {}) {
  const rawDateOfBirth =
    record.date_of_birth ??
    record.dateOfBirth ??
    fallback.date_of_birth ??
    fallback.dateOfBirth ??
    "";
  const rawCreatedAt =
    record.created_at ??
    record.createdAt ??
    fallback.created_at ??
    fallback.createdAt ??
    "";

  return {
    name: record.name || fallback.name || "",
    dateOfBirth: toDateInputValue(rawDateOfBirth),
    address: record.address || fallback.address || "",
    email: record.email || fallback.email || "",
    status: record.status || fallback.status || "active",
    createdAt: rawCreatedAt,
  };
}

// Render a formatted alert message block
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

// Render an inline field-level error message
function renderFieldError(error) {
  if (!error) {
    return null;
  }

  return <p className="profile-fieldError">{error}</p>;
}

export default function Profile() {
  const navigate = useNavigate();
  const { logout, sessionProfile, sessionRole } = useAuth();
  const passwordPanelRef = useRef(null);

  // Hooks
  const [profileView, setProfileView] = useState({
    name: "",
    dateOfBirth: "",
    address: "",
    email: "",
    status: "",
    createdAt: "",
  });
  const [originalProfile, setOriginalProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [form, setForm] = useState({
    name: "",
    dateOfBirth: "",
    address: "",
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [profileAlert, setProfileAlert] = useState(null);
  const [toast, setToast] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const [friends, setFriends] = useState([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [friendDeleteConfirmOpen, setFriendDeleteConfirmOpen] = useState(false);
  const [friendModalError, setFriendModalError] = useState("");
  const [removingFriend, setRemovingFriend] = useState(false);

  const [passwordConfirmOpen, setPasswordConfirmOpen] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [dangerAlert, setDangerAlert] = useState(null);
  const [blockingReasons, setBlockingReasons] = useState([]);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteModalError, setDeleteModalError] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);

  // --- Lifecycle Hooks ---
  // Fetch the user's basic profile details from Firestore when the component mounts
  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (!sessionProfile) {
        if (!cancelled) {
          setProfileLoading(true);
        }
        return;
      }

      setProfileLoading(true);

      let record = null;
      if (sessionProfile.id) {
        try {
          record = await getDocById("member", sessionProfile.id);
        } catch {
          record = null;
        }
      }

      if (cancelled) {
        return;
      }

      const nextView = normalizeProfileRecord(record || {}, sessionProfile);
      setProfileView(nextView);
      setOriginalProfile(nextView);
      setForm({
        name: nextView.name,
        dateOfBirth: nextView.dateOfBirth,
        address: nextView.address,
      });
      setProfileLoading(false);
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [sessionProfile]);

  // Fetch the user's list of matched friends/partners
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
        setToast({
          tone: "error",
          title: "Unable to load friends",
          message: getActionErrorMessage(loadError, "friends.load", "Unable to load your partners."),
        });
    } finally {
      setFriendsLoading(false);
    }
  }, [sessionProfile]);

  useEffect(() => {
    loadFriends();
  }, [loadFriends]);

  // --- Derived Data ---
  const friendCountLabel = useMemo(
    () => `${friends.length} friend${friends.length === 1 ? "" : "s"}`,
    [friends.length],
  );
  const accountStatus = useMemo(
    () => displayStatus(profileView.status || "active"),
    [profileView.status],
  );

  // --- Form Validation & Handlers ---
  // Validate the basic profile information form
  function validateBasicForm(nextForm = form) {
    const errors = {};
    if (!hasMeaningfulText(nextForm.name)) {
      errors.name = "Please enter your full name.";
    }
    if (!nextForm.dateOfBirth) {
      errors.dateOfBirth = "Please choose your date of birth.";
    }
    if (!hasMeaningfulText(nextForm.address)) {
      errors.address = "Please enter your address.";
    }
    return errors;
  }

  // Merge current form edits with original profile data
  function buildMergedProfileForm() {
    const source = originalProfile || profileView;
    return {
      name: form.name ?? source.name ?? "",
      dateOfBirth: form.dateOfBirth ?? source.dateOfBirth ?? "",
      address: form.address ?? source.address ?? "",
    };
  }

  // Handle toggling edit mode and saving profile changes
  async function handleProfileAction() {
    setProfileAlert(null);
    setFieldErrors({});

    if (!isEditing) {
      const source = originalProfile || profileView;
      setForm({
        name: source.name || "",
        dateOfBirth: source.dateOfBirth || "",
        address: source.address || "",
      });
      setIsEditing(true);
      return;
    }

    const mergedForm = buildMergedProfileForm();
    const errors = validateBasicForm(mergedForm);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const profilePayload = {
      name: String(mergedForm.name || "").trim(),
      dateOfBirth: mergedForm.dateOfBirth,
      address: String(mergedForm.address || "").trim(),
    };

    setSavingProfile(true);
    try {
      await updateUserProfile(profilePayload, sessionProfile);
      const nextView = {
        ...profileView,
        name: profilePayload.name,
        dateOfBirth: toDateInputValue(profilePayload.dateOfBirth),
        address: profilePayload.address,
      };
      setProfileView(nextView);
      setOriginalProfile(nextView);
      setForm({
        name: nextView.name,
        dateOfBirth: nextView.dateOfBirth,
        address: nextView.address,
      });
      setIsEditing(false);
      setProfileAlert(buildAlert("Saved", "Basic information updated successfully."));
    } catch (saveError) {
        setProfileAlert(
          buildAlert(
            "Save failed",
            getActionErrorMessage(saveError, "profile.save", "Unable to update the profile."),
            "error",
          ),
        );
    } finally {
      setSavingProfile(false);
    }
  }

  // Handle the intent to save a new password (triggers validation and confirmation dialog)
  function handlePasswordSaveIntent() {
    if (!passwordPanelRef.current?.isExpanded()) {
      passwordPanelRef.current?.open();
      return;
    }

    const result = passwordPanelRef.current?.validate({ requirePassword: true });
    if (!result?.valid) {
      return;
    }

    setPasswordConfirmOpen(true);
  }

  // Execute the confirmed password update
  async function handleConfirmPasswordSave() {
    setSavingPassword(true);

    try {
      await passwordPanelRef.current?.savePassword();
      passwordPanelRef.current?.reset({ collapse: true });
      setPasswordConfirmOpen(false);
      setToast({
        tone: "success",
        title: "Password updated",
        message: "Password updated successfully.",
      });
    } catch (error) {
      setPasswordConfirmOpen(false);
        setToast({
          tone: "error",
          title: "Update failed",
          message: getActionErrorMessage(error, "password.update", "Unable to update the password."),
        });
    } finally {
      setSavingPassword(false);
    }
  }

  // Handle the intent to delete the account, first checking if there are blocking reasons (like active bookings)
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
            getActionErrorMessage(checkError, "profile.deleteCheck", "Unable to check the account status."),
            "error",
          ),
        );
    }
  }

  // Execute the confirmed account deletion
  async function handleConfirmDeleteAccount() {
    setDeletingAccount(true);
    setDeleteModalError("");

    try {
      await deleteMyAccount(sessionProfile);
      await logout().catch(() => {});
      navigate(ROUTE_PATHS.LOGIN, { replace: true });
    } catch (deleteError) {
      setDeleteModalError(
        getActionErrorMessage(deleteError, "profile.delete", "Unable to delete this account right now."),
      );
      setDeletingAccount(false);
    }
  }

  // Execute the removal of a friend from the partner list
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
      setFriendDeleteConfirmOpen(false);
      setToast({
        tone: "success",
        title: "Friend removed",
        message: "Friend removed successfully.",
      });
    } catch (removeError) {
      const message = getActionErrorMessage(removeError, "friends.remove", "Unable to remove this friend right now.");
      setFriendModalError(message);
      setToast({
        tone: "error",
        title: "Remove failed",
        message,
      });
    } finally {
      setRemovingFriend(false);
    }
  }

  // Handle user sign out
  async function handleSignOut() {
    await logout();
    navigate(ROUTE_PATHS.LOGIN, { replace: true });
  }

  if (!sessionProfile || profileLoading) {
    return (
      <div className="profile-page">
        <main className="profile-main">
          <div className="profile-empty">Loading profile...</div>
        </main>
      </div>
    );
  }

  /************************************************************************************ */
  // Main Redering
  return (
    <div className="profile-page">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <aside className="profile-sidebar">
        {/* Sidebar: Branding and Navigation */}
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

        {/* Sidebar: Friends List */}
        <section className="profile-sidebar__friends">
          <div className="profile-sidebar__friendsHead">
            <span>My Partners</span>
            <small className="profile-sidebar__friendsCount">{friendCountLabel}</small>
          </div>

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
                    setFriendDeleteConfirmOpen(false);
                    setFriendModalError("");
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

          {/* Add a custumer contact */}
          <div className="profile-sidebar__footer">
            <div className="profile-sidebar__support" aria-label="Customer support phone">
              <span>Customer Support</span>
              <strong>+44 20 1234 5678</strong>
            </div>
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

        {/* Basic Information Editor */}
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
                <div className="profile-staticValue">{formatDateOnly(profileView.dateOfBirth)}</div>
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

          <div className="profile-card__actions">
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

        {/* Password Management */}
        <section className="profile-card profile-card--password">
          <PasswordChangePanel
            ref={passwordPanelRef}
            disabled={savingPassword}
            idPrefix="member-password"
            sectionClassName="profile-password-panel"
          />

          <div className="profile-card__actions profile-password-actions">
            <button
              className="profile-button profile-button--secondary"
              type="button"
              onClick={() => passwordPanelRef.current?.reset({ collapse: true })}
              disabled={savingPassword}
            >
              Cancel
            </button>
            <button
              className="profile-button"
              type="button"
              onClick={handlePasswordSaveIntent}
              disabled={savingPassword}
            >
              {savingPassword ? "Updating..." : "Save Password"}
            </button>
          </div>
        </section>

        {/* Account Information */}
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
              <div className="profile-staticValue">{formatDateTimeDisplay(profileView.createdAt)}</div>
            </div>
          </div>
        </section>

        {/*Account Delete*/}
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

      {/* Friend Profile Detail and Removal */}
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
                setFriendDeleteConfirmOpen(false);
                setFriendModalError("");
              }}
            >
              ×
            </button>

            {friendModalError ? renderAlert(buildAlert("Delete failed", friendModalError, "error")) : null}

              <section className="profile-partnerModal" aria-labelledby="friend-detail-title">
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
                    onClick={() => setFriendDeleteConfirmOpen(true)}
                    disabled={removingFriend}
                  >
                    {removingFriend ? "Deleting..." : "Delete Friend"}
                  </button>
                </div>
              </section>
          </div>
        </div>
      ) : null}

      {/* Dialogs */}
      {/* Confirm Account Deletion */}
      {deleteModalOpen ? (
        <ConfirmDialog
          open={deleteModalOpen}
          title="Delete Account"
          description="This action permanently removes your account and signs you out."
          tone="danger"
          confirmLabel="Confirm Delete"
          cancelLabel="Cancel"
          pending={deletingAccount}
          onCancel={() => {
            if (!deletingAccount) {
              setDeleteModalOpen(false);
              setDeleteModalError("");
            }
          }}
          onConfirm={handleConfirmDeleteAccount}
        >
          {deleteModalError ? renderAlert(buildAlert("Delete failed", deleteModalError, "error")) : null}
        </ConfirmDialog>
      ) : null}

      {/* Confirm Password Change */}
      <ConfirmDialog
        open={passwordConfirmOpen}
        title="Confirm password update?"
        description="Your new password will take effect immediately. Do you want to continue?"
        confirmLabel="Confirm Update"
        cancelLabel="Cancel"
        pending={savingPassword}
        onCancel={() => {
          if (!savingPassword) {
            setPasswordConfirmOpen(false);
          }
        }}
        onConfirm={handleConfirmPasswordSave}
      />

      {/* Confirm Friend Removal */}
      <ConfirmDialog
        open={friendDeleteConfirmOpen && Boolean(selectedFriend)}
        title="Remove friend?"
        description={`Remove ${selectedFriend?.nickname || selectedFriend?.name || "this friend"} from your partners?`}
        confirmLabel="Remove Friend"
        cancelLabel="Cancel"
        tone="danger"
        pending={removingFriend}
        onCancel={() => {
          if (!removingFriend) {
            setFriendDeleteConfirmOpen(false);
          }
        }}
        onConfirm={handleDeleteFriend}
      />
    </div>
  );
}
