import { MapPin, Navigation } from "lucide-react";
import { useLanguage } from "../../hooks/useLanguage";
import "./MapLink.css";

/**
 * "View on map" / "Navigate" for a location, built from REAL stored coordinates.
 *
 * Coordinates come from the GeoJSON point the record actually holds
 * (`[longitude, latitude]`, the order MongoDB uses). Nothing here guesses a
 * position from a city name and nothing falls back to a default city - when
 * there are no coordinates the component shows the textual location and says
 * plainly that navigation is unavailable, which is more use than a confident
 * pin in the wrong place.
 *
 * @param {{location?: {coordinates?: number[]}|null, label?: string|null, kind?: string}} props
 *   `kind` names WHOSE location this is ("Job location", "Employer location"),
 *   because the three in this product - job site, employer, worker - are
 *   genuinely different places and must not be presented as interchangeable.
 */
export function MapLink({ location, label, kind }) {
  const { t } = useLanguage();
  const coordinates = Array.isArray(location?.coordinates) ? location.coordinates : null;
  const hasPoint =
    coordinates?.length === 2 &&
    Number.isFinite(coordinates[0]) &&
    Number.isFinite(coordinates[1]);

  if (!hasPoint) {
    return (
      <span className="map-link map-link-unavailable">
        <MapPin size={14} aria-hidden="true" />
        <span>
          {label || t("map.notRecorded")}
          <em> — {t("map.unavailable")}</em>
        </span>
      </span>
    );
  }

  const [longitude, latitude] = coordinates;
  // Stored as [lng, lat]; both of these URLs take lat,lng - swapping them is the
  // classic way to end up pointing at the sea.
  const viewUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  const navigateUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;

  return (
    <span className="map-link">
      <span className="map-link-label">
        <MapPin size={14} aria-hidden="true" /> {kind ?? t("common.location")}
        {label ? `: ${label}` : ""}
      </span>
      {/* noreferrer alongside noopener: these open a third-party map, and the
          referrer would otherwise leak the page the user came from. */}
      <a href={viewUrl} target="_blank" rel="noopener noreferrer">
        {t("map.viewOnMap")}
      </a>
      <a href={navigateUrl} target="_blank" rel="noopener noreferrer">
        <Navigation size={13} aria-hidden="true" /> {t("map.navigate")}
      </a>
    </span>
  );
}
