import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "../pageStyles.css";
import { useAuth } from "../../provider/AuthContext";
import { getCurrentMatchProfile, saveMatchProfile, toggleMatchStatus } from "../../services/partnerService";
import { getErrorMessage } from "../../utils/errors";

const timeOptions = [
  "monday_morning",
  "monday_afternoon",
  "monday_evening",
  "tuesday_morning",
  "tuesday_afternoon",
  "tuesday_evening",
  "wednesday_morning",
  "wednesday_afternoon",
  "wednesday_evening",
  "thursday_morning",
  "thursday_afternoon",
  "thursday_evening",
  "friday_morning",
  "friday_afternoon",
  "friday_evening",
  "saturday_morning",
  "saturday_afternoon",
  "saturday_evening",
  "sunday_morning",
  "sunday_afternoon",
  "sunday_evening",
];

const interestOptions = ["badminton", "basketball", "swimming", "soccer", "table_tennis", "tennis", "gym", "cycling", "yoga", "pilates", "running", "volleyball"];

function formatOptionLabel(value) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function Partner() {
  const { sessionProfile } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    nickname: "",
    level: "Intermediate",
    about: "",
    availableTime: [],
    interests: [],
  });

  useEffect(() => {
    getCurrentMatchProfile(sessionProfile)
      .then((profile) => {
        if (!profile) {
          return;
        }

        setEnabled(Boolean(profile.openMatch));
        setForm({
          nickname: profile.nickname || "",
          level: profile.level || "Intermediate",
          about: profile.bio || "",
          availableTime: profile.availableTimeRaw || [],
          interests: profile.interestsRaw || [],
        });
      })
      .catch(() => null);
  }, [sessionProfile]);

  const isComplete = useMemo(() => {
    return form.nickname.trim() && form.about.trim() && form.availableTime.length > 0 && form.interests.length > 0;
  }, [form]);

  const toggleArrayValue = (key, value) => {
    setForm((prev) => {
      const exists = prev[key].includes(value);
      return {
        ...prev,
        [key]: exists ? prev[key].filter((item) => item !== value) : [...prev[key], value],
      };
    });
  };

  const handleSave = async () => {
    setError("");
    setMessage("");

    if (!isComplete) {
      setError("Please complete nickname, interests, available time, and profile text before saving.");
      return;
    }

    try {
      await saveMatchProfile(
        {
          nickname: form.nickname.trim(),
          interests: form.interests,
          level: form.level,
          self_description: form.about.trim(),
          available_time: form.availableTime,
        },
        sessionProfile,
      );
      setEnabled(true);
      setMessage("Partner profile saved and matching is enabled.");
    } catch (saveError) {
      setError(getErrorMessage(saveError, "Unable to save the partner profile."));
    }
  };

  const handleToggle = async () => {
    setError("");
    setMessage("");

    try {
      const next = !enabled;
      await toggleMatchStatus(next, sessionProfile);
      setEnabled(next);
      setMessage(next ? "Matching has been enabled." : "Matching has been paused and pending incoming requests were invalidated.");
    } catch (toggleError) {
      setError(getErrorMessage(toggleError, "Unable to change the matching status."));
    }
  };

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <h1>Partner profile</h1>
          <p>Create or update your matching profile, then open or close matching without exposing your private member information.</p>
        </div>
        <div className="hero-actions">
          <Link className="btn-secondary" to="/partner/discover">Discover partners</Link>
          <Link className="btn-secondary" to="/partner/requests">View requests</Link>
        </div>
      </section>

      <div className="split-layout">
        <article className="form-card">
          <h2>Profile details</h2>
          {error && <p className="errorMessage">{error}</p>}
          {message && <p className="successMessage">{message}</p>}
          <div className="field-grid" style={{ marginTop: 18 }}>
            <div className="field-span">
              <label>Nickname</label>
              <input value={form.nickname} onChange={(event) => setForm((prev) => ({ ...prev, nickname: event.target.value }))} />
            </div>
            <div>
              <label>Level</label>
              <select value={form.level} onChange={(event) => setForm((prev) => ({ ...prev, level: event.target.value }))}>
                <option>Beginner</option>
                <option>Intermediate</option>
                <option>Advanced</option>
              </select>
            </div>
            <div className="field-span">
              <label>About me</label>
              <textarea value={form.about} onChange={(event) => setForm((prev) => ({ ...prev, about: event.target.value }))} />
            </div>
            <div className="field-span">
              <label>Interests</label>
              <div className="tags-row" style={{ marginTop: 10 }}>
                {interestOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`tag ${form.interests.includes(option) ? "tag-active" : ""}`}
                    onClick={() => toggleArrayValue("interests", option)}
                  >
                    {formatOptionLabel(option)}
                  </button>
                ))}
              </div>
            </div>
            <div className="field-span">
              <label>Available time</label>
              <div className="tags-row" style={{ marginTop: 10 }}>
                {timeOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`tag ${form.availableTime.includes(option) ? "tag-active" : ""}`}
                    onClick={() => toggleArrayValue("availableTime", option)}
                  >
                    {formatOptionLabel(option)}
                  </button>
                ))}
              </div>
            </div>
            <div className="field-span form-actions">
              <button className="btn" type="button" onClick={handleSave}>Save profile</button>
            </div>
          </div>
        </article>

        <article className="detail-card">
          <h2>Matching status</h2>
          <p style={{ marginBottom: 18 }}>
            Turn matching on or off without deleting your saved profile. When you close matching, pending incoming requests are automatically invalidated.
          </p>
          <button className={enabled ? "btn" : "btn-secondary"} onClick={handleToggle} type="button">
            {enabled ? "Matching is active" : "Matching is paused"}
          </button>
        </article>
      </div>
    </div>
  );
}
