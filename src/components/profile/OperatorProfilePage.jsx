import { useEffect, useMemo, useState } from "react";
import { Lock, LockOpen, LockKeyhole, LogOut, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../provider/AuthContext";
import { ROUTE_PATHS } from "../../constants/routes";
import { getErrorMessage } from "../../utils/errors";
import { hasMeaningfulText } from "../../utils/text";
import { getDocById, updateCollectionDoc } from "../../services/firestoreService";
import { updateOwnPassword } from "../../services/profileService";

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
  const normalized = formatDateInput(value);
  if (!normalized) {
    return "";
  }

  const [year, month, day] = normalized.split("-");
  return `${day}/${month}/${year}`;
}

function normalizeProfile(record = {}, fallback = {}) {
  return {
    id: record.id || fallback.id || "",
    name: record.name || fallback.name || "",
    dateOfBirth: formatDateInput(record.date_of_birth || record.dateOfBirth || fallback.dateOfBirth || ""),
    address: record.address || fallback.address || "",
    email: record.email || fallback.email || "",
    role: String(record.role || fallback.role || "staff"),
    createdAt: record.created_at || fallback.createdAt || "",
  };
}

function isStrongPassword(value) {
  return /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(String(value || ""));
}

function buildAlert(title, body, tone = "success") {
  return { title, body, tone };
}

function renderAlert(alert) {
  if (!alert) {
    return null;
  }

  return (
    <section className={`staff-profile__alert staff-profile__alert--${alert.tone}`}>
      <strong>{alert.title}</strong>
      <p>{alert.body}</p>
    </section>
  );
}

function renderFieldError(error) {
  if (!error) {
    return null;
  }

  return <p className="staff-profile__fieldError">{error}</p>;
}

export default function OperatorProfilePage({ roleVariant = "staff", roleLabel = "Staff" }) {
  const navigate = useNavigate();
  const { logout, sessionProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [pageAlert, setPageAlert] = useState(null);
  const [saveError, setSaveError] = useState("");
  const [originalProfile, setOriginalProfile] = useState(null);
  const [draftProfile, setDraftProfile] = useState({
    name: "",
    dateOfBirth: "",
    address: "",
    email: "",
    role: roleVariant,
    createdAt: "",
  });
  const [passwordExpanded, setPasswordExpanded] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    nextPassword: "",
    confirmPassword: "",
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (!sessionProfile?.id) {
        if (!cancelled) {
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setPageAlert(null);

      try {
        const record = await getDocById("admin_staff", sessionProfile.id);
        const normalized = normalizeProfile(record || {}, sessionProfile);

        if (!cancelled) {
          setOriginalProfile(normalized);
          setDraftProfile(normalized);
        }
      } catch (error) {
        if (!cancelled) {
          const fallback = normalizeProfile({}, sessionProfile);
          setOriginalProfile(fallback);
          setDraftProfile(fallback);
          setPageAlert(
            buildAlert(
              "Unable to refresh profile",
              getErrorMessage(error, "Unable to load the latest profile details."),
              "error",
            ),
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [sessionProfile]);

  const passwordDirty = useMemo(
    () => hasMeaningfulText(passwordForm.nextPassword) || hasMeaningfulText(passwordForm.confirmPassword),
    [passwordForm.confirmPassword, passwordForm.nextPassword],
  );

  const profileInitial =
    String(originalProfile?.name || sessionProfile?.name || roleLabel).trim().charAt(0).toUpperCase() ||
    roleLabel.charAt(0).toUpperCase();

  const roleBadge = String(roleLabel || originalProfile?.role || draftProfile.role || roleVariant).toUpperCase();

  function resetPasswordState({ collapse = true } = {}) {
    setPasswordForm({ nextPassword: "", confirmPassword: "" });
    setFieldErrors((previous) => ({
      ...previous,
      nextPassword: "",
      confirmPassword: "",
      address: previous.address || "",
    }));
    if (collapse) {
      setPasswordExpanded(false);
    }
  }

  function handleTogglePasswordSection() {
    if (passwordExpanded) {
      resetPasswordState({ collapse: true });
      setPageAlert(null);
      return;
    }

    setPasswordExpanded(true);
    setFieldErrors((previous) => ({
      ...previous,
      nextPassword: "",
      confirmPassword: "",
    }));
  }

  function handleCancel() {
    if (originalProfile) {
      setDraftProfile(originalProfile);
    }
    resetPasswordState({ collapse: true });
    setFieldErrors({});
    setPageAlert(null);
    setSaveError("");
    setConfirmModalOpen(false);
  }

  async function handleLogout() {
    await logout();
    navigate(ROUTE_PATHS.LOGIN, { replace: true });
  }

  function validateBeforeSave() {
    const nextErrors = {};

    if (!hasMeaningfulText(draftProfile.address)) {
      nextErrors.address = "Please enter an address.";
    }

    if (passwordDirty) {
      if (!hasMeaningfulText(passwordForm.nextPassword)) {
        nextErrors.nextPassword = "Please enter a new password.";
      } else if (!isStrongPassword(passwordForm.nextPassword)) {
        nextErrors.nextPassword =
          "Password must be at least 8 characters long and include both letters and numbers.";
      }

      if (!hasMeaningfulText(passwordForm.confirmPassword)) {
        nextErrors.confirmPassword = "Please confirm the new password.";
      } else if (passwordForm.nextPassword !== passwordForm.confirmPassword) {
        nextErrors.confirmPassword = "The two passwords must match.";
      }
    }

    setFieldErrors(nextErrors);
    return nextErrors;
  }

  async function persistChanges() {
    const trimmedAddress = String(draftProfile.address || "").trim();
    const shouldUpdateAddress = trimmedAddress !== String(originalProfile?.address || "").trim();
    const shouldUpdatePassword = passwordDirty;

    if (!shouldUpdateAddress && !shouldUpdatePassword) {
      setPageAlert(buildAlert("No changes", "There are no changes to save.", "error"));
      return;
    }

    setSaving(true);
    setPageAlert(null);
    setSaveError("");

    try {
      if (shouldUpdatePassword) {
        try {
          await updateOwnPassword(passwordForm.nextPassword);
        } catch (error) {
          const message = getErrorMessage(error, "Unable to update the password right now.");
          setSaveError(message);
          setPageAlert(buildAlert("Password update failed", message, "error"));
          return;
        }
      }

      if (shouldUpdateAddress) {
        try {
          await updateCollectionDoc("admin_staff", sessionProfile.id, {
            address: trimmedAddress,
          });
        } catch (error) {
          const message = getErrorMessage(error, "Unable to save the address right now.");

          if (shouldUpdatePassword) {
            setPageAlert(
              buildAlert(
                "Partial update",
                "Password updated successfully, but the address could not be saved.",
                "error",
              ),
            );
            resetPasswordState({ collapse: true });
            setConfirmModalOpen(false);
            return;
          }

          setPageAlert(buildAlert("Save failed", message, "error"));
          return;
        }
      }

      const nextProfile = {
        ...draftProfile,
        address: trimmedAddress,
      };

      setOriginalProfile(nextProfile);
      setDraftProfile(nextProfile);
      resetPasswordState({ collapse: true });
      setConfirmModalOpen(false);
      setPageAlert(
        buildAlert(
          "Profile updated successfully",
          shouldUpdatePassword && shouldUpdateAddress
            ? "Password and profile details were updated successfully."
            : shouldUpdatePassword
              ? "Password was updated successfully."
              : "Profile details were updated successfully.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveClick() {
    setPageAlert(null);
    setSaveError("");

    const nextErrors = validateBeforeSave();
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    if (passwordDirty) {
      setConfirmModalOpen(true);
      return;
    }

    await persistChanges();
  }

  async function handleConfirmPasswordSave() {
    await persistChanges();
  }

  if (loading) {
    return (
      <div className="staff-profile-page">
        <div className="staff-profile__empty">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="staff-profile-page">
      <section className={`staff-profile staff-profile--${roleVariant}`}>
        <header className="staff-profile__hero">
          <div className="staff-profile__heroAvatarShell">
            <div className={`staff-profile__heroAvatarLink staff-profile__heroAvatarLink--${roleVariant}`}>
              <div className={`staff-profile__heroAvatarFrame staff-profile__heroAvatarFrame--${roleVariant}`}>
                <span
                  className={`staff-profile__heroAvatarInitial staff-profile__heroAvatarInitial--${roleVariant}`}
                  aria-hidden="true"
                >
                  {profileInitial}
                </span>
              </div>
              <span className={`staff-profile__heroAvatarBadge staff-profile__heroAvatarBadge--${roleVariant}`}>
                {roleLabel}
              </span>
            </div>
          </div>

          <div className="staff-profile__heroText">
            <h1>{originalProfile?.name || `${roleLabel} account`}</h1>
            <span className={`staff-profile__roleBadge staff-profile__roleBadge--${roleVariant}`}>{roleBadge}</span>
          </div>
        </header>

        <section className="staff-profile__section">
          <div className="staff-profile__sectionHeader">
            <div className="staff-profile__sectionTitle">
              <UserRound size={24} strokeWidth={2} />
              <h2>Personal Information</h2>
            </div>
          </div>

          {renderAlert(pageAlert)}

          <div className="staff-profile__grid">
            <label className="staff-profile__field">
              <span>Full Name (name)</span>
              <input type="text" value={draftProfile.name} readOnly disabled />
            </label>

            <label className="staff-profile__field">
              <span>Date of Birth (date_of_birth)</span>
              <input type="text" value={formatDateDisplay(draftProfile.dateOfBirth)} readOnly disabled />
            </label>

            <label className="staff-profile__field staff-profile__field--full">
              <span>Address (address)</span>
              <input
                type="text"
                value={draftProfile.address}
                onChange={(event) =>
                  setDraftProfile((previous) => ({
                    ...previous,
                    address: event.target.value,
                  }))
                }
              />
              {renderFieldError(fieldErrors.address)}
            </label>

            <label className="staff-profile__field staff-profile__field--full">
              <span>Email Address (Cannot be changed)</span>
              <input type="text" value={draftProfile.email} readOnly disabled />
            </label>
          </div>
        </section>

        <section className="staff-profile__section">
          <div className="staff-profile__sectionHeader">
            <div className="staff-profile__sectionTitle">
              <LockKeyhole size={24} strokeWidth={2} />
              <h2>Security (Change Password)</h2>
            </div>

            <button
              className="staff-profile__toggleButton"
              type="button"
              aria-label={passwordExpanded ? "Hide password fields" : "Show password fields"}
              onClick={handleTogglePasswordSection}
            >
              {passwordExpanded ? <LockOpen size={22} strokeWidth={2.1} /> : <Lock size={22} strokeWidth={2.1} />}
            </button>
          </div>

          {passwordExpanded ? (
            <div className="staff-profile__grid">
              <label className="staff-profile__field">
                <span>New Password</span>
                <input
                  type="password"
                  value={passwordForm.nextPassword}
                  onChange={(event) =>
                    setPasswordForm((previous) => ({
                      ...previous,
                      nextPassword: event.target.value,
                    }))
                  }
                  placeholder="Enter a new password"
                />
                {renderFieldError(fieldErrors.nextPassword)}
              </label>

              <label className="staff-profile__field">
                <span>Confirm New Password</span>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(event) =>
                    setPasswordForm((previous) => ({
                      ...previous,
                      confirmPassword: event.target.value,
                    }))
                  }
                  placeholder="Re-enter the new password"
                />
                {renderFieldError(fieldErrors.confirmPassword)}
              </label>
            </div>
          ) : null}
        </section>

        <footer className="staff-profile__actions">
          <button className="staff-profile__logoutButton" type="button" onClick={handleLogout}>
            <LogOut size={18} strokeWidth={2.1} />
            <span>Log Out</span>
          </button>

          <div className="staff-profile__actionButtons">
            <button className="staff-profile__button staff-profile__button--ghost" type="button" onClick={handleCancel}>
              Cancel
            </button>
            <button className="staff-profile__button" type="button" onClick={handleSaveClick} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </footer>
      </section>

      {confirmModalOpen ? (
        <div className="staff-profile__modalOverlay" role="presentation">
          <div className="staff-profile__modal" role="dialog" aria-modal="true" aria-labelledby="staff-password-confirm-title">
            <div className="staff-profile__modalHeader">
              <h2 id="staff-password-confirm-title">Confirm Password Update</h2>
              <p>
                Changing the password will immediately update this {roleLabel.toLowerCase()} account. Do you want to
                continue?
              </p>
            </div>

            {saveError ? renderAlert(buildAlert("Save failed", saveError, "error")) : null}

            <div className="staff-profile__modalActions">
              <button
                className="staff-profile__button staff-profile__button--ghost"
                type="button"
                onClick={() => {
                  if (!saving) {
                    setConfirmModalOpen(false);
                    setSaveError("");
                  }
                }}
                disabled={saving}
              >
                Cancel
              </button>
              <button className="staff-profile__button" type="button" onClick={handleConfirmPasswordSave} disabled={saving}>
                {saving ? "Saving..." : "Confirm Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
