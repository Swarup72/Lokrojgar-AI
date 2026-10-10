import { useState } from "react";
import { User, MapPin, Briefcase, Wallet, Languages, Clock, FileText, ArrowLeft, CheckCircle } from "lucide-react";
import { AVAILABILITY_OPTIONS, APP_LANGUAGES, LANGUAGE_LABELS } from "../../utils/enums";
import { useLanguage } from "../../hooks/useLanguage";
import { AVAILABILITY_KEYS } from "../../utils/enumLabels";
import "../common/Form.css";
import "./VoiceProfileReview.css";

/**
 * Editable review of the AI-extracted fields, before anything is persisted
 * to the real WorkerProfile. Every field is pre-filled only when the
 * backend actually returned a value - a null/missing field renders as a
 * genuinely empty, editable input, never a fabricated placeholder value.
 *
 * `skills`/`preferredJobCategories` are shown read-only (the worker cannot
 * edit the free text here) but ARE sent to confirm - the backend resolves
 * them against the real Skill/JobCategory catalog and reports back which
 * ones it could link vs. which stayed unrecognized (shown on the success
 * screen), rather than silently discarding them.
 *
 * @param {{extractedFields: object, recordedLanguage: string, onConfirm: (fields:object) => void, onBack: () => void, saving: boolean}} props
 */
export function VoiceProfileReview({ extractedFields, recordedLanguage, onConfirm, onBack, saving }) {
  const { t } = useLanguage();
  const [fullName, setFullName] = useState(extractedFields.fullName || "");
  const [city, setCity] = useState(extractedFields.city || "");
  const [expectedPay, setExpectedPay] = useState(extractedFields.expectedPay ?? "");
  const [experienceYears, setExperienceYears] = useState(extractedFields.experienceYears ?? "");
  const [availability, setAvailability] = useState(extractedFields.availability || "");
  const [languages, setLanguages] = useState(extractedFields.languages || []);
  const [bio, setBio] = useState(extractedFields.bio || "");

  const toggleLanguage = (lang) => {
    setLanguages((prev) => (prev.includes(lang) ? prev.filter((item) => item !== lang) : [...prev, lang]));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const confirmedFields = {};
    if (fullName) confirmedFields.fullName = fullName;
    if (city) confirmedFields.city = city;
    if (expectedPay !== "") confirmedFields.expectedPay = Number(expectedPay);
    if (experienceYears !== "") confirmedFields.experienceYears = Number(experienceYears);
    if (availability) confirmedFields.availability = availability;
    if (languages.length > 0) confirmedFields.languages = languages;
    if (bio) confirmedFields.bio = bio;
    if (extractedFields.skills?.length > 0) confirmedFields.skills = extractedFields.skills;
    if (extractedFields.preferredJobCategories?.length > 0) {
      confirmedFields.preferredJobCategories = extractedFields.preferredJobCategories;
    }
    onConfirm(confirmedFields);
  };

  return (
    <form className="voice-review" onSubmit={handleSubmit}>
      <h2 className="voice-review-title">{t("voice.review.title")}</h2>
      <p className="voice-review-subtitle">{t("voice.review.subtitle")}</p>

      <label className="form-field">
        <span>
          <User size={15} aria-hidden="true" /> {t("profile.fullName")}
        </span>
        <input type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder={t("voice.review.notMentioned")} />
      </label>

      <div className="form-field-row">
        <label className="form-field">
          <span>
            <MapPin size={15} aria-hidden="true" /> {t("common.city")}
          </span>
          <input type="text" value={city} onChange={(event) => setCity(event.target.value)} placeholder={t("voice.review.notMentioned")} />
        </label>
        <label className="form-field">
          <span>
            <Briefcase size={15} aria-hidden="true" /> {t("profile.experienceYears")}
          </span>
          <input
            type="number"
            min="0"
            value={experienceYears}
            onChange={(event) => setExperienceYears(event.target.value)}
            placeholder={t("voice.review.notMentioned")}
          />
        </label>
        <label className="form-field">
          <span>
            <Wallet size={15} aria-hidden="true" /> {t("profile.expectedPay")}
          </span>
          <input
            type="number"
            min="0"
            value={expectedPay}
            onChange={(event) => setExpectedPay(event.target.value)}
            placeholder={t("voice.review.notMentioned")}
          />
        </label>
      </div>

      <label className="form-field">
        <span>
          <Clock size={15} aria-hidden="true" /> {t("voice.guided.availability.label")}
        </span>
        <select value={availability} onChange={(event) => setAvailability(event.target.value)}>
          <option value="">{t("voice.review.notMentioned")}</option>
          {AVAILABILITY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {t(AVAILABILITY_KEYS[option])}
            </option>
          ))}
        </select>
      </label>

      <div className="form-field">
        <span>
          <Languages size={15} aria-hidden="true" /> {t("profile.languages")}
        </span>
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

      <label className="form-field">
        <span>
          <FileText size={15} aria-hidden="true" /> {t("profile.aboutYou", { language: LANGUAGE_LABELS[recordedLanguage] || recordedLanguage })}
        </span>
        <textarea rows={3} value={bio} onChange={(event) => setBio(event.target.value)} placeholder={t("voice.review.notMentioned")} />
        <em className="voice-review-hint">{t("voice.review.bioLanguageNote", { language: LANGUAGE_LABELS[recordedLanguage] || recordedLanguage })}</em>
      </label>

      {(extractedFields.skills?.length > 0 || extractedFields.preferredJobCategories?.length > 0) && (
        <div className="voice-review-heard">
          <p>
            <strong>{t("voice.review.alsoHeard")}</strong>
          </p>
          {extractedFields.skills?.length > 0 && (
            <p>{t("voice.review.heardSkills", { skills: extractedFields.skills.join(", ") })}</p>
          )}
          {extractedFields.preferredJobCategories?.length > 0 && (
            <p>{t("voice.review.heardInterests", { interests: extractedFields.preferredJobCategories.join(", ") })}</p>
          )}
          <p className="voice-review-heard-note">{t("voice.review.heardNote")}</p>
        </div>
      )}

      <div className="voice-review-actions">
        <button type="button" className="btn btn-secondary" onClick={onBack} disabled={saving}>
          <ArrowLeft size={16} aria-hidden="true" /> {t("voice.review.reRecord")}
        </button>
        <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
          <CheckCircle size={18} aria-hidden="true" />
          {saving ? t("voice.guided.saving") : t("voice.review.confirmSave")}
        </button>
      </div>
    </form>
  );
}
