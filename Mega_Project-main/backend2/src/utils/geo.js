const EARTH_RADIUS_KM = 6371;

/**
 * Calculate Haversine distance in kilometers between two latitude/longitude points.
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} Distance in kilometers (rounded to 2 decimal places)
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = EARTH_RADIUS_KM * c;

  return Math.round(distance * 100) / 100;
};

/**
 * Convert kilometers to Earth radians for MongoDB $centerSphere query.
 * @param {number} km - Distance in kilometers
 * @returns {number} Distance in Earth radians
 */
const kmToRadians = (km) => {
  if (!km || km <= 0) return 0;
  return km / EARTH_RADIUS_KM;
};

/**
 * Convert Earth radians to kilometers.
 * @param {number} radians - Distance in Earth radians
 * @returns {number} Distance in kilometers
 */
const radiansToKm = (radians) => {
  if (!radians || radians <= 0) return 0;
  return radians * EARTH_RADIUS_KM;
};

/**
 * Check if two GeoJSON coordinates [lng, lat] are within a specified radius (km).
 * @param {[number, number]} coords1 - [lng, lat] of point 1
 * @param {[number, number]} coords2 - [lng, lat] of point 2
 * @param {number} radiusKm - Maximum allowed radius in kilometers
 * @returns {boolean} True if within radius, false otherwise
 */
const isWithinRadius = (coords1, coords2, radiusKm) => {
  if (
    !Array.isArray(coords1) ||
    !Array.isArray(coords2) ||
    coords1.length !== 2 ||
    coords2.length !== 2
  ) {
    return false;
  }

  const [lng1, lat1] = coords1;
  const [lng2, lat2] = coords2;

  const dist = calculateDistance(lat1, lng1, lat2, lng2);
  return dist <= radiusKm;
};

export {
  calculateDistance,
  kmToRadians,
  radiansToKm,
  isWithinRadius,
  EARTH_RADIUS_KM,
};
