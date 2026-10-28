import { MapPin, Navigation } from "lucide-react";
import { useGeolocation } from "../../hooks/useGeolocation";
import { useLanguage } from "../../hooks/useLanguage";
import "./LocationField.css";

/**
 * @param {{coordinates: [number,number]|null, onChange: (coords:[number,number]) => void}} props
 */
export function LocationField({ coordinates, onChange }) {
  const { t } = useLanguage();
  const { requestLocation, status } = useGeolocation();

  const handleUseMyLocation = async () => {
    try {
      const { longitude, latitude } = await requestLocation();
      onChange([longitude, latitude]);
    } catch {
      // useGeolocation already tracks a "denied"/"unsupported" status the
      // caller can surface separately if needed - nothing more to do here.
    }
  };

  return (
    <div className="location-field">
      <div className="location-field-current">
        <MapPin size={17} aria-hidden="true" />
        {coordinates ? (
          <span>
            {coordinates[1].toFixed(4)}, {coordinates[0].toFixed(4)}
          </span>
        ) : (
          <span className="location-field-empty">{t("location.notSet")}</span>
        )}
      </div>
      <button type="button" className="location-field-btn" onClick={handleUseMyLocation} disabled={status === "requesting"}>
        <Navigation size={15} aria-hidden="true" />
        {status === "requesting" ? t("location.getting") : t("location.useMine")}
      </button>
      {status === "denied" && <p className="location-field-error">{t("location.denied")}</p>}
    </div>
  );
}
