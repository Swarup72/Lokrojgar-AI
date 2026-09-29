import { useState } from "react";
import { User, MapPin, Briefcase, Wallet, Languages, Clock, FileText, ArrowLeft, CheckCircle } from "lucide-react";
import { AVAILABILITY_OPTIONS, APP_LANGUAGES, LANGUAGE_LABELS } from "../../utils/enums";
import "../common/Form.css";
import "./VoiceProfileReview.css";

/**
 * Editable review of the AI-extracted fields, before anything is persisted
 * to the real WorkerProfile. Every field is pre-filled only when the
 * backend actually returned a value - a null/missing field renders as a
 * genuinely empty, editable input, never a fabricated placeholder value.
 *
 * `skills`/`preferredJobCategories` are shown read-only: the backend
 * silently ignores them even if included in the confirm payload (they're
 * free text, not catalog ObjectIds), so this component never sends them.
 *
 * @param {{extractedFields: object, recordedLanguage: string, onConfirm: (fields:object) => void, onBack: () => void, saving: boolean}} props
 */
export function VoiceProfileReview({ extractedFields, recordedLanguage, onConfirm, onBack, saving }) {
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
    onConfirm(confirmedFields);
  };

  return (
    <form className="voice-review" onSubmit={handleSubmit}>
      <h2 className="voice-review-title">Review Your Profile</h2>
      <p className="voice-review-subtitle">
        Please check the information extracted from your voice. You can edit anything before saving.
      </p>

      <label className="form-field">
        <span>
          <User size={15} aria-hidden="true" /> Full Name
        </span>
        <input type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Not mentioned" />
      </label>

      <div className="form-field-row">
        <label className="form-field">
          <span>
            <MapPin size={15} aria-hidden="true" /> City
          </span>
          <input type="text" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Not mentioned" />
        </label>
        <label className="form-field">
          <span>
            <Briefcase size={15} aria-hidden="true" /> Experience (years)
          </span>
          <input
            type="number"
            min="0"
            value={experienceYears}
            onChange={(event) => setExperienceYears(event.target.value)}
            placeholder="Not mentioned"
          />
        </label>
        <label className="form-field">
          <span>
            <Wallet size={15} aria-hidden="true" /> Expected Pay (₹)
          </span>
          <input
            type="number"
            min="0"
            value={expectedPay}
            onChange={(event) => setExpectedPay(event.target.value)}
            placeholder="Not mentioned"
          />
        </label>
      </div>

      <label className="form-field">
        <span>
          <Clock size={15} aria-hidden="true" /> Availability
        </span>
        <select value={availability} onChange={(event) => setAvailability(event.target.value)}>
          <option value="">Not mentioned</option>
          {AVAILABILITY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <div className="form-field">
        <span>
          <Languages size={15} aria-hidden="true" /> Languages
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
          <FileText size={15} aria-hidden="true" /> About You ({LANGUAGE_LABELS[recordedLanguage] || recordedLanguage})
        </span>
        <textarea rows={3} value={bio} onChange={(event) => setBio(event.target.value)} placeholder="Not mentioned" />
        <em className="voice-review-hint">This updates your bio in {LANGUAGE_LABELS[recordedLanguage] || recordedLanguage} only.</em>
      </label>

      {(extractedFields.skills?.length > 0 || extractedFields.preferredJobCategories?.length > 0) && (
        <div className="voice-review-heard">
          <p>
            <strong>We also heard:</strong>
          </p>
          {extractedFields.skills?.length > 0 && (
            <p>Skills: {extractedFields.skills.join(", ")}</p>
          )}
          {extractedFields.preferredJobCategories?.length > 0 && (
            <p>Interested in: {extractedFields.preferredJobCategories.join(", ")}</p>
          )}
          <p className="voice-review-heard-note">
            These aren't saved automatically - add them from your Skills section on your profile after finishing here.
          </p>
        </div>
      )}

      <div className="voice-review-actions">
        <button type="button" className="btn btn-secondary" onClick={onBack} disabled={saving}>
          <ArrowLeft size={16} aria-hidden="true" /> Re-record
        </button>
        <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
          <CheckCircle size={18} aria-hidden="true" />
          {saving ? "Saving..." : "Confirm & Save Profile"}
        </button>
      </div>
    </form>
  );
}
