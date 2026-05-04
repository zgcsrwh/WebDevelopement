import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../pageStyles.css";
import "./Facilities.css";
import {
  getFacilities,
  getFacilityDateBounds,
  getFacilitySportTypes,
} from "../../services/bookingService";
import { getBookingNewRoute, getFacilityDetailRoute, ROUTE_PATHS } from "../../constants/routes";
import { getErrorMessage } from "../../utils/errors";
import { displayStatus, statusTone } from "../../utils/presentation";
import { FilterField, FilterPanel } from "../../components/common/FilterControls";
import PageLayout from "../../components/common/PageLayout";
import { Button } from "../../components/common/Button";

const DEFAULT_FILTERS = {
  date: "",
  type: "All",
  availability: "All",
  time: "All",
};

const AVAILABILITY_OPTIONS = [
  { value: "All", label: "All statuses" },
  { value: "normal", label: "normal" },
  { value: "fixing", label: "fixing" },
];

function sortAlphabetically(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function isDisplayableTimeSlot(slot = "") {
  const match = String(slot).match(/^(\d{2}):00\s*-\s*(\d{2}):00$/);
  if (!match) {
    return false;
  }

  const start = Number(match[1]);
  const end = Number(match[2]);
  return start >= 0 && end <= 24 && end - start === 1;
}

function getDisplayableTimeSlots(slots = []) {
  return slots.filter(isDisplayableTimeSlot);
}

function normalizeFacilityType(value = "") {
  return String(value || "").trim().toLowerCase();
}

function formatFacilityType(value = "") {
  return String(value || "").trim();
}

function buildHourSlotRange(startHour, endHour) {
  const safeStart = Number(startHour);
  const safeEnd = Number(endHour);

  if (!Number.isFinite(safeStart) || !Number.isFinite(safeEnd) || safeEnd <= safeStart) {
    return [];
  }

  return Array.from({ length: safeEnd - safeStart }, (_, index) => {
    const start = String(safeStart + index).padStart(2, "0");
    const end = String(safeStart + index + 1).padStart(2, "0");
    return `${start}:00 - ${end}:00`;
  });
}

function sortTimeSlots(slots = []) {
  return [...slots].sort((left, right) => {
    const leftStart = Number(String(left).slice(0, 2));
    const rightStart = Number(String(right).slice(0, 2));
    return leftStart - rightStart;
  });
}

function getTimeOptions(items = [], selectedType = "All") {
  const normalizedSelectedType = normalizeFacilityType(selectedType);
  const scopedItems =
    normalizedSelectedType === "all"
      ? items
      : items.filter((item) => normalizeFacilityType(item.sportType) === normalizedSelectedType);

  if (!scopedItems.length) {
    return ["All"];
  }

  if (normalizedSelectedType === "all") {
    const startHours = scopedItems.map((item) => Number(item.startTime)).filter(Number.isFinite);
    const endHours = scopedItems.map((item) => Number(item.endTime)).filter(Number.isFinite);

    if (!startHours.length || !endHours.length) {
      return ["All"];
    }

    return ["All", ...buildHourSlotRange(Math.min(...startHours), Math.max(...endHours))];
  }

  const timeSlots = new Set();
  scopedItems.forEach((item) => {
    buildHourSlotRange(item.startTime, item.endTime).forEach((slot) => timeSlots.add(slot));
  });

  return ["All", ...sortTimeSlots([...timeSlots])];
}

function formatDateLabel(value = "") {
  if (!value) {
    return "";
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export default function Facilities() {
  const navigate = useNavigate();
  const [dateBounds, setDateBounds] = useState({
    minDate: "",
    maxDate: "",
    defaultDate: "",
  });
  const [sportTypeOptions, setSportTypeOptions] = useState(["All"]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  useEffect(() => {
    let isActive = true;

    Promise.all([getFacilityDateBounds(), getFacilitySportTypes()])
      .then(([bounds, sportTypes]) => {
        if (!isActive) {
          return;
        }

        const nextBounds = {
          minDate: bounds.minDate,
          maxDate: bounds.maxDate,
          defaultDate: bounds.defaultDate,
        };

        setDateBounds(nextBounds);
        setSportTypeOptions(["All", ...sortAlphabetically(new Set(sportTypes))]);
        setFilters((previous) => ({
          ...previous,
          date: previous.date || nextBounds.defaultDate,
        }));
      })
      .catch(() => {
        if (!isActive) {
          return;
        }

        const today = new Date().toISOString().slice(0, 10);
        const fallbackBounds = {
          minDate: today,
          maxDate: today,
          defaultDate: today,
        };

        setDateBounds(fallbackBounds);
        setSportTypeOptions(["All"]);
        setFilters((previous) => ({
          ...previous,
          date: previous.date || fallbackBounds.defaultDate,
        }));
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!filters.date) {
      return undefined;
    }

    let isActive = true;

    async function loadFacilities() {
      setLoading(true);
      setError("");

      try {
        const result = await getFacilities(filters.date);
        if (!isActive) {
          return;
        }
        setItems(result);
      } catch (loadError) {
        if (!isActive) {
          return;
        }
        setItems([]);
        setError(getErrorMessage(loadError, "Unable to load facilities right now."));
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }

    loadFacilities();

    return () => {
      isActive = false;
    };
  }, [filters.date]);

  const displayItems = useMemo(() => {
    return items.map((item) => ({
      ...item,
      memberVisibleSlots: getDisplayableTimeSlots(item.availableSlots || []),
    }));
  }, [items]);
  const timeOptions = useMemo(() => getTimeOptions(displayItems, filters.type), [displayItems, filters.type]);

  useEffect(() => {
    if (!timeOptions.includes(filters.time)) {
      setFilters((previous) => ({
        ...previous,
        time: "All",
      }));
    }
  }, [filters.time, timeOptions]);

  const filteredItems = useMemo(() => {
    return displayItems.filter((item) => {
      const normalizedFilterType = normalizeFacilityType(filters.type);
      const typeMatch =
        normalizedFilterType === "all" || normalizeFacilityType(item.sportType) === normalizedFilterType;
      const statusMatch = filters.availability === "All" || item.status === filters.availability;
      const timeMatch = filters.time === "All" || item.memberVisibleSlots.includes(filters.time);
      return typeMatch && statusMatch && timeMatch;
    });
  }, [displayItems, filters]);

  function updateFilter(field, value) {
    setFilters((previous) => ({
      ...previous,
      [field]: value,
      ...(field === "type" ? { time: "All" } : {}),
    }));
  }

  function clearFilters() {
    const resetFilters = {
      date: dateBounds.defaultDate,
      type: "All",
      availability: "All",
      time: "All",
    };

    setFilters(resetFilters);
  }

  return (
    <PageLayout
      className="member-facilities-page"
      title="Facilities"
      subtitle="Browse available sports venues and make a reservation."
      actions={
        <Button className="member-facilities-header__map-btn" type="button" onClick={() => navigate(ROUTE_PATHS.FACILITIES_MAP)}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
            <line x1="9" y1="3" x2="9" y2="18" />
            <line x1="15" y1="6" x2="15" y2="21" />
          </svg>
          Map Mode
        </Button>
      }
    >

      <FilterPanel
        className="member-facilities-toolbar"
        columns={4}
        onClear={clearFilters}
      >
          <FilterField id="facilities-date" label="Date">
            <input
              id="facilities-date"
              type="date"
              value={filters.date}
              min={dateBounds.minDate}
              max={dateBounds.maxDate}
              onChange={(event) => updateFilter("date", event.target.value)}
            />
          </FilterField>

          <FilterField id="facilities-type" label="Venue Type">
            <select
              id="facilities-type"
              value={filters.type}
              onChange={(event) => updateFilter("type", event.target.value)}
            >
              {sportTypeOptions.map((type) => (
                <option key={type} value={type}>
                  {type === "All" ? "All Types" : type}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField id="facilities-time" label="Time Slot (1h)">
            <select
              id="facilities-time"
              value={filters.time}
              onChange={(event) => updateFilter("time", event.target.value)}
            >
              {timeOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "All" ? "All Times" : option}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField id="facilities-availability" label="Availability">
            <select
              id="facilities-availability"
              value={filters.availability}
              onChange={(event) => updateFilter("availability", event.target.value)}
            >
              {AVAILABILITY_OPTIONS.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </FilterField>
      </FilterPanel>

      {loading && (
        <section className="member-facilities-feedback">
          <h2>Loading facilities</h2>
          <p>Fetching the latest venue availability for the selected date.</p>
        </section>
      )}

      {!loading && error && (
        <section className="member-facilities-feedback member-facilities-feedback--error">
          <h2>Facilities could not be loaded</h2>
          <p>{error}</p>
        </section>
      )}

      {!loading && !error && filteredItems.length === 0 && (
        <section className="member-facilities-feedback">
          <h2>No facilities match the current filters</h2>
          <p>Try another date, time slot, or venue type. Current date: {formatDateLabel(filters.date)}.</p>
        </section>
      )}

      {!loading && !error && filteredItems.length > 0 && (
        <section className="member-facilities-grid">
          {filteredItems.map((facility) => {
            const visibleSlots = facility.memberVisibleSlots.slice(0, 2);
            const remainingSlots = Math.max(facility.memberVisibleSlots.length - visibleSlots.length, 0);
            const isBookable = facility.status === "normal" && facility.memberVisibleSlots.length > 0;
            const hasSlots = facility.memberVisibleSlots.length > 0;

            return (
              <article key={facility.id} className="member-facility-card">
                <div className="member-facility-card__header">
                  <div className="member-facility-card__titleGroup">
                    <h2>{facility.name || "Facility"}</h2>
                    <p className="member-facility-card__subtitle">
                      {formatFacilityType(facility.sportType) || "Venue type"}
                    </p>
                  </div>
                  <span className={`status-pill ${statusTone(facility.status)}`}>
                    {facility.statusLabel || displayStatus(facility.status)}
                  </span>
                </div>

                <div className="member-facility-card__meta">
                  <p>Capacity: {facility.capacity}</p>
                </div>

                <div className="member-facility-card__slots">
                  <p className="member-facility-card__slotsLabel">Available Times:</p>

                  {facility.status === "fixing" ? (
                    <p className="member-facility-card__unavailable">Not available for booking</p>
                  ) : hasSlots ? (
                    <div className="member-facility-card__slotTags">
                      {visibleSlots.map((slot) => (
                        <span key={slot} className="member-facility-card__slotTag">
                          {slot}
                        </span>
                      ))}
                      {remainingSlots > 0 ? (
                        <span className="member-facility-card__slotMore">+{remainingSlots}</span>
                      ) : null}
                    </div>
                  ) : (
                    <p className="member-facility-card__emptySlots">No available time slots for the selected date.</p>
                  )}
                </div>

                <div className="member-facility-card__actions">
                  <Link className="btn-secondary" to={getFacilityDetailRoute(facility.id)}>
                    View Details
                  </Link>
                  {isBookable && (
                    <Link className="btn" to={getBookingNewRoute({ facilityId: facility.id, date: filters.date })}>
                      Book
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </PageLayout>
  );
}
