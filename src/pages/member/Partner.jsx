// This member page shows Partner content.
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "../pageStyles.css";
import "./Partner.css";
import PageLayout from "../../components/common/PageLayout";
import { useAuth } from "../../provider/AuthContext";
import { getCurrentMatchProfile, toggleMatchStatus, upsertMatchProfile } from "../../services/partnerService";
import { getFacilitySportTypes } from "../../services/bookingService";
import { ROUTE_PATHS } from "../../constants/routes";
import { getActionErrorMessage } from "../../utils/errors";
import { getAvatarIdForActor, getAvatarOptions, setStoredAvatarId } from "../../utils/avatar";
import { formatAvailabilityLabel, toTitleText } from "../../utils/presentation";
import { countMeaningfulCharacters, hasMeaningfulText } from "../../utils/text";

const DAY_OPTIONS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const PERIOD_OPTIONS = ["morning", "afternoon", "evening"];
const PARTNER_PAGE_TITLE = "Match Profile";
const PARTNER_PAGE_SUBTITLE =
  "Create your public profile to find sports partners. Your real name and contact details will remain strictly confidential.";

// Initialize an empty form state for a new partner profile
function createEmptyForm() {
  return {
    nickname: "",
    selfDescription: "",
    interests: [],
    availableTime: [],
  };
}

// Map a saved partner profile from the database into the local form state structure
function createFormFromProfile(profile) {
  if (!profile) {
    return createEmptyForm();
  }

  return {
    nickname: profile.nickname || "",
    selfDescription: profile.bio || "",
    interests: Array.isArray(profile.interestsRaw) ? [...profile.interestsRaw] : [],
    availableTime: Array.isArray(profile.availableTimeRaw) ? [...profile.availableTimeRaw] : [],
  };
}

// Generate the default draft state for a new availability entry
function createAvailabilityDraft() {
  return {
    day: DAY_OPTIONS[0],
    period: PERIOD_OPTIONS[0],
  };
}

// Validate the partner profile form, returning an object of field-specific error messages
function validatePartnerForm(form) {
  const errors = {};

  if (!hasMeaningfulText(form.nickname)) {
    errors.nickname = "Please enter a nickname.";
  }

  const selfDescriptionLength = countMeaningfulCharacters(form.selfDescription);
  if (!hasMeaningfulText(form.selfDescription)) {
    errors.selfDescription = "Please enter a short bio.";
  } else if (selfDescriptionLength > 150) {
    errors.selfDescription = "Short bio must be 150 characters or fewer.";
  }

  if (!Array.isArray(form.interests) || form.interests.length === 0) {
    errors.interests = "Please select at least one sports interest.";
  }

  if (!Array.isArray(form.availableTime) || form.availableTime.length === 0) {
    errors.availableTime = "Please add at least one availability option.";
  } else if (form.availableTime.length > 3) {
    errors.availableTime = "You can add up to 3 availability options.";
  } else {
    const availabilitySlots = form.availableTime.map((value) => String(value || "").trim()).filter(Boolean);
    if (new Set(availabilitySlots).size !== availabilitySlots.length) {
      errors.availableTime = "Availability options cannot repeat.";
    }
  }

  return errors;
}

// Check if a persisted profile contains all required fields to enable matching
function isPersistedProfileComplete(profile) {
  if (!profile) {
    return false;
  }

  return Boolean(
    hasMeaningfulText(profile.nickname) &&
      hasMeaningfulText(profile.bio) &&
      Array.isArray(profile.interestsRaw) &&
      profile.interestsRaw.length > 0 &&
      Array.isArray(profile.availableTimeRaw) &&
      profile.availableTimeRaw.length > 0,
  );
}

// Retrieve the source URL for the currently selected avatar
function getPreviewAvatar(avatarOptions, selectedAvatarId) {
  return (
    avatarOptions.find((option) => option.id === selectedAvatarId)?.src ||
    avatarOptions[0]?.src ||
    ""
  );
}

export default function Partner() {
  const { sessionProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  // Component states and hooks
  const avatarOptions = useMemo(() => getAvatarOptions(), []);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [originalMatchProfile, setOriginalMatchProfile] = useState(createEmptyForm);
  const [form, setForm] = useState(createEmptyForm);
  const [selectedAvatarId, setSelectedAvatarId] = useState(avatarOptions[0]?.id || "");
  const [sportTypeOptions, setSportTypeOptions] = useState([]);
  const [availabilityDraft, setAvailabilityDraft] = useState(createAvailabilityDraft);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  // Fetch the user's match profile and available sport types on component mount
  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setLoadError("");

    Promise.all([getCurrentMatchProfile(sessionProfile), getFacilitySportTypes()])
      .then(([profile, sportTypes]) => {
        if (cancelled) {
          return;
        }

        setSportTypeOptions(sportTypes);
        setSelectedAvatarId(
          getAvatarIdForActor(sessionProfile, profile?.nickname || sessionProfile?.name || "Member") ||
            avatarOptions[0]?.id ||
            "",
        );

        if (!profile) {
          const emptyForm = createEmptyForm();
          setEnabled(false);
          setOriginalMatchProfile(emptyForm);
          setForm(emptyForm);
          return;
        }

        const nextForm = createFormFromProfile(profile);
        setEnabled(Boolean(profile.openMatch));
        setOriginalMatchProfile(nextForm);
        setForm(nextForm);
      })
      .catch((profileLoadError) => {
        if (!cancelled) {
          setSportTypeOptions([]);
          setLoadError(
            getActionErrorMessage(profileLoadError, "partner.profile.load", "Unable to load your match profile right now."),
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [avatarOptions, sessionProfile]);

  // Check for redirected error messages (e.g., if the user tried to access Discover without an active profile)
  useEffect(() => {
    if (!location.state?.partnerError) {
      return;
    }

    setError(location.state.partnerError);
    setMessage("");
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  // --- Derived Data & Computed States ---
  const previewAvatar = getPreviewAvatar(avatarOptions, selectedAvatarId);
  const bioLength = countMeaningfulCharacters(form.selfDescription);
  const previewInterests = form.interests;
  const previewAvailability = form.availableTime.map((value) => formatAvailabilityLabel(value));

  // --- Event Handlers ---
  // Generic field update handler with specific length validation for the bio
  function updateField(key, value) {
    if (key === "selfDescription" && countMeaningfulCharacters(value) > 150) {
      setFieldErrors((previous) => ({
        ...previous,
        selfDescription: "Short bio must be 150 characters or fewer.",
      }));
      setError("");
      setMessage("");
      return;
    }

    setFieldErrors((previous) => ({ ...previous, [key]: "" }));
    setError("");
    setMessage("");
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  // Toggle a sport interest on or off in the form state
  function toggleInterest(value) {
    setFieldErrors((previous) => ({ ...previous, interests: "" }));
    setError("");
    setMessage("");
    setForm((previous) => {
      const exists = previous.interests.includes(value);
      return {
        ...previous,
        interests: exists
          ? previous.interests.filter((entry) => entry !== value)
          : [...previous.interests, value],
      };
    });
  }

  // Add the currently drafted availability option to the form, validating against duplicates and limits
  function addAvailabilityOption() {
    const nextValue = `${availabilityDraft.day}_${availabilityDraft.period}`;
    const hasExactDuplicate = form.availableTime.includes(nextValue);

    setError("");
    setMessage("");
    setFieldErrors((previous) => ({ ...previous, availableTime: "" }));

    if (form.availableTime.length >= 3) {
      setFieldErrors((previous) => ({
        ...previous,
        availableTime: "You can add up to 3 availability options.",
      }));
      return;
    }

    if (hasExactDuplicate) {
      setFieldErrors((previous) => ({
        ...previous,
        availableTime: "Availability options cannot repeat.",
      }));
      return;
    }

    setForm((previous) => ({
      ...previous,
      availableTime: [...previous.availableTime, nextValue],
    }));
  }

  // Remove a specific availability option from the form
  function removeAvailabilityOption(value) {
    setFieldErrors((previous) => ({ ...previous, availableTime: "" }));
    setError("");
    setMessage("");
    setForm((previous) => ({
      ...previous,
      availableTime: previous.availableTime.filter((entry) => entry !== value),
    }));
  }

  // Merge the current form state with the original profile to create the final payload
  function buildMergedMatchForm() {
    return {
      nickname: form.nickname ?? originalMatchProfile.nickname ?? "",
      selfDescription: form.selfDescription ?? originalMatchProfile.selfDescription ?? "",
      interests: Array.isArray(form.interests) ? form.interests : originalMatchProfile.interests || [],
      availableTime: Array.isArray(form.availableTime) ? form.availableTime : originalMatchProfile.availableTime || [],
    };
  }

  // Save the updated profile to the database
  async function handleSave() {
    const mergedForm = buildMergedMatchForm();
    const validationErrors = validatePartnerForm(mergedForm);
    setFieldErrors(validationErrors);
    setError("");
    setMessage("");

    if (Object.keys(validationErrors).length > 0) {
      setError("Please fix the highlighted profile fields before saving.");
      return;
    }

    try {
      await upsertMatchProfile(
        {
          nickname: mergedForm.nickname.trim(),
          open_match: enabled,
          interests: mergedForm.interests,
          self_description: mergedForm.selfDescription.trim(),
          available_time: mergedForm.availableTime,
        },
        sessionProfile,
      );

      const nextForm = {
        nickname: mergedForm.nickname.trim(),
        selfDescription: mergedForm.selfDescription.trim(),
        interests: [...mergedForm.interests],
        availableTime: [...mergedForm.availableTime],
      };
      setOriginalMatchProfile(nextForm);
      setForm(nextForm);
      setMessage("Profile saved successfully.");
    } catch (saveError) {
      setError(getActionErrorMessage(saveError, "partner.profile.save", "Unable to save the profile."));
    }
  }

  // Toggle the "Enable Partner Matching" status, ensuring the profile is complete first
  async function handleToggleMatching() {
    setError("");
    setMessage("");

    if (!enabled) {
      try {
        const persistedProfile = await getCurrentMatchProfile(sessionProfile);

        if (!isPersistedProfileComplete(persistedProfile)) {
          setError("Please complete your profile first.");
          return;
        }
      } catch (loadError) {
        setError(getActionErrorMessage(loadError, "partner.profile.load", "Unable to verify the saved profile."));
        return;
      }
    }

    try {
      const nextValue = !enabled;
      await toggleMatchStatus({ open_match: nextValue }, sessionProfile);
      setEnabled(nextValue);
      setMessage(nextValue ? "Partner matching enabled." : "Partner matching disabled.");
    } catch (toggleError) {
      setError(getActionErrorMessage(toggleError, "partner.profile.toggle", "Unable to update the matching status."));
    }
  }

  // Navigate to the Discover page to view partner recommendations
  function handleViewRecommendations() {
    if (!enabled) {
      setError("Please complete your profile and enable matching first.");
      setMessage("");
      return;
    }

    navigate(ROUTE_PATHS.PARTNER_DISCOVER);
  }


  if (loading) {
    return (
      <PageLayout
        className="partner-page"
        title={PARTNER_PAGE_TITLE}
        subtitle={PARTNER_PAGE_SUBTITLE}
      >
        <article className="partner-card partner-card--loading">
          <p>Loading match profile...</p>
        </article>
      </PageLayout>
    );
  }

  if (loadError) {
    return (
      <PageLayout
        className="partner-page"
        title={PARTNER_PAGE_TITLE}
        subtitle={PARTNER_PAGE_SUBTITLE}
      >
        <article className="partner-card partner-card--loading">
          <div className="errorMessage partner-card__message">{loadError}</div>
        </article>
      </PageLayout>
    );
  }

  /*********************************************************************************** */
  // Main Rendering-
  return (
    <PageLayout
      className="partner-page"
      title={PARTNER_PAGE_TITLE}
      subtitle={PARTNER_PAGE_SUBTITLE}
    >
      <div className="partner-page__layout">
        {/* Left column: Profile Editor */}
        <article className="partner-card partner-card--editor">
          {/* Toggle switch for enabling/disabling partner matching */}
          <div className="partner-card__toggleRow">
            <div>
              <h2>Enable Partner Matching</h2>
              <p>Turn on to appear in the Discover list and find partners.</p>
            </div>
            <button
              aria-label={enabled ? "Disable partner matching" : "Enable partner matching"}
              aria-pressed={enabled}
              className={`partner-switch ${enabled ? "partner-switch--active" : ""}`}
              onClick={handleToggleMatching}
              type="button"
            >
              <span />
            </button>
          </div>

          <div className="partner-card__divider" />

          {error ? <div className="errorMessage partner-card__message">{error}</div> : null}
          {message ? <div className="successMessage partner-card__message">{message}</div> : null}

          {/* Avatar selection section */}
          <div className="partner-avatarSection">
            <div className="partner-avatarSection__circle">
              {previewAvatar ? <img alt={form.nickname || "Profile avatar"} src={previewAvatar} /> : null}
            </div>
            <button
              className="btn-secondary partner-avatarSection__button"
              onClick={() => setAvatarPickerOpen((value) => !value)}
              type="button"
            >
              Change Avatar
            </button>
            {avatarPickerOpen ? (
              <div className="partner-avatarGrid">
                {avatarOptions.map((option) => (
                  <button
                    key={option.id}
                    className={`partner-avatarOption ${selectedAvatarId === option.id ? "partner-avatarOption--active" : ""}`}
                    onClick={() => {
                      setStoredAvatarId(sessionProfile, option.id);
                      setSelectedAvatarId(option.id);
                    }}
                    type="button"
                  >
                    <img alt={option.label} src={option.src} />
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* Basic information fields (Nickname, Bio) */}
          <div className="partner-formField">
            <label htmlFor="partner-nickname">Display Nickname</label>
            <input
              id="partner-nickname"
              onChange={(event) => updateField("nickname", event.target.value)}
              placeholder="Sportster"
              value={form.nickname}
            />
            {fieldErrors.nickname ? <p className="partner-formField__error">{fieldErrors.nickname}</p> : null}
          </div>

          <div className="partner-formField">
            <div className="partner-formField__head">
              <label htmlFor="partner-bio">Short Bio</label>
              <span className={bioLength > 150 ? "partner-counter partner-counter--error" : "partner-counter"}>
                {bioLength}/150
              </span>
            </div>
            <textarea
              id="partner-bio"
              onChange={(event) => updateField("selfDescription", event.target.value)}
              placeholder="Intermediate player looking for weekend matches to stay fit."
              value={form.selfDescription}
            />
            {fieldErrors.selfDescription ? (
              <p className="partner-formField__error">{fieldErrors.selfDescription}</p>
            ) : null}
          </div>

          {/* Sports interests multi-select */}
          <div className="partner-formField">
            <label>Sports Interests</label>
            <div className="partner-interestList">
              {sportTypeOptions.map((option) => (
                <button
                  key={option}
                  className={`partner-interestButton ${form.interests.includes(option) ? "partner-interestButton--active" : ""}`}
                  onClick={() => toggleInterest(option)}
                  type="button"
                >
                  {option}
                </button>
              ))}
            </div>
            {fieldErrors.interests ? <p className="partner-formField__error">{fieldErrors.interests}</p> : null}
          </div>

          {/* Availability time slot builder */}
          <div className="partner-formField">
            <div className="partner-formField__head">
              <label>Availability</label>
              <span className="partner-counter">(Max 3 options)</span>
            </div>

            <div className="partner-availabilityControls">
              <select
                onChange={(event) =>
                  setAvailabilityDraft((previous) => ({ ...previous, day: event.target.value }))
                }
                value={availabilityDraft.day}
              >
                {DAY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {toTitleText(option)}
                  </option>
                ))}
              </select>
              <select
                onChange={(event) =>
                  setAvailabilityDraft((previous) => ({ ...previous, period: event.target.value }))
                }
                value={availabilityDraft.period}
              >
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {toTitleText(option)}
                  </option>
                ))}
              </select>
              <button className="partner-addOption" onClick={addAvailabilityOption} type="button">
                + 
              </button>
            </div>

            {form.availableTime.length ? (
              <div className="partner-availabilityList">
                <label>Selected availability:</label>
                {form.availableTime.map((entry) => (
                  <div key={entry} className="partner-availabilityItem">
                    <span>{formatAvailabilityLabel(entry)}</span>
                    <button onClick={() => removeAvailabilityOption(entry)} type="button">
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {fieldErrors.availableTime ? (
              <p className="partner-formField__error">{fieldErrors.availableTime}</p>
            ) : null}
          </div>

          <div className="partner-card__actions">
            <button className="btn" onClick={handleSave} type="button">
              Save Profile
            </button>
          </div>
        </article>

        {/*  Live Preview Sidebar in the right panel*/}
        <aside className="partner-sidebar">
          <div className="partner-previewHeader">
            <button
              aria-label={previewOpen ? "Hide live preview" : "Show live preview"}
              aria-pressed={previewOpen}
              className="partner-previewHeader__toggle"
              onClick={() => setPreviewOpen((value) => !value)}
              type="button"
            >
              <svg fill="none" height="18" viewBox="0 0 24 24" width="18" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M2 12C4.8 7.6 8.05 5.4 12 5.4C15.95 5.4 19.2 7.6 22 12C19.2 16.4 15.95 18.6 12 18.6C8.05 18.6 4.8 16.4 2 12Z"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                />
                <circle cx="12" cy="12" r="3.3" stroke="currentColor" strokeWidth="1.8" />
                {previewOpen ? null : (
                  <path
                    d="M4.5 19.5L19.5 4.5"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                )}
              </svg>
            </button>
            <span>Live Preview</span>
          </div>

          {previewOpen ? (
            <article className="partner-previewCard">
              <div className="partner-previewCard__identity">
                <img alt={form.nickname || "Preview avatar"} src={previewAvatar} />
                <div>
                  <h3>{hasMeaningfulText(form.nickname) ? form.nickname.trim() : "Your nickname"}</h3>
                  {enabled ? <span className="partner-previewCard__badge">Match Ready</span> : null}
                </div>
              </div>

              <p className="partner-previewCard__bio">
                {hasMeaningfulText(form.selfDescription)
                  ? form.selfDescription.trim()
                  : "Your live profile preview will appear here once you start editing."}
              </p>

              <div className="partner-previewCard__section">
                <p className="partner-previewCard__label">Interests</p>
                <div className="partner-previewCard__tags">
                  {previewInterests.length ? (
                    previewInterests.map((entry) => (
                      <span key={entry} className="partner-previewCard__tag">
                        {entry}
                      </span>
                    ))
                  ) : (
                    <span className="partner-previewCard__empty">No interests selected yet.</span>
                  )}
                </div>
              </div>

              <div className="partner-previewCard__section">
                <p className="partner-previewCard__label">Availability</p>
                {previewAvailability.length ? (
                  <div className="partner-previewCard__availability">
                    {previewAvailability.map((entry) => (
                      <span key={entry}>{entry}</span>
                    ))}
                  </div>
                ) : (
                  <span className="partner-previewCard__empty">No availability selected yet.</span>
                )}
              </div>
            </article>
          ) : (
            <article className="partner-previewPlaceholder">
              <p>Turn on the eye icon to preview how your profile card will look in real time.</p>
            </article>
          )}

          <button className="btn partner-sidebar__cta" onClick={handleViewRecommendations} type="button">
            View Recommendations
          </button>
        </aside>
      </div>
    </PageLayout>
  );
}
