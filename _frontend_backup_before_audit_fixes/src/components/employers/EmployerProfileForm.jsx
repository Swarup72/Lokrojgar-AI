import { useState } from "react";
import { LocationField } from "../common/LocationField";
import { Button } from "../common/Button";
import { useLanguage } from "../../hooks/useLanguage";
import { LANGUAGE_LABELS } from "../../utils/enums";
import "../common/Form.css";

/** @param {{profile: object|null, saving: boolean, onSave: (payload:object) => void}} props */
export function EmployerProfileForm({ profile, saving, onSave }) {
  const { language, t } = useLanguage();

  const [businessName, setBusinessName] = useState(profile?.businessName || "");
  const [businessType, setBusinessType] = useState(profile?.businessType || "");
  const [city, setCity] = useState(profile?.city || "");
  const [village, setVillage] = useState(profile?.village || "");
  const [bioText, setBioText] = useState(profile?.bio?.[language] || "");
  const [coordinates, setCoordinates] = useState(profile?.location?.coordinates || null);

  const handleSubmit = (event) => {
    event.preventDefault();
    onSave({
      businessName,
      businessType,
      city: city || undefined,
      village: village || undefined,
      bio: { ...(profile?.bio || {}), [language]: bioText },
      coordinates: coordinates || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-field-row">
        <label className="form-field">
          <span>{t("employerProfile.businessName")}</span>
          <input type="text" value={businessName} onChange={(event) => setBusinessName(event.target.value)} />
        </label>
        <label className="form-field">
          <span>{t("employerProfile.businessType")}</span>
          <input type="text" value={businessType} onChange={(event) => setBusinessType(event.target.value)} required />
        </label>
      </div>

      <div className="form-field-row">
        <label className="form-field">
          <span>{t("common.city")}</span>
          <input type="text" value={city} onChange={(event) => setCity(event.target.value)} />
        </label>
        <label className="form-field">
          <span>{t("common.village")}</span>
          <input type="text" value={village} onChange={(event) => setVillage(event.target.value)} />
        </label>
      </div>

      <label className="form-field">
        <span>{t("common.location")}</span>
        <LocationField coordinates={coordinates} onChange={setCoordinates} />
        {!coordinates && (
          <small className="form-hint">{t("employerProfile.locationHint")}</small>
        )}
      </label>

      <label className="form-field">
        <span>{t("employerProfile.aboutBusiness", { language: LANGUAGE_LABELS[language] })}</span>
        <textarea rows={4} value={bioText} onChange={(event) => setBioText(event.target.value)} />
      </label>

      <Button type="submit" size="lg" disabled={saving}>
        {saving ? t("voice.guided.saving") : t("profile.save")}
      </Button>
    </form>
  );
}
