import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import "../pageStyles.css";
import "./BookingNew.css";
import { useAuth } from "../../provider/AuthContext";
import {
  getFacilityById,
  getFacilityDateBounds,
  submitBookingRequest,
} from "../../services/bookingService";
import { isFacilityBookable } from "../../services/centreService";
import { getCurrentMatchProfile, getFriendProfiles } from "../../services/partnerService";
import { ROUTE_PATHS, getFacilityDetailRoute } from "../../constants/routes";
import { getErrorCode, getErrorMessage } from "../../utils/errors";
import { displayStatus, statusTone } from "../../utils/presentation";
import { hasMeaningfulText } from "../../utils/text";

function parseSlot(slot = "") {
  const parts = String(slot).split(" - ");
  return {
    start: parts[0] || "",
    end: parts[1] || "",
  };
}

function clampDateToBounds(date, bounds) {
  if (!date) {
    return bounds.defaultDate || "";
  }
  if (bounds.minDate && date < bounds.minDate) {
    return bounds.defaultDate || bounds.minDate;
  }
  if (bounds.maxDate && date > bounds.maxDate) {
    return bounds.defaultDate || bounds.maxDate;
  }
  return date;
}

function summarizeSelectedFriends(items = []) {
  if (!items.length) {
    return "Select partners...";
  }
  if (items.length === 1) {
    return items[0].nickname || items[0].name || "1 partner selected";
  }
  if (items.length === 2) {
    return `${items[0].nickname || items[0].name}, ${items[1].nickname || items[1].name}`;
  }
  return `${items[0].nickname || items[0].name}, ${items[1].nickname || items[1].name} +${items.length - 2} more`;
}

function mapBookingSubmitError(error) {
  const code = getErrorCode(error);
  if (code === "invalid-argument") {
    return "The selected friends exceed the total attendee count.";
  }
  if (code === "resource-exhausted") {
    return "The selected time slot is no longer available. Please choose another 1-hour slot.";
  }
  if (code === "failed-precondition") {
    return "You already have a booking in this time period.";
  }
  return getErrorMessage(error, "Unable to submit the booking request.");
}

function parseGuidelines(value = "") {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || "").trim()).filter(Boolean);
  }

  return String(value || "")
    .split(/\r?\n|[•]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getFriendMeta(friend) {
  const sport = friend.sport || "Sports";
  const firstAvailability = Array.isArray(friend.availability) ? friend.availability[0] : "";
  return firstAvailability ? `${sport} · ${firstAvailability}` : sport;
}

export default function BookingNew() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { sessionProfile } = useAuth();
  const inviteRef = useRef(null);

  const requestedFacilityId = params.get("facility") || "";
  const requestedDate = params.get("date") || "";

  const [dateBounds, setDateBounds] = useState({
    minDate: "",
    maxDate: "",
    defaultDate: "",
  });
  const [facility, setFacility] = useState(null);
  const [friends, setFriends] = useState([]);
  const [matchProfile, setMatchProfile] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState({
    date: requestedDate || "",
    startTime: "",
    attendees: "",
    activityDescription: "",
    invitedPartners: [],
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    getFacilityDateBounds()
      .then((bounds) => {
        if (cancelled) {
          return;
        }

        setDateBounds(bounds);
        setForm((previous) => ({
          ...previous,
          date: clampDateToBounds(previous.date || requestedDate, bounds),
        }));
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        const today = new Date().toISOString().slice(0, 10);
        const fallbackBounds = {
          minDate: today,
          maxDate: today,
          defaultDate: today,
        };

        setDateBounds(fallbackBounds);
        setForm((previous) => ({
          ...previous,
          date: clampDateToBounds(previous.date || requestedDate || today, fallbackBounds),
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [requestedDate]);

  useEffect(() => {
    if (!requestedFacilityId || !form.date) {
      setFacility(null);
      return undefined;
    }

    let cancelled = false;

    async function loadFacility() {
      try {
        const nextFacility = await getFacilityById(requestedFacilityId, form.date);
        if (cancelled) {
          return;
        }

        setFacility(nextFacility);
        setForm((previous) => {
          const capacity = Math.max(Number(nextFacility?.capacity || 0), 1);
          const attendeeCount = Number(previous.attendees) || 0;
          const safeAttendees =
            previous.attendees === "" ? "" : String(Math.min(Math.max(attendeeCount, 1), capacity));
          const maxInvites = Math.max((Number(safeAttendees) || 0) - 1, 0);
          const stillValidStart = (nextFacility?.availableSlots || [])
            .map((slot) => parseSlot(slot).start)
            .includes(previous.startTime);

          return {
            ...previous,
            startTime: stillValidStart ? previous.startTime : "",
            attendees: safeAttendees,
            invitedPartners: previous.invitedPartners.slice(0, maxInvites),
          };
        });
      } catch (loadError) {
        if (!cancelled) {
          setFacility(null);
          setError(getErrorMessage(loadError, "Unable to load available facilities."));
        }
      }
    }

    loadFacility();
    return () => {
      cancelled = true;
    };
  }, [form.date, requestedFacilityId]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      getCurrentMatchProfile(sessionProfile).catch(() => null),
      getFriendProfiles(sessionProfile).catch(() => []),
    ]).then(([profile, items]) => {
      if (cancelled) {
        return;
      }

      setMatchProfile(profile);
      setFriends(items.filter((item) => String(item.status || "").toLowerCase() === "active"));
    });

    return () => {
      cancelled = true;
    };
  }, [sessionProfile]);

  useEffect(() => {
    if (!inviteOpen) {
      return undefined;
    }

    function handleClickOutside(event) {
      if (!inviteRef.current?.contains(event.target)) {
        setInviteOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setInviteOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [inviteOpen]);

  const slotOptions = useMemo(() => {
    if (!facility || !isFacilityBookable(facility.status)) {
      return [];
    }

    return (facility.availableSlots || [])
      .map((slot) => parseSlot(slot))
      .filter((slot) => slot.start && slot.end);
  }, [facility]);

  const startOptions = useMemo(() => slotOptions.map((slot) => slot.start), [slotOptions]);
  const normalizedStartTime = startOptions.includes(form.startTime) ? form.startTime : "";

  const normalizedEndTime = useMemo(() => {
    return slotOptions.find((slot) => slot.start === normalizedStartTime)?.end || "";
  }, [normalizedStartTime, slotOptions]);

  const attendeeCount = Math.max(Number(form.attendees) || 0, 0);
  const maxInvites = Math.max(attendeeCount - 1, 0);
  const remainingFriendSlots = Math.max(maxInvites - form.invitedPartners.length, 0);
  const matchingEnabled = Boolean(matchProfile?.openMatch);
  const inviteDisabledReason = !matchingEnabled
    ? "Enable matching on the Partner page before inviting friends."
    : !friends.length
      ? "You need at least one accepted friend before inviting partners."
      : attendeeCount <= 1
        ? "Increase total attendees above 1 to invite partners."
        : "";

  const selectedFriends = useMemo(() => {
    const selectedIds = new Set(form.invitedPartners);
    return friends.filter((friend) => selectedIds.has(friend.id));
  }, [form.invitedPartners, friends]);

  const ruleItems = useMemo(() => {
    const baseRules = ["Booking duration is fixed to 1 hour."];
    if (facility?.capacity) {
      baseRules.push(`Total attendees cannot exceed ${facility.capacity}.`);
    }
    return [...baseRules, ...parseGuidelines(facility?.usageGuidelines)].filter(Boolean);
  }, [facility]);

  function setFormValue(key, value) {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }));
    setError("");
  }

  function handleFriendToggle(friendId) {
    const active = form.invitedPartners.includes(friendId);
    if (!active && form.invitedPartners.length >= maxInvites) {
      setError("You cannot invite more friends because the attendee limit has already been reached.");
      return;
    }

    setError("");
    setForm((previous) => ({
      ...previous,
      invitedPartners: active
        ? previous.invitedPartners.filter((item) => item !== friendId)
        : [...previous.invitedPartners, friendId],
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!facility?.id) {
      setError("Please open this page from a facility card or facility detail page before submitting.");
      return;
    }
    if (!form.date) {
      setError("Please choose a booking date before submitting the request.");
      return;
    }
    if (
      dateBounds.minDate &&
      dateBounds.maxDate &&
      (form.date < dateBounds.minDate || form.date > dateBounds.maxDate)
    ) {
      setError("Booking dates must stay within the visible booking date range.");
      return;
    }
    if (!normalizedStartTime || !normalizedEndTime) {
      setError("Please choose an available 1-hour time slot before submitting.");
      return;
    }
    if (!facility) {
      setError("The selected facility is no longer available. Please go back and choose another facility.");
      return;
    }
    if (!isFacilityBookable(facility.status)) {
      setError(`This facility is currently ${displayStatus(facility.status)} and cannot be booked.`);
      return;
    }
    if (attendeeCount < 1) {
      setError("Total attendees must be at least 1.");
      return;
    }
    if (attendeeCount > Number(facility.capacity || 1)) {
      setError(`Total attendees cannot exceed this facility's capacity of ${facility.capacity}.`);
      return;
    }
    if (form.invitedPartners.length > attendeeCount - 1) {
      setError("The attendee count must include yourself and every invited friend.");
      return;
    }
    if (!hasMeaningfulText(form.activityDescription)) {
      setError("Please enter a short activity description before submitting the booking request.");
      return;
    }

    setSubmitting(true);
    try {
      await submitBookingRequest(
        {
          facility_id: facility.id,
          date: form.date,
          start_time: normalizedStartTime,
          end_time: normalizedEndTime,
          attendent: attendeeCount,
          activity_description: form.activityDescription.trim(),
          user_id_list: form.invitedPartners,
        },
        sessionProfile,
      );
      navigate(ROUTE_PATHS.BOOKINGS);
    } catch (submitError) {
      setError(mapBookingSubmitError(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="booking-new-page">
      <button
        className="booking-new__back"
        type="button"
        onClick={() =>
          navigate(requestedFacilityId ? getFacilityDetailRoute(requestedFacilityId) : ROUTE_PATHS.FACILITIES)
        }
      >
        Back to Details
      </button>

      <section className="booking-new__intro">
        <h1>New Booking</h1>
        <p>Fill in the request details for your selected facility</p>
      </section>

      {error ? (
        <section className="booking-new__alert booking-new__alert--error">
          <strong>Unable to continue</strong>
          <p>{error}</p>
        </section>
      ) : null}

      <div className="booking-new__layout">
        <form className="booking-new__card booking-new__card--form" onSubmit={handleSubmit}>
          <div className="booking-new__summary">
            <div className="booking-new__summaryText">
              <h2>{facility?.name || "Selected Facility"}</h2>
              <p>{facility?.sportType || "Facility type will appear here"}</p>
            </div>

            {facility ? (
              <div className="booking-new__summaryPills">
                <span className={`status-pill ${statusTone(facility.status)}`}>{displayStatus(facility.status)}</span>
                <span className="booking-new__capacityPill">Capacity: Max {facility.capacity}</span>
              </div>
            ) : null}
          </div>

          {!isFacilityBookable(facility?.status || "") && facility ? (
            <div className="booking-new__inlineAlert booking-new__inlineAlert--warning">
              This facility is currently <strong>{displayStatus(facility.status)}</strong> and cannot be booked.
            </div>
          ) : null}

          <div className="booking-new__grid">
            <div className="booking-new__field">
              <label htmlFor="booking-date">Booking Date *</label>
              <input
                id="booking-date"
                type="date"
                value={form.date}
                min={dateBounds.minDate}
                max={dateBounds.maxDate}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    date: event.target.value,
                    startTime: "",
                  }))
                }
              />
            </div>

            <div className="booking-new__field">
              <label htmlFor="booking-attendees">
                Total Attendees <span className="booking-new__labelNote">(You + Partners + Offline Friends)</span> *
              </label>
              <input
                id="booking-attendees"
                type="number"
                min="1"
                max={facility?.capacity || 1}
                placeholder={facility?.capacity ? `Max ${facility.capacity}` : "Enter attendees"}
                value={form.attendees}
                onChange={(event) => {
                  const rawValue = event.target.value;
                  setForm((previous) => {
                    if (rawValue === "") {
                      return {
                        ...previous,
                        attendees: "",
                        invitedPartners: [],
                      };
                    }

                    const cap = Math.max(Number(facility?.capacity || 1), 1);
                    const nextAttendees = Math.min(Math.max(Number(rawValue) || 1, 1), cap);
                    return {
                      ...previous,
                      attendees: String(nextAttendees),
                      invitedPartners: previous.invitedPartners.slice(0, Math.max(nextAttendees - 1, 0)),
                    };
                  });
                  setError("");
                }}
              />
            </div>

            <div className="booking-new__field">
              <label htmlFor="booking-start-time">Start Time *</label>
              <select
                id="booking-start-time"
                value={normalizedStartTime}
                disabled={!facility || !isFacilityBookable(facility.status) || !startOptions.length}
                onChange={(event) => setFormValue("startTime", event.target.value)}
              >
                <option value="">Select start time</option>
                {startOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="booking-new__field">
              <label htmlFor="booking-end-time">End Time *</label>
              <input
                id="booking-end-time"
                value={normalizedEndTime}
                placeholder="Please select start time first"
                disabled
                readOnly
              />
            </div>

            <div className="booking-new__field booking-new__field--full" ref={inviteRef}>
              <label htmlFor="booking-invite-button">
                Invite Partners <span className="booking-new__labelNote">(They will receive a notification)</span>
              </label>
              <button
                id="booking-invite-button"
                className={`booking-new__inviteTrigger${inviteOpen ? " is-open" : ""}`}
                type="button"
                disabled={Boolean(inviteDisabledReason)}
                aria-expanded={inviteOpen}
                onClick={() => setInviteOpen((previous) => !previous)}
              >
                <span>{summarizeSelectedFriends(selectedFriends)}</span>
                <span className="booking-new__inviteCaret" aria-hidden="true">
                  {inviteOpen ? "▲" : "▼"}
                </span>
              </button>

              {inviteOpen && !inviteDisabledReason ? (
                <div className="booking-new__invitePanel">
                  <div className="booking-new__inviteHeader">
                    <strong>Matched Friends</strong>
                    <span>{selectedFriends.length} selected</span>
                  </div>
                  <div className="booking-new__inviteList">
                    {friends.map((friend) => {
                      const active = form.invitedPartners.includes(friend.id);
                      const disabled = !active && form.invitedPartners.length >= maxInvites;
                      return (
                        <label
                          key={friend.id}
                          className={`booking-new__inviteOption${active ? " is-selected" : ""}${disabled ? " is-disabled" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={active}
                            disabled={disabled}
                            onChange={() => handleFriendToggle(friend.id)}
                          />
                          <div>
                            <strong>{friend.nickname || friend.name}</strong>
                            <span>{getFriendMeta(friend)}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <p className="booking-new__fieldHelp">
                {inviteDisabledReason ||
                  `Selected partners count toward the attendee total. Remaining friend slots: ${remainingFriendSlots}.`}
              </p>
            </div>

            {selectedFriends.length ? (
              <div className="booking-new__field booking-new__field--full">
                <div className="booking-new__selectedFriends">
                  {selectedFriends.map((friend) => (
                    <span key={friend.id} className="tag">
                      {friend.nickname || friend.name}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="booking-new__field booking-new__field--full">
              <label htmlFor="booking-description">Activity Description *</label>
              <textarea
                id="booking-description"
                value={form.activityDescription}
                onChange={(event) => setFormValue("activityDescription", event.target.value)}
                placeholder="Briefly describe your activity (e.g. casual match, practicing drills)..."
              />
            </div>
          </div>

          <div className="booking-new__actions">
            <button
              className="btn-secondary"
              type="button"
              onClick={() =>
                navigate(requestedFacilityId ? getFacilityDetailRoute(requestedFacilityId) : ROUTE_PATHS.FACILITIES)
              }
            >
              Cancel
            </button>
            <button
              className="btn"
              type="submit"
              disabled={
                submitting ||
                !facility ||
                !isFacilityBookable(facility.status) ||
                !normalizedStartTime ||
                !normalizedEndTime
              }
            >
              {submitting ? "Submitting..." : "Submit Request"}
            </button>
          </div>
        </form>

        <aside className="booking-new__card booking-new__card--rules">
          <h2>Booking Rules</h2>
          <ul className="booking-new__rulesList">
            {ruleItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
