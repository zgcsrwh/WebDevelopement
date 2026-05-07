// This member page shows FacilitiesMap content.
// It will displat the facilities on map based on Google Map returned location data

// Referecne https://leafletjs.cn/examples/quick-start/example.html
// 
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, ZoomControl } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "../pageStyles.css";
import "./FacilitiesMap.css";
import PageLayout from "../../components/common/PageLayout";
import { FilterField, FilterPanel } from "../../components/common/FilterControls";
import { ROUTE_PATHS, getBookingNewRoute } from "../../constants/routes";
import { getFacilities, getTimeSlotsByFacility } from "../../services/bookingService";
import { getFrontendBookableSlotStatus, getLocalDateKey } from "../../utils/bookingSlotRules";

// Southampton center coordinates
const SOUTHAMPTON_CENTER = [50.9097, -1.4044];
const DEFAULT_ZOOM = 13;


// Extract venue name from facility name
// "Jubilee Sport and Recreation Centre-Basketball Court A" -> "Jubilee Sport and Recreation Centre"
function extractVenueName(facilityName) {
  if (!facilityName) return "";
  
  // Try splitting by common delimiters
  const delimiters = [" - ", "-", " – ", "—"];
  for (const delimiter of delimiters) {
    if (facilityName.includes(delimiter)) {
      const parts = facilityName.split(delimiter);
      // Return the first part as venue name
      return parts[0].trim();
    }
  }
  
  // If no delimiter found, return the full name
  return facilityName.trim();
}

// Using google map api to fetch location
async function geocodeVenue(venueName) {

  const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY; 
  //const API_KEY = "AIzaSyDHgQZxEqq2qNAOvMjJtkJ4fGYIZkvPIwY";
  const searchQuery = `${venueName}, Southampton, UK`;
  
  // Google query url
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(searchQuery)}&key=${API_KEY}`;

  try {
    // Fetch information and check response
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Geocoding HTTP error: ${response.status}`);
    }
    
    // Get and check data
    const data = await response.json();
    //console.log("Google Maps Data:", data);
    if (data.status === "OK" && data.results.length > 0) {
      const location = data.results[0].geometry.location;
      
      return {
        lat: location.lat,
        lon: location.lng,
        displayName: data.results[0].formatted_address,
      };
    } else {
      console.warn(`Error ${venueName}: ${data.status}`);
      return null;
    }
    
  } catch (error) {
    console.error(`Error for ${venueName}:`, error);
    return null;
  }
}

// Group facilities that locate in the same place
async function processAndGroupFacilities(facilities) {
  // Group facilities by venue name
  const venueGroups = new Map();
  
  for (const facility of facilities) {
    const venueName = extractVenueName(facility.name);
    
    if (!venueGroups.has(venueName)) {
      venueGroups.set(venueName, {
        venueName,
        facilities: [],
        sportTypes: new Set(),
      });
    }
    
    const group = venueGroups.get(venueName);
    group.facilities.push(facility);
    group.sportTypes.add(facility.sportType);
  }
  
  // Geocode each unique venue with rate limiting
  const venueLocations = [];
  const venueNames = [...venueGroups.keys()];
  
  for (let i = 0; i < venueNames.length; i++) {
    const venueName = venueNames[i];
    const group = venueGroups.get(venueName);
    
    // Add delay to respect Nominatim rate limits (1 request per second)
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, 1100));
    }
    
    const location = await geocodeVenue(venueName);
    
    if (location) {
      venueLocations.push({
        id: `venue-${i}`,
        venueName,
        lat: location.lat,
        lon: location.lon,
        address: location.displayName,
        facilities: group.facilities,
        sportTypes: [...group.sportTypes],
      });
    }
  }
  
  return venueLocations;
}


export default function FacilitiesMap() {
  const navigate = useNavigate();
  const [venueLocations, setVenueLocations] = useState([]);
  const [allFacilities, setAllFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [geocodingStatus, setGeocodingStatus] = useState("");
  const [error, setError] = useState("");
  const [selectedType, setSelectedType] = useState("All");
  const [clockTick, setClockTick] = useState(Date.now());

  // Get unique sport types from facilities
  const sportTypes = useMemo(() => {
    const types = new Set(allFacilities.map(f => f.sportType));
    return [...types].sort();
  }, [allFacilities]);

  // Load real data when this part opens or changes.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockTick(Date.now());
    }, 60 * 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadFacilitiesAndGeocode() {
      setLoading(true);
      setError("");
      setGeocodingStatus("Loading map data, please wait...");

      try {
        // Load facilities from Firebase
        const today = getLocalDateKey();
        const facilities = await getFacilities(today);

        if (!isActive) return;
        
        setAllFacilities(facilities);
        setGeocodingStatus("Loading map data, please wait...");
        
        // Try to geocode venues
        const locations = await processAndGroupFacilities(facilities);
        
        if (!isActive) return;
        
        if (locations.length === 0) {
          setError("Failed to load location map, please try again later on.");
        } else {
          setVenueLocations(locations);
        }
      } catch (loadError) {
        if (!isActive) return;
        console.error("Error loading facilities:", loadError);
        setError("Failed to load location map, please try again later on.");
      } finally {
        if (isActive) {
          setLoading(false);
          setGeocodingStatus("");
        }
      }
    }

    loadFacilitiesAndGeocode();

    return () => {
      isActive = false;
    };
  }, []);

  // Build the list that the user can see.
  const filteredVenueLocations = useMemo(() => {
    if (selectedType === "All") return venueLocations;
    
    return venueLocations
      .map(venue => ({
        ...venue,
        facilities: venue.facilities.filter(f => f.sportType === selectedType),
        sportTypes: venue.sportTypes.filter(t => t === selectedType),
      }))
      .filter(venue => venue.facilities.length > 0);
  }, [venueLocations, selectedType]);

  const totalFacilitiesCount = useMemo(() => {
    return filteredVenueLocations.reduce((sum, venue) => sum + venue.facilities.length, 0);
  }, [filteredVenueLocations]);

  
// Get the display icon based on type using modern pure CSS L.divIcon
function getIconForSportTypes(sportTypes) {
  const type = sportTypes.find(t => ["Soccer", "Basketball", "Tennis", "Swimming", "Badminton", "Gym"].includes(t)) || "default";
  return L.divIcon({
    className: "custom-leaflet-marker",
    html: `<div class="marker-pin marker-pin--${type.toLowerCase()}"></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -32]
  });
}

  function hasBookableSlotsToday(facility) {
    if (facility.status !== "normal") {
      return false;
    }

    const today = getLocalDateKey();
    const now = new Date(clockTick);
    return (facility.memberTimeSlots || []).some((slot) => getFrontendBookableSlotStatus(slot, today, now).bookable);
  }

  function handleBookFacility(facility) {
    const today = getLocalDateKey();
    navigate(getBookingNewRoute({ facilityId: facility.id, date: today }));
  }

  /********************************************************************************************** */
  // 
  return (
    <PageLayout
      className="facilities-map-page"
      backTo={ROUTE_PATHS.FACILITIES}
      backLabel="Back to Facilities"
      title="Facility Map"
      subtitle="View venue locations and facility groups on the map."
    >

      {sportTypes.length > 0 && (
        <FilterPanel
          className="facilities-map-filters"
          onClear={() => setSelectedType("All")}
        >
          <FilterField id="facilities-map-sport-types" label="Sport Type">
            <select
              id="facilities-map-sport-types"
              value={selectedType}
              onChange={(event) => setSelectedType(event.target.value)}
            >
              <option value="All">All Types</option>
              {sportTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </FilterField>
        </FilterPanel>
      )}

      {loading && (
        <section className="facilities-map-feedback">
          <h2>Loading...</h2>
          <p>{geocodingStatus || "Please wait..."}</p>
        </section>
      )}

      {!loading && error && (
        <section className="facilities-map-feedback facilities-map-feedback--error">
          <h2>Load failed</h2>
          <p>{error}</p>
        </section>
      )}

      {!loading && !error && (
        <section className="facilities-map-container">
          <MapContainer
            center={SOUTHAMPTON_CENTER}
            zoom={DEFAULT_ZOOM}
            className="facilities-map"
            scrollWheelZoom={true}
            zoomControl={false}
          >
            <ZoomControl position="bottomright" />
            <TileLayer
              url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
              attribution='&copy; Google Maps'
            />
            {filteredVenueLocations.map(venue => (
              <Marker
                key={venue.id}
                position={[venue.lat, venue.lon]}
                icon={getIconForSportTypes(venue.sportTypes)}
              >
                <Popup className="facility-popup" maxWidth={320}>
                  <div className="facility-popup__content">
                    <h3 className="facility-popup__venue-name">{venue.venueName}</h3>
                    <p className="facility-popup__address">{venue.address}</p>
                    
                    <div className="facility-popup__sport-tags">
                      {venue.sportTypes.map(type => (
                        <span
                          key={type}
                          className={`facility-popup__sport-tag facility-popup__sport-tag--${type.toLowerCase()}`}
                        >
                          {type}
                        </span>
                      ))}
                    </div>
                    
                    <div className="facility-popup__facilities-list">
                      <h4 className="facility-popup__list-title">
                        Available facilities ({venue.facilities.length})
                      </h4>
                      {venue.facilities.map(facility => {
                        const canBookFacility = hasBookableSlotsToday(facility);

                        return (
                          <div key={facility.id} className="facility-popup__facility-item">
                            <div className="facility-popup__facility-info">
                              <span className="facility-popup__facility-name">{facility.name}</span>
                              <span className="facility-popup__facility-meta">
                                Capacity {facility.capacity}
                              </span>
                              <span className="facility-popup__facility-time">
                                Open time: {facility.startTime}:00 - {facility.endTime}:00
                              </span>
                              {!canBookFacility && (
                                <span className="facility-popup__no-slots">No bookable slots today</span>
                              )}
                            </div>
                            {canBookFacility && (
                              <button
                                className="btn facility-popup__book-btn"
                                type="button"
                                onClick={() => handleBookFacility(facility)}
                              >
                                Book
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
          
          <div className="facilities-map-legend">
            <h4>Legend</h4>
            <div className="facilities-map-legend__items">
              {sportTypes.map(type => (
                <div key={type} className="facilities-map-legend__item">
                  <span className={`facilities-map-legend__dot facilities-map-legend__dot--${type.toLowerCase()}`} />
                  <span>{type}</span>
                </div>
              ))}
            </div>
          </div>

        </section>
      )}
    </PageLayout>
  );
}
