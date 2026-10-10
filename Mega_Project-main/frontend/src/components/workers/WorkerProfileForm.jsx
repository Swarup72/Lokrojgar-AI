import { useState } from "react";
import { LocationField } from "../common/LocationField";
import { Button } from "../common/Button";
import { useLanguage } from "../../hooks/useLanguage";
import { pickLocalizedText } from "../../utils/localizedText";
import { APP_LANGUAGES, LANGUAGE_LABELS } from "../../utils/enums";
import "../common/Form.css";

/**
 * @param {{profile: object|null, categories: object[], saving: boolean, onSave: (payload:object) => void}} props
 */
export function WorkerProfileForm({ profile, categories, saving, onSave }) {
  const { language, t } = useLanguage();

  const [fullName, setFullName] = useState(profile?.fullName || "");
  const [city, setCity] = useState(profile?.city || "");
  const [village, setVillage] = useState(profile?.village || "");
  const [expectedPay, setExpectedPay] = useState(profile?.expectedPay ?? "");
  const [experienceYears, setExperienceYears] = useState(profile?.experienceYears ?? "");
  const [languages, setLanguages] = useState(profile?.languages || ["mr"]);
  const [preferredJobCategories, setPreferredJobCategories] = useState(
    (profile?.preferredJobCategories || []).map((category) => (typeof category === "object" ? category._id : category))
  );
  const [preferredWorkRadiusKm, setPreferredWorkRadiusKm] = useState(profile?.preferredWorkRadiusKm ?? 20);
  const [bioText, setBioText] = useState(profile?.bio?.[language] || "");
  const [coordinates, setCoordinates] = useState(profile?.location?.coordinates || null);

  const toggleLanguage = (lang) => {
    setLanguages((prev) => (prev.includes(lang) ? prev.filter((item) => item !== lang) : [...prev, lang]));
  };

  const toggleCategory = (categoryId) => {
    setPreferredJobCategories((prev) =>
      prev.includes(categoryId) ? prev.filter((id) => id !== categoryId) : [...prev, categoryId]
    );
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSave({
      fullName,
      city: city || undefined,
      village: village || undefined,
      expectedPay: expectedPay === "" ? undefined : Number(expectedPay),
      experienceYears: experienceYears === "" ? undefined : Number(experienceYears),
      languages,
      preferredJobCategories,
      preferredWorkRadiusKm: Number(preferredWorkRadiusKm),
      // Merge into the existing multilingual map so editing one language's
      // bio never wipes out what was written for the others - the backend
      // does a full field replace, not a per-key merge.
      bio: { ...(profile?.bio || {}), [language]: bioText },
      coordinates: coordinates || undefined,
    });
  };

  return (
    <form className="worker-profile-form" onSubmit={handleSubmit}>
      <label className="form-field">
        <span>{t("profile.fullName")}</span>
        <input type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} required />
      </label>

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
        {/* Not required - a profile with no location is valid, and nothing
            invents one. But distance is one of the six matching factors, so
            without it that factor simply cannot be scored. Saying so is more
            useful than silently ranking them against a guessed city. */}
        {!coordinates && (
          <small className="form-hint">{t("profile.locationHint")}</small>
        )}
      </label>

      <div className="form-field-row">
        <label className="form-field">
          <span>{t("profile.expectedPay")}</span>
          <input type="number" min="0" value={expectedPay} onChange={(event) => setExpectedPay(event.target.value)} />
        </label>
        <label className="form-field">
          <span>{t("profile.experienceYears")}</span>
          <input
            type="number"
            min="0"
            value={experienceYears}
            onChange={(event) => setExperienceYears(event.target.value)}
          />
        </label>
        <label className="form-field">
          <span>{t("profile.radiusKm")}</span>
          <input
            type="number"
            min="1"
            value={preferredWorkRadiusKm}
            onChange={(event) => setPreferredWorkRadiusKm(event.target.value)}
          />
        </label>
      </div>

      <div className="form-field">
        <span>{t("profile.languages")}</span>
        <div className="form-chip-group">
          {APP_LANGUAGES.map((lang) => (
            <button
              type="button"
              key={lang}
              className={`form-chip ${languages.includes(lang) ? "active" : ""}`}
              onClick={() => toggleLanguage(lang)}
            >
              {LANGUAGE_LABELS[lang]}
            </button>
          ))}
        </div>
      </div>

      {categories.length > 0 && (
        <div className="form-field">
          <span>{t("profile.categories")}</span>
          <div className="form-chip-group">
            {categories.map((category) => (
              <button
                type="button"
                key={category._id}
                className={`form-chip ${preferredJobCategories.includes(category._id) ? "active" : ""}`}
                onClick={() => toggleCategory(category._id)}
              >
                {pickLocalizedText(category.nameMultilingual, language) || category.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="form-field">
        <span>{t("profile.aboutYou", { language: LANGUAGE_LABELS[language] })}</span>
        <textarea rows={4} value={bioText} onChange={(event) => setBioText(event.target.value)} />
      </label>

      <Button type="submit" size="lg" disabled={saving}>
        {saving ? t("voice.guided.saving") : t("profile.save")}
      </Button>
    </form>
  );
}
