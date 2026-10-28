
import { useState } from "react";
import {
  UserRound,
  MapPin,
  Wallet,
  Briefcase,
  Languages,
  Navigation,
  FileText,
  CheckCircle2,
  Sparkles,
} from "lucide-react";

import { LocationField } from "../common/LocationField";
import { Button } from "../common/Button";
import { useLanguage } from "../../hooks/useLanguage";
import { pickLocalizedText } from "../../utils/localizedText";
import { APP_LANGUAGES, LANGUAGE_LABELS } from "../../utils/enums";
import "../common/Form.css";
import "../../pages/ProfileFormRedesign.css";
export function WorkerProfileForm({
  profile,
  categories = [],
  saving,
  onSave,
}) {
  const { language, t } = useLanguage();

  const [fullName, setFullName] = useState(profile?.fullName || "");
  const [city, setCity] = useState(profile?.city || "");
  const [village, setVillage] = useState(profile?.village || "");
  const [expectedPay, setExpectedPay] = useState(profile?.expectedPay ?? "");
  const [experienceYears, setExperienceYears] = useState(
    profile?.experienceYears ?? ""
  );
  const [languages, setLanguages] = useState(profile?.languages || ["mr"]);
  const [preferredJobCategories, setPreferredJobCategories] = useState(
    (profile?.preferredJobCategories || []).map((category) =>
      typeof category === "object" ? category._id : category
    )
  );
  const [preferredWorkRadiusKm, setPreferredWorkRadiusKm] = useState(
    profile?.preferredWorkRadiusKm ?? 20
  );
  const [bioText, setBioText] = useState(profile?.bio?.[language] || "");
  const [coordinates, setCoordinates] = useState(
    profile?.location?.coordinates || null
  );

  const toggleLanguage = (lang) => {
    setLanguages((prev) =>
      prev.includes(lang)
        ? prev.filter((item) => item !== lang)
        : [...prev, lang]
    );
  };

  const toggleCategory = (categoryId) => {
    setPreferredJobCategories((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    onSave({
      fullName,
      city: city || undefined,
      village: village || undefined,
      expectedPay: expectedPay === "" ? undefined : Number(expectedPay),
      experienceYears:
        experienceYears === "" ? undefined : Number(experienceYears),
      languages,
      preferredJobCategories,
      preferredWorkRadiusKm: Number(preferredWorkRadiusKm),
      bio: { ...(profile?.bio || {}), [language]: bioText },
      coordinates: coordinates || undefined,
    });
  };

  const experienceOptions = [
    { label: "Fresher", value: 0, icon: "🌱" },
    { label: "1–2 years", value: 2, icon: "🛠️" },
    { label: "3–5 years", value: 4, icon: "⭐" },
    { label: "5+ years", value: 6, icon: "🏆" },
  ];

  const completionItems = [
    Boolean(fullName.trim()),
    Boolean(city.trim() || village.trim()),
    preferredJobCategories.length > 0,
    experienceYears !== "",
    expectedPay !== "",
    Boolean(bioText.trim()),
  ];

  const completion = Math.round(
    (completionItems.filter(Boolean).length / completionItems.length) * 100
  );

  return (
    <form className="pf-form worker-pf-form" onSubmit={handleSubmit}>
      <div className="pf-welcome">
        <div className="pf-welcome-icon">
          <Sparkles size={22} />
        </div>
        <div>
          <h3>Build your worker profile</h3>
          <p>Tell employers about yourself and the work you can do.</p>
        </div>
      </div>

      <div className="pf-completion-card">
        <div className="pf-completion-top">
          <div>
            <span className="pf-eyebrow">YOUR PROFILE</span>
            <h3>{completion}% complete</h3>
          </div>
          <div className="pf-completion-icon">
            <CheckCircle2 size={25} />
          </div>
        </div>
        <div
          className="pf-progress-track"
          role="progressbar"
          aria-valuenow={completion}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="pf-progress-fill"
            style={{ width: `${completion}%` }}
          />
        </div>
        <p>
          {completion === 100
            ? "Great! Your main profile details are filled in."
            : "Complete a few more details to help employers understand your experience."}
        </p>
      </div>

      <section className="pf-section">
        <div className="pf-section-heading">
          <div className="pf-section-icon pf-blue">
            <UserRound size={20} />
          </div>
          <div>
            <h3>Personal details</h3>
            <p>Basic information about you</p>
          </div>
          <span className="pf-section-number">01</span>
        </div>

        <div className="pf-field-grid">
          <label className="pf-field pf-field-full">
            <span>{t("profile.fullName")}</span>
            <input
              type="text"
              placeholder="Enter your full name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
            />
          </label>

          <label className="pf-field">
            <span>{t("common.city")}</span>
            <input
              type="text"
              placeholder="Your city"
              value={city}
              onChange={(event) => setCity(event.target.value)}
            />
          </label>

          <label className="pf-field">
            <span>{t("common.village")}</span>
            <input
              type="text"
              placeholder="Your village (optional)"
              value={village}
              onChange={(event) => setVillage(event.target.value)}
            />
          </label>

          <div className="pf-field pf-field-full">
            <span className="pf-label">
              <MapPin size={15} /> {t("common.location")}
            </span>
            <LocationField
              coordinates={coordinates}
              onChange={setCoordinates}
            />
            {!coordinates && (
              <small className="pf-hint">{t("profile.locationHint")}</small>
            )}
          </div>

          <div className="pf-field pf-field-full">
            <span className="pf-label">
              <Languages size={15} /> {t("profile.languages")}
            </span>
            <div className="pf-choice-grid">
              {APP_LANGUAGES.map((lang) => (
                <button
                  type="button"
                  key={lang}
                  className={`pf-choice ${
                    languages.includes(lang) ? "selected" : ""
                  }`}
                  aria-pressed={languages.includes(lang)}
                  onClick={() => toggleLanguage(lang)}
                >
                  <span className="pf-choice-check">
                    {languages.includes(lang) && <CheckCircle2 size={15} />}
                  </span>
                  {LANGUAGE_LABELS[lang]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="pf-section">
        <div className="pf-section-heading">
          <div className="pf-section-icon pf-green">
            <Briefcase size={20} />
          </div>
          <div>
            <h3>Professional details</h3>
            <p>What work you do and what you expect</p>
          </div>
          <span className="pf-section-number">02</span>
        </div>

        <div className="pf-field">
          <span className="pf-label">What type of work can you do?</span>
          <p className="pf-help">
            Choose all the jobs that match your skills.
          </p>

          {categories.length > 0 ? (
            <div className="pf-category-grid">
              {categories.map((category, index) => {
                const selected = preferredJobCategories.includes(category._id);
                const name =
                  pickLocalizedText(category.nameMultilingual, language) ||
                  category.name;

                return (
                  <button
                    type="button"
                    key={category._id}
                    className={`pf-category-card ${
                      selected ? "selected" : ""
                    }`}
                    aria-pressed={selected}
                    onClick={() => toggleCategory(category._id)}
                  >
                    <span className={`pf-category-symbol pf-symbol-${index % 4}`}>
                      {index % 4 === 0
                        ? "🛠️"
                        : index % 4 === 1
                          ? "🏗️"
                          : index % 4 === 2
                            ? "🔧"
                            : "⚡"}
                    </span>
                    <span className="pf-category-name">{name}</span>
                    {selected && <CheckCircle2 size={16} />}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="pf-hint">Job categories will appear here when available.</p>
          )}
        </div>

        <div className="pf-field">
          <span className="pf-label">How much experience do you have?</span>
          <div className="pf-experience-grid">
            {experienceOptions.map((option) => {
              const selected =
                experienceYears !== "" &&
                Number(experienceYears) >= option.value &&
                (option.value === 6
                  ? Number(experienceYears) >= 5
                  : option.value === 4
                    ? Number(experienceYears) >= 3 &&
                      Number(experienceYears) <= 5
                    : option.value === 2
                      ? Number(experienceYears) >= 1 &&
                        Number(experienceYears) <= 2
                      : Number(experienceYears) === 0);

              return (
                <button
                  type="button"
                  key={option.label}
                  className={`pf-experience-card ${
                    selected ? "selected" : ""
                  }`}
                  aria-pressed={selected}
                  onClick={() => setExperienceYears(String(option.value))}
                >
                  <span>{option.icon}</span>
                  <strong>{option.label}</strong>
                </button>
              );
            })}
          </div>
          <small className="pf-hint">
            You can also enter your exact years below.
          </small>
          <input
            className="pf-inline-number"
            type="number"
            min="0"
            step="1"
            placeholder="Exact years of experience"
            value={experienceYears}
            onChange={(event) => setExperienceYears(event.target.value)}
          />
        </div>

        <div className="pf-field-grid">
          <label className="pf-field">
            <span className="pf-label">
              <Wallet size={15} /> {t("profile.expectedPay")}
            </span>
            <div className="pf-input-with-prefix">
              <span>₹</span>
              <input
                type="number"
                min="0"
                placeholder="Expected pay"
                value={expectedPay}
                onChange={(event) => setExpectedPay(event.target.value)}
              />
            </div>
            <small className="pf-hint">Enter your expected pay amount.</small>
          </label>

          <label className="pf-field">
            <span className="pf-label">
              <Navigation size={15} /> {t("profile.radiusKm")}
            </span>
            <div className="pf-input-with-suffix">
              <input
                type="number"
                min="1"
                placeholder="20"
                value={preferredWorkRadiusKm}
                onChange={(event) =>
                  setPreferredWorkRadiusKm(event.target.value)
                }
              />
              <span>km</span>
            </div>
            <small className="pf-hint">How far can you travel for work?</small>
          </label>
        </div>

        <label className="pf-field">
          <span className="pf-label">
            <FileText size={15} />{" "}
            {t("profile.aboutYou", {
              language: LANGUAGE_LABELS[language],
            })}
          </span>
          <textarea
            rows={3}
            placeholder="Write a few lines about your skills and work experience..."
            value={bioText}
            onChange={(event) => setBioText(event.target.value)}
          />
          <small className="pf-hint">
            Keep it simple. Tell employers what you do best.
          </small>
        </label>
      </section>

      <div className="pf-form-footer">
        <div className="pf-footer-note">
          <CheckCircle2 size={18} />
          <span>Your changes will be saved to your profile.</span>
        </div>
        <Button type="submit" size="lg" disabled={saving}>
          {saving ? t("voice.guided.saving") : t("profile.save")}
        </Button>
      </div>
    </form>
  );
}
