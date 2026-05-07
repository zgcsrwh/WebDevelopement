// This member page shows Facilities content.
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../provider/FirebaseConfig";
import "../pageStyles.css";
import "./Facilities.css";
import { getFacilities, getFacilityDateBounds, getFacilitySportTypes, getTimeSlotsByFacility} from "../../services/bookingService";
import { getBookingNewRoute, getFacilityDetailRoute, ROUTE_PATHS } from "../../constants/routes";
import { getActionErrorMessage } from "../../utils/errors";
import { displayStatus, statusTone } from "../../utils/presentation";
import { FilterField, FilterPanel } from "../../components/common/FilterControls";
import PageLayout from "../../components/common/PageLayout";
import { Button } from "../../components/common/Button";
import { getFrontendBookableSlotStatus, normalizeSlotClock } from "../../utils/bookingSlotRules";

const DEFAULT_FILTERS = {
  date: "",
  type: "All",
  availability: "All",
  time: "All",
};

const AVAILABILITY_OPTIONS = [
  { value: "All", label: "All Statuses" },
  { value: "normal", label: "Normal" },
  { value: "fixing", label: "Fixing" },
];

// Sort an array of strings alphabetically
function sortAlphabetically(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

// Normalize a facility type string for comparison (lowercase, trimmed)
function normalizeFacilityType(value = "") {
  return String(value || "").trim().toLowerCase();
}

// Format a facility type string for display
function formatFacilityType(value = "") {
  return String(value || "").trim();
}

// Sort time slot strings chronologically based on the starting hour
function sortTimeSlots(slots = []) {
  return [...slots].sort((left, right) => {
    const leftStart = Number(String(left).slice(0, 2));
    const rightStart = Number(String(right).slice(0, 2));
    return leftStart - rightStart;
  });
}

// Extract and format the labels of currently bookable time slots
function getBookableTimeSlotLabels(slots = [], selectedDate = "", now = new Date()) {
  const labels = slots
    .filter((slot) => getFrontendBookableSlotStatus(slot, selectedDate, now).bookable)
    .map((slot) => {
      const start = normalizeSlotClock(slot.start_time ?? slot.startTime);
      const end = normalizeSlotClock(slot.end_time ?? slot.endTime);
      return start && end ? `${start} - ${end}` : "";
    })
    .filter(Boolean);

  return sortTimeSlots([...new Set(labels)]);
}

// Generate a unique list of available time slots across all facilities matching the selected type
function getTimeOptions(items = [], selectedType = "All") {
  const normalizedSelectedType = normalizeFacilityType(selectedType);
  const scopedItems =
    normalizedSelectedType === "all"
      ? items
      : items.filter((item) => normalizeFacilityType(item.sportType) === normalizedSelectedType);

  const timeSlots = new Set();
  scopedItems.forEach((item) => {
    (item.memberVisibleSlots || []).forEach((slot) => timeSlots.add(slot));
  });

  return ["All", ...sortTimeSlots([...timeSlots])];
}

// Format a date string  into a readable label
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
  
  // Define component states for date boundaries, filter options, facility data, and UI feedback
  const [dateBounds, setDateBounds] = useState({
    minDate: "",
    maxDate: "",
    defaultDate: "",
  });

  // Hooks
  const [sportTypeOptions, setSportTypeOptions] = useState(["All"]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [clockTick, setClockTick] = useState(Date.now());

  // Setup a clock ticker to continuously refresh time slot availability 
  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockTick(Date.now());
    }, 60 * 1000); // every minute

    return () => window.clearInterval(timer);
  }, []);

  // Fetch the globally allowed date boundaries and facility sport types when the component mounts
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

  // Listen for status changes for facility status
  
  useEffect(() => {
    if (!filters.date) {
      return undefined;
    }

    let isActive = true;
    let unsubscribeFacilities = () => {};
    let isInitialLoad = true;

    async function loadFacilities() {
      if (isInitialLoad) {
        setLoading(true);
      }
      setError("");

      try {
        const result = await getFacilities(filters.date);
        const resultWithSlots = await Promise.all(
          result.map(async (item) => ({
            ...item,
            memberTimeSlots: await getTimeSlotsByFacility(item.id, filters.date),
          })),
        );
        if (!isActive) {
          return;
        }
        setItems(resultWithSlots);
      } catch (loadError) {
        if (!isActive) {
          return;
        }
        setItems([]);
        setError(getActionErrorMessage(loadError, "facility.load", "Unable to load facilities right now."));
      } finally {
        if (isActive) {
          setLoading(false);
          isInitialLoad = false;
        }
      }
    }

    // Mount a real-time listener for facility collection changes
    // That is when the status of facilires changed
    // The listing for timeslot changing is over burden
    unsubscribeFacilities = onSnapshot(collection(db, "facility"), () => {
      loadFacilities();}, (err) => {
      if (isActive) console.error("Facility listener error:", err);
      loadFacilities();
    });

    return () => {
      isActive = false;
      unsubscribeFacilities();
    };
  }, [filters.date]);


  // Append the currently bookable time slot labels to each facility item
  const displayItems = useMemo(() => {
    const now = new Date(clockTick);
    return items.map((item) => ({
      ...item,
      memberVisibleSlots:
        item.status === "normal" ? getBookableTimeSlotLabels(item.memberTimeSlots || [], filters.date, now) : [],
    }));
  }, [clockTick, filters.date, items]);

  // Calculate the available time slot options for the time filter dropdown
  const timeOptions = useMemo(() => getTimeOptions(displayItems, filters.type), [displayItems, filters.type]);

  // Reset the selected time filter to "All" if the current selection is no longer available
  useEffect(() => {
    if (!timeOptions.includes(filters.time)) {
      setFilters((previous) => ({
        ...previous,
        time: "All",
      }));
    }
  }, [filters.time, timeOptions]);

  // Filter the facilities list based on the active type, availability, and time selections
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


  // Update a specific filter field, resetting the time filter if the facility type changes
  function updateFilter(field, value) {
    setFilters((previous) => ({
      ...previous,
      [field]: value,
      ...(field === "type" ? { time: "All" } : {}),
    }));
  }

  // Reset all filters back to their default states
  function clearFilters() {
    const resetFilters = {
      date: dateBounds.defaultDate,
      type: "All",
      availability: "All",
      time: "All",
    };

    setFilters(resetFilters);
  }

  /*****************************************************************************8 */
  // Main Rendering
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

      {/* Filters for selecting facilities */}
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
              disabled={timeOptions.length <= 1}
              onChange={(event) => updateFilter("time", event.target.value)}
            >
              {timeOptions.length > 1 ? (
                timeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === "All" ? "All Times" : option}
                  </option>
                ))
              ) : (
                <option value="All">No available times</option>
              )}
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

      {/* Loading state feedback */}
      {loading && (
        <section className="member-facilities-feedback">
          <h2>Loading facilities</h2>
          <p>Fetching the latest venue availability for the selected date.</p>
        </section>
      )}

      {/* Error state feedback */}
      {!loading && error && (
        <section className="member-facilities-feedback member-facilities-feedback--error">
          <h2>Facilities could not be loaded</h2>
          <p>{error}</p>
        </section>
      )}

      {/* Empty state feedback when no facilities match the current filters */}
      {!loading && !error && filteredItems.length === 0 && (
        <section className="member-facilities-feedback">
          <h2>No facilities match the current filters</h2>
          <p>Try another date, time slot, or venue type. Current date: {formatDateLabel(filters.date)}.</p>
        </section>
      )}

      {/* Display facility cards */}
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

                {/* time slots display */}
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

                {/* View details button and Book button */}
                <div className="member-facility-card__actions">
                  <Link className="btn-secondary" to={`${getFacilityDetailRoute(facility.id)}?date=${filters.date}`}>
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
