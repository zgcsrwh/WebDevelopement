import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "../pageStyles.css";
import "./FacilitiesMap.css";
import { ROUTE_PATHS, getBookingNewRoute } from "../../constants/routes";
import { getFacilities } from "../../services/bookingService";

// Southampton center coordinates
const SOUTHAMPTON_CENTER = [50.9097, -1.4044];
const DEFAULT_ZOOM = 13;

// Map Icon parameters
const ICON_SIZE = [25, 41];
const SHADOW_URL = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png"
const SHWDOW_SIZE = [41, 41];
const ICON_ANCHOR = [12, 41];

// Assign sport type icons using different colored markers
const SPORT_ICONS = {
  Soccer: new L.Icon({
    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
    iconSize: ICON_SIZE,
    shadowUrl: SHADOW_URL,
    shadowSize: SHWDOW_SIZE,
    iconAnchor: ICON_ANCHOR,
  }),
  Basketball: new L.Icon({
    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png",
    iconSize: ICON_SIZE,
    shadowUrl: SHADOW_URL,
    shadowSize: SHWDOW_SIZE,
    iconAnchor: ICON_ANCHOR,
  }),
  Tennis: new L.Icon({
    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-yellow.png",
    iconSize: ICON_SIZE,
    shadowUrl: SHADOW_URL,
    shadowSize: SHWDOW_SIZE,
    iconAnchor: ICON_ANCHOR,
  }),
  Swimming: new L.Icon({
    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
    iconSize: ICON_SIZE,
    shadowUrl: SHADOW_URL,
    shadowSize: SHWDOW_SIZE,
    iconAnchor: ICON_ANCHOR,
  }),
  Badminton: new L.Icon({
    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
    iconSize: ICON_SIZE,
    shadowUrl: SHADOW_URL,
    shadowSize: SHWDOW_SIZE,
    iconAnchor: ICON_ANCHOR,
  }),
  default: new L.Icon({
    iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png",
    iconSize: ICON_SIZE,
    shadowUrl: SHADOW_URL,
    shadowSize: SHWDOW_SIZE,
    iconAnchor: ICON_ANCHOR,
  }),
};


// Extract venue name from facility name:"Jubilee Sport and Recreation Centre-Basketball Court A" -> "Jubilee Sport and Recreation Centre"
function extractVenueName(facilityName) {
  if (!facilityName) return "";
  
  // Try splitting by common delimiters
  const delimiters = [" - ", "-", " – ", "–"];
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

  //const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY; 
  const API_KEY = "AIzaSyDHgQZxEqq2qNAOvMjJtkJ4fGYIZkvPIwY";
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

/**
 * Process facilities and group by venue location
 */
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
  const [selectedTypes, setSelectedTypes] = useState(new Set());

  // Get unique sport types from facilities
  const sportTypes = useMemo(() => {
    const types = new Set(allFacilities.map(f => f.sportType));
    return [...types].sort();
  }, [allFacilities]);

  // Initialize selected types when sport types are loaded
  useEffect(() => {
    if (sportTypes.length > 0 && selectedTypes.size === 0) {
      setSelectedTypes(new Set(sportTypes));
    }
  }, [sportTypes, selectedTypes.size]);

  useEffect(() => {
    let isActive = true;

    async function loadFacilitiesAndGeocode() {
      setLoading(true);
      setError("");
      setGeocodingStatus("Loading map data, please wait...");

      try {
        // Load facilities from Firebase
        const today = new Date().toISOString().slice(0, 10);
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

  const filteredVenueLocations = useMemo(() => {
    if (selectedTypes.size === 0) return venueLocations;
    
    return venueLocations
      .map(venue => ({
        ...venue,
        facilities: venue.facilities.filter(f => selectedTypes.has(f.sportType)),
        sportTypes: venue.sportTypes.filter(t => selectedTypes.has(t)),
      }))
      .filter(venue => venue.facilities.length > 0);
  }, [venueLocations, selectedTypes]);

  const totalFacilitiesCount = useMemo(() => {
    return filteredVenueLocations.reduce((sum, venue) => sum + venue.facilities.length, 0);
  }, [filteredVenueLocations]);

  function toggleSportType(type) {
    setSelectedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  
// Return icon for the first sport type found in the list
function getIconForSportTypes(sportTypes) {
  for (const type of sportTypes) {
    if (SPORT_ICONS[type]) {
      return SPORT_ICONS[type];
    }
  }
  return SPORT_ICONS.default;
}

  function handleBookFacility(facility) {
    const today = new Date().toISOString().slice(0, 10);
    navigate(getBookingNewRoute({ facilityId: facility.id, date: today }));
  }

  return (
    <div className="facilities-map-page">
      <section className="facilities-map-header">
        <div className="facilities-map-header__body">
          <div className="facilities-map-header__title-row">
            <h1>Facility Map</h1>
            <button
              className="btn-secondary facilities-map-header__back"
              type="button"
              onClick={() => navigate(ROUTE_PATHS.FACILITIES)}
            >
              ← Back to lists
            </button>
          </div>
        </div>
      </section>

      {sportTypes.length > 0 && (
        <section className="facilities-map-filters">
          <span className="facilities-map-filters__label">Filter：</span>
          <div className="facilities-map-filters__chips">
            {sportTypes.map(type => (
              <button
                key={type}
                className={`facilities-map-filter-chip ${selectedTypes.has(type) ? "is-active" : ""}`}
                type="button"
                onClick={() => toggleSportType(type)}
              >
                <span className={`facilities-map-filter-chip__dot facilities-map-filter-chip__dot--${type.toLowerCase()}`} />
                {type}
              </button>
            ))}
          </div>
        </section>
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
          >
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
                      {venue.facilities.map(facility => (
                        <div key={facility.id} className="facility-popup__facility-item">
                          <div className="facility-popup__facility-info">
                            <span className="facility-popup__facility-name">{facility.name}</span>
                            <span className="facility-popup__facility-meta">
                              Capacity {facility.capacity}
                            </span>
                            <span className="facility-popup__facility-time">
                              Open time: {facility.startTime}:00 - {facility.endTime}:00
                            </span>
                          </div>
                          <button
                            className="btn facility-popup__book-btn"
                            type="button"
                            onClick={() => handleBookFacility(facility)}
                          >
                            Book
                          </button>
                        </div>
                      ))}
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
    </div>
  );
}
