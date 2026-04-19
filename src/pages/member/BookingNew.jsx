import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import "../pageStyles.css";
import { useAuth } from "../../provider/AuthContext";
import { getFacilities, submitBookingRequest } from "../../services/bookingService";
import { getFriendProfiles } from "../../services/partnerService";
import { getErrorMessage } from "../../utils/errors";

export default function BookingNew() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { sessionProfile } = useAuth();
  const [facilityItems, setFacilityItems] = useState([]);
  const [friends, setFriends] = useState([]);
  const [form, setForm] = useState({
    facilityId: "",
    date: new Date().toISOString().slice(0, 10),
    startTime: "09:00",
    endTime: "10:00",
    attendees: 1,
    activityDescription: "",
    invitedPartners: [],
  });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const maxBookingDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  useEffect(() => {
    async function loadFacilities() {
      const items = await getFacilities(form.date);
      const bookableItems = items.filter((item) => item.status === "normal");
      setFacilityItems(bookableItems);
      setForm((prev) => {
        const requestedFacilityId = params.get("facility");
        const currentFacilityStillExists = bookableItems.some((item) => item.id === prev.facilityId);
        const nextFacilityId =
          (requestedFacilityId && bookableItems.some((item) => item.id === requestedFacilityId) && requestedFacilityId) ||
          (currentFacilityStillExists ? prev.facilityId : bookableItems[0]?.id || "");

        const defaultStart = bookableItems.find((item) => item.id === nextFacilityId)?.availableSlots?.[0]?.slice(0, 5) || "09:00";

        return {
          ...prev,
          facilityId: nextFacilityId,
          startTime: prev.facilityId === nextFacilityId ? prev.startTime : defaultStart,
          endTime: prev.facilityId === nextFacilityId ? prev.endTime : `${String(Number.parseInt(defaultStart, 10) + 1).padStart(2, "0")}:00`,
        };
      });
    }

    loadFacilities();
  }, [form.date, params]);

  useEffect(() => {
    getFriendProfiles(sessionProfile)
      .then(setFriends)
      .catch(() => setFriends([]));
  }, [sessionProfile]);

  const facility = useMemo(
    () => facilityItems.find((item) => item.id === form.facilityId) || facilityItems[0] || null,
    [facilityItems, form.facilityId],
  );

  const startOptions = useMemo(() => {
    return (facility?.availableSlots || []).map((slot) => slot.slice(0, 5));
  }, [facility]);

  const normalizedStartTime = useMemo(() => {
    if (!startOptions.length) {
      return "";
    }
    return startOptions.includes(form.startTime) ? form.startTime : startOptions[0];
  }, [form.startTime, startOptions]);

  const endOptions = useMemo(() => {
    if (!facility || !normalizedStartTime) {
      return [];
    }

    const openSlotStarts = new Set((facility.availableSlots || []).map((slot) => Number.parseInt(slot.slice(0, 2), 10)));
    const startHour = Number.parseInt(normalizedStartTime, 10);
    const nextOptions = [];

    for (let hour = startHour + 1; hour <= Math.min(startHour + 4, facility.endTime); hour += 1) {
      const requiredOpenHours = Array.from({ length: hour - startHour }, (_, index) => startHour + index);
      if (requiredOpenHours.every((slotHour) => openSlotStarts.has(slotHour))) {
        nextOptions.push(`${String(hour).padStart(2, "0")}:00`);
      } else {
        break;
      }
    }

    return nextOptions;
  }, [facility, normalizedStartTime]);

  const normalizedEndTime = useMemo(() => {
    if (!endOptions.length) {
      return "";
    }
    return endOptions.includes(form.endTime) ? form.endTime : endOptions[0];
  }, [endOptions, form.endTime]);

  const remainingFriendSlots = Math.max(Number(form.attendees) - 1 - form.invitedPartners.length, 0);
  const durationHours = useMemo(() => {
    if (!normalizedStartTime || !normalizedEndTime) {
      return 0;
    }

    return Number.parseInt(normalizedEndTime, 10) - Number.parseInt(normalizedStartTime, 10);
  }, [normalizedEndTime, normalizedStartTime]);

  const handleFriendToggle = (friendId) => {
    const active = form.invitedPartners.includes(friendId);
    if (!active && form.invitedPartners.length >= Number(form.attendees) - 1) {
      setError("You cannot add more friends than the attendee limit allows.");
      return;
    }

    setError("");
    setForm((prev) => ({
      ...prev,
      invitedPartners: active
        ? prev.invitedPartners.filter((item) => item !== friendId)
        : [...prev.invitedPartners, friendId],
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);

    try {
      await submitBookingRequest(
        {
          facility_id: form.facilityId,
          date: form.date,
          start_time: normalizedStartTime,
          end_time: normalizedEndTime,
          attendent: Number(form.attendees),
          activity_description: form.activityDescription,
          user_id_list: form.invitedPartners,
        },
        sessionProfile,
      );

      setMessage("Booking request submitted successfully. Redirecting to your bookings...");
      setTimeout(() => navigate("/bookings"), 900);
    } catch (submitError) {
      setError(getErrorMessage(submitError, "Unable to submit the booking request."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <h1>New booking request</h1>
          <p>Choose a bookable facility, select open time slots from the real time slot collection, and invite matched friends within the attendee limit.</p>
        </div>
      </section>

      <div className="split-layout">
        <article className="form-card">
          <h2>Booking form</h2>
          {error && <p className="errorMessage">{error}</p>}
          {message && <p className="successMessage">{message}</p>}
          <form onSubmit={handleSubmit} className="field-grid" style={{ marginTop: 18 }}>
            <div className="field-span">
              <label>Facility</label>
              <select
                value={form.facilityId}
                onChange={(event) => setForm((prev) => ({ ...prev, facilityId: event.target.value }))}
              >
                {facilityItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} | {item.sportType}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Booking date</label>
              <input
                type="date"
                value={form.date}
                min={today}
                max={maxBookingDate}
                onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
              />
            </div>

            <div>
              <label>Total attendees</label>
              <input
                type="number"
                min="1"
                max={facility?.capacity || 1}
                value={form.attendees}
                onChange={(event) =>
                  setForm((prev) => {
                    const nextAttendees = Number(event.target.value);
                    return {
                      ...prev,
                      attendees: nextAttendees,
                      invitedPartners: prev.invitedPartners.slice(0, Math.max(nextAttendees - 1, 0)),
                    };
                  })
                }
              />
            </div>

            <div>
              <label>Start time</label>
              <select
                value={normalizedStartTime}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    startTime: event.target.value,
                  }))
                }
              >
                {startOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>End time</label>
              <select
                value={normalizedEndTime}
                onChange={(event) => setForm((prev) => ({ ...prev, endTime: event.target.value }))}
              >
                {endOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div className="field-span page-muted-box">
              <p className="soft-text">
                Selected facility: <strong>{facility?.name || "Not selected"}</strong>
              </p>
              <p className="soft-text" style={{ marginTop: 8 }}>
                Capacity: {facility?.capacity ?? "-"} | Location: {facility?.location ?? "-"} | Hours: {facility ? `${String(facility.startTime).padStart(2, "0")}:00 - ${String(facility.endTime).padStart(2, "0")}:00` : "-"}
              </p>
              {facility?.unavailableSlots?.length ? (
                <p className="soft-text" style={{ marginTop: 8 }}>
                  Unavailable on this date: {facility.unavailableSlots.join(", ")}
                </p>
              ) : null}
            </div>

            <div className="field-span">
              <label>Add friends to this booking</label>
              <p className="soft-text" style={{ marginBottom: 12 }}>
                The attendee count includes yourself and every invited friend. Remaining friend slots: {remainingFriendSlots}
              </p>
              <div className="friend-strip">
                {friends.map((friend) => {
                  const active = form.invitedPartners.includes(friend.id);
                  const disabled = !active && form.invitedPartners.length >= Number(form.attendees) - 1;

                  return (
                    <button
                      key={friend.id}
                      type="button"
                      className={active ? "btn" : "btn-secondary"}
                      disabled={disabled}
                      onClick={() => handleFriendToggle(friend.id)}
                    >
                      {friend.nickname}
                    </button>
                  );
                })}
              </div>
              {friends.length === 0 && (
                <p className="soft-text" style={{ marginTop: 10 }}>
                  No matched friends are available yet. Accept partner requests first if you want to invite friends.
                </p>
              )}
            </div>

            <div className="field-span">
              <label>Activity description</label>
              <textarea
                value={form.activityDescription}
                onChange={(event) => setForm((prev) => ({ ...prev, activityDescription: event.target.value }))}
                placeholder="Describe the planned activity briefly."
              />
            </div>

            <div className="field-span form-actions">
              <button className="btn-secondary" type="button" onClick={() => navigate(-1)}>
                Cancel
              </button>
              <button className="btn" type="submit" disabled={submitting || !facility || !startOptions.length || !endOptions.length}>
                {submitting ? "Submitting..." : "Confirm and submit"}
              </button>
            </div>
          </form>
        </article>

        <article className="detail-card">
          <h2>Booking rules</h2>
          <ul className="card-list" style={{ marginTop: 16 }}>
            <li className="mini-card">Minimum booking duration is 1 hour.</li>
            <li className="mini-card">Maximum booking duration is 4 hours.</li>
            <li className="mini-card">Bookings can be made up to 7 days in advance.</li>
            <li className="mini-card">Facilities under repair or off shelf cannot be booked.</li>
            <li className="mini-card">Attendee count must include yourself and every invited friend.</li>
            <li className="mini-card">Current request length: {Number.isFinite(durationHours) ? durationHours : 0} hour(s).</li>
          </ul>
        </article>
      </div>
    </div>
  );
}
