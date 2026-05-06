import { useEffect, useRef, useState } from "react";
import { LogOut, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../provider/AuthContext";
import { ROUTE_PATHS } from "../../constants/routes";
import { getActionErrorMessage } from "../../utils/errors";
import { formatDateOnly, formatDateTimeDisplay, toDateInputValue } from "../../utils/dateFields";
import { hasMeaningfulText } from "../../utils/text";
import { getDocById, updateCollectionDoc } from "../../services/firestoreService";
import ConfirmDialog from "../common/ConfirmDialog";
import PasswordChangePanel from "./PasswordChangePanel";

function normalizeProfile(record = {}, fallback = {}) {
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
    id: record.id || fallback.id || "",
    name: record.name || fallback.name || "",
    dateOfBirth: toDateInputValue(rawDateOfBirth),
    address: record.address || fallback.address || "",
    email: record.email || fallback.email || "",
    role: String(record.role || fallback.role || "staff"),
    createdAt: rawCreatedAt,
  };
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
  const passwordPanelRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [pageAlert, setPageAlert] = useState(null);
  const [originalProfile, setOriginalProfile] = useState(null);
  const [draftProfile, setDraftProfile] = useState({
    name: "",
    dateOfBirth: "",
    address: "",
    email: "",
    role: roleVariant,
    createdAt: "",
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
              getActionErrorMessage(error, "profile.load", "Unable to load the latest profile details."),
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

  const profileInitial =
    String(originalProfile?.name || sessionProfile?.name || roleLabel).trim().charAt(0).toUpperCase() ||
    roleLabel.charAt(0).toUpperCase();

  const roleBadge = String(roleLabel || originalProfile?.role || draftProfile.role || roleVariant).toUpperCase();

  function handleCancel() {
    if (originalProfile) {
      setDraftProfile(originalProfile);
    }
    passwordPanelRef.current?.reset({ collapse: true });
    setFieldErrors({});
    setPageAlert(null);
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

    const passwordResult = passwordPanelRef.current?.validate({ requirePassword: false }) ?? {
      dirty: false,
      errors: {},
      valid: true,
    };

    setFieldErrors(nextErrors);
    return {
      passwordDirty: passwordResult.dirty,
      valid: Object.keys(nextErrors).length === 0 && passwordResult.valid,
    };
  }

  async function persistChanges() {
    const trimmedAddress = String(draftProfile.address || "").trim();
    const shouldUpdateAddress = trimmedAddress !== String(originalProfile?.address || "").trim();
    const shouldUpdatePassword = Boolean(passwordPanelRef.current?.hasPasswordChange());

    if (!shouldUpdateAddress && !shouldUpdatePassword) {
      if (originalProfile) {
        setDraftProfile(originalProfile);
      }
      passwordPanelRef.current?.reset({ collapse: true });
      setConfirmModalOpen(false);
      setPageAlert(buildAlert("Profile already up to date", "Your profile details are already saved."));
      return;
    }

    setSaving(true);
    setPageAlert(null);

    try {
      if (shouldUpdatePassword) {
        try {
          await passwordPanelRef.current?.savePassword();
        } catch (error) {
          const message = getActionErrorMessage(error, "password.update", "Unable to update the password right now.");
          setConfirmModalOpen(false);
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
          const message = getActionErrorMessage(error, "profile.save", "Unable to save the address right now.");

          if (shouldUpdatePassword) {
            setPageAlert(
              buildAlert(
                "Partial update",
                "Password updated successfully, but the address could not be saved.",
                "error",
              ),
            );
            passwordPanelRef.current?.reset({ collapse: true });
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
      passwordPanelRef.current?.reset({ collapse: true });
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

    const validation = validateBeforeSave();
    if (!validation.valid) {
      return;
    }

    if (validation.passwordDirty) {
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
              <UserRound size={20} strokeWidth={2} />
              <h2>Personal Information</h2>
            </div>
          </div>

          {renderAlert(pageAlert)}

          <div className="staff-profile__grid">
            <label className="staff-profile__field">
              <span>Full Name</span>
              <input type="text" value={draftProfile.name} readOnly disabled />
            </label>

            <label className="staff-profile__field">
              <span>Date of Birth</span>
              <input type="text" value={formatDateOnly(draftProfile.dateOfBirth)} readOnly disabled />
            </label>


            <label className="staff-profile__field">
              <span>Email Address</span>
              <input type="text" value={draftProfile.email} readOnly disabled />
            </label>

            <label className="staff-profile__field">
              <span>Join Date</span>
              <input
                type="text"
                value={formatDateTimeDisplay(draftProfile.createdAt, "Not available", { includeTime: false })}
                readOnly
                disabled
              />
            </label>

            <label className="staff-profile__field staff-profile__field--full">
              <span>Address</span>
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

          </div>
        </section>

        <PasswordChangePanel ref={passwordPanelRef} disabled={saving} />

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

      <ConfirmDialog
        open={confirmModalOpen}
        title="Confirm Password Update"
        description={`Changing the password will immediately update this ${roleLabel.toLowerCase()} account. Do you want to continue?`}
        confirmLabel="Confirm Save"
        cancelLabel="Cancel"
        pending={saving}
        onCancel={() => {
          if (!saving) {
            setConfirmModalOpen(false);
          }
        }}
        onConfirm={handleConfirmPasswordSave}
      />
    </div>
  );
}
