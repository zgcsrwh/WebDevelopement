import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import "../pageStyles.css";
import "./FacilityDetail.css";
import { getFacilityById, getFacilityDateBounds, getTimeSlotsByFacility } from "../../services/bookingService";
import { ROUTE_PATHS, getBookingNewRoute } from "../../constants/routes";
import { getErrorMessage } from "../../utils/errors";
import { displayStatus, statusTone } from "../../utils/presentation";

function buildFacilityHeading(name = "", sportType = "") {
  const normalizedName = String(name || "").trim();
  const normalizedSportType = String(sportType || "").trim();

  if (!normalizedName) {
    return {
      title: normalizedSportType || "Facility",
      subtitle: "",
    };
  }

  const courtMatch = normalizedName.match(/^(.*?\bCourt)\s+([A-Za-z0-9]+)$/i);
  if (courtMatch) {
    return {
      title: courtMatch[1].trim(),
      subtitle: `Court ${courtMatch[2]}`.trim(),
    };
  }

  return {
    title: normalizedName,
    subtitle: normalizedSportType && normalizedSportType !== normalizedName ? normalizedSportType : "",
  };
}

function buildGuidelineItems(text = "") {
  const source = String(text || "").trim();
  if (!source) {
    return [];
  }

  return source
    .split(/[\n.]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDateLabel(value = "") {
  if (!value) {
    return "";
  }

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

export default function FacilityDetail() {
  const { id } = useParams();
  const [dateBounds, setDateBounds] = useState({
    minDate: "",
    maxDate: "",
    defaultDate: "",
  });
  const [selectedDate, setSelectedDate] = useState("");
  const [facility, setFacility] = useState(null);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;

    getFacilityDateBounds()
      .then((bounds) => {
        if (!isActive) {
          return;
        }
        setDateBounds(bounds);
        setSelectedDate((current) => current || bounds.defaultDate);
      })
      .catch(() => {
        if (!isActive) {
          return;
        }
        const today = new Date().toISOString().slice(0, 10);
        setDateBounds({
          minDate: today,
          maxDate: today,
          defaultDate: today,
        });
        setSelectedDate((current) => current || today);
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedDate) {
      return undefined;
    }

    let isActive = true;

    async function loadFacility() {
      setLoading(true);
      setError("");

      try {
        const [facilityResult, slotResult] = await Promise.all([
          getFacilityById(id, selectedDate),
          getTimeSlotsByFacility(id, selectedDate),
        ]);

        if (!isActive) {
          return;
        }

        if (!facilityResult) {
          setFacility(null);
          setSlots([]);
          setError("This facility could not be found.");
          return;
        }

        setFacility(facilityResult);
        setSlots(slotResult);
      } catch (loadError) {
        if (!isActive) {
          return;
        }

        setFacility(null);
        setSlots([]);
        setError(getErrorMessage(loadError, "Unable to load facility details right now."));
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }

    loadFacility();

    return () => {
      isActive = false;
    };
  }, [id, selectedDate]);

  const openSlots = useMemo(() => {
    return slots.filter((slot) => String(slot.status || "").toLowerCase() === "open");
  }, [slots]);

  if (loading) {
    return (
      <div className="facility-detail-page">
        <section className="member-facilities-feedback">
          <h2>Loading facility</h2>
          <p>Fetching the venue details and booking slots.</p>
        </section>
      </div>
    );
  }

  if (error || !facility) {
    return (
      <div className="facility-detail-page">
        <Link className="facility-detail__back" to={ROUTE_PATHS.FACILITIES}>
          ← Back to Facilities
        </Link>
        <section className="member-facilities-feedback member-facilities-feedback--error">
          <h2>Facility details are unavailable</h2>
          <p>{error || "This facility could not be loaded."}</p>
        </section>
      </div>
    );
  }

  const facilityHeading = buildFacilityHeading(facility.name, facility.sportType);
  const guidelineItems = buildGuidelineItems(facility.usageGuidelines);
  const canBook = facility.status === "normal" && openSlots.length > 0;

  return (
    <div className="facility-detail-page">
      <Link className="facility-detail__back" to={ROUTE_PATHS.FACILITIES}>
        ← Back to Facilities
      </Link>

      <article className="facility-detail-card">
        <section className="facility-detail-card__section facility-detail-card__section--hero">
          <div className="facility-detail-card__titleGroup">
            <h1>{facilityHeading.title}</h1>
          </div>
          <span className={`status-pill ${statusTone(facility.status)}`}>
            {facility.statusLabel || displayStatus(facility.status)}
          </span>
        </section>

        <section className="facility-detail-card__section facility-detail-card__section--info">
          <div className="facility-detail-card__infoItem facility-detail-card__infoItem--blue">
            <span className="facility-detail-card__infoLabel">Sport type</span>
            <strong>{facility.sportType}</strong>
          </div>
          <div className="facility-detail-card__infoItem facility-detail-card__infoItem--green">
            <span className="facility-detail-card__infoLabel">Capacity</span>
            <strong>Max {facility.capacity} attendees</strong>
          </div>
          <div className="facility-detail-card__infoItem facility-detail-card__infoItem--purple">
            <span className="facility-detail-card__infoLabel">Operating hours</span>
            <strong>
              {String(facility.startTime).padStart(2, "0")}:00 - {String(facility.endTime).padStart(2, "0")}:00
            </strong>
          </div>
          <div className="facility-detail-card__infoItem facility-detail-card__infoItem--orange">
            <span className="facility-detail-card__infoLabel">Location</span>
            <strong>{facility.location}</strong>
          </div>
        </section>

        <section className="facility-detail-card__section facility-detail-card__section--text">
          <div className="facility-detail-card__textBlock">
            <h2>Description</h2>
            <p>{facility.description}</p>
          </div>

          <div className="facility-detail-card__textBlock">
            <h2>Usage guidelines</h2>
            {guidelineItems.length > 0 ? (
              <ul className="facility-detail-card__guidelines">
                {guidelineItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p>No additional usage guidance has been provided for this facility.</p>
            )}
          </div>
        </section>

        <section className="facility-detail-card__section facility-detail-card__section--availability">
          <div className="facility-detail-card__availabilityHead">
            <h2>Booking Availability</h2>

            <div className="facility-detail-card__dateField">
              <input
                id="facility-detail-date"
                type="date"
                aria-label="Booking date"
                value={selectedDate}
                min={dateBounds.minDate}
                max={dateBounds.maxDate}
                onChange={(event) => setSelectedDate(event.target.value)}
              />
            </div>
          </div>

          <div className="facility-detail-card__slotSection">
            <div className="facility-detail-card__slotGrid">
              {slots.map((slot) => {
                const isOpen = String(slot.status || "").toLowerCase() === "open";

                return (
                  <div
                    key={slot.id || `${slot.date}-${slot.start_time}-${slot.end_time}`}
                    className={`facility-detail-card__slot ${isOpen ? "is-open" : "is-locked"}`}
                  >
                    <span>{slot.timeLabel}</span>
                    {!isOpen && <small>(Booked)</small>}
                  </div>
                );
              })}

              {slots.length === 0 && (
                <div className="facility-detail-card__slot facility-detail-card__slot--empty">
                  No slots are available for the selected date.
                </div>
              )}
            </div>

            {facility.status === "fixing" && (
              <p className="facility-detail-card__availabilityNote">This facility is currently not available for booking.</p>
            )}

            {facility.status !== "fixing" && selectedDate && (
              <p className="facility-detail-card__availabilityCaption">{formatDateLabel(selectedDate)}</p>
            )}
          </div>
        </section>

        <section className="facility-detail-card__section facility-detail-card__section--footer">
          {canBook && (
            <Link className="btn" to={getBookingNewRoute({ facilityId: facility.id, date: selectedDate })}>
              Book
            </Link>
          )}
        </section>
      </article>
    </div>
  );
}
