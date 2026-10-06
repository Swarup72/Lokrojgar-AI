import { useEffect, useState } from "react";
import * as catalogApi from "../../api/catalog";
import { useLanguage } from "../../hooks/useLanguage";
import { pickLocalizedText } from "../../utils/localizedText";
import { PAY_TYPES, SHIFT_TYPES, APP_LANGUAGES, LANGUAGE_LABELS } from "../../utils/enums";
import { Button } from "../common/Button";
import { LocationField } from "../common/LocationField";
import "../common/Form.css";

export function JobForm({
  initialValues = {},
  onSubmit,
  submitLabel = "Review Job Details",
  secondaryAction = null,
  loading = false,
}) {
  const { language } = useLanguage();

  const [categories, setCategories] = useState([]);
  const [skills, setSkills] = useState([]);

  const [title, setTitle] = useState(initialValues.title || "");
  const [description, setDescription] = useState(initialValues.description || "");
  const [originalLanguage, setOriginalLanguage] = useState(initialValues.originalLanguage || language);
  const [categoryId, setCategoryId] = useState(initialValues.categoryId || "");
  const [skillIds, setSkillIds] = useState(initialValues.skillIds || []);
  const [city, setCity] = useState(initialValues.city || "");
  const [address, setAddress] = useState(initialValues.address || "");
  const [coordinates, setCoordinates] = useState(initialValues.coordinates || null);
  const [payType, setPayType] = useState(initialValues.payType || "daily");
  const [payAmount, setPayAmount] = useState(
    initialValues.payAmount !== undefined && initialValues.payAmount !== null ? String(initialValues.payAmount) : ""
  );
  const [requiredWorkers, setRequiredWorkers] = useState(initialValues.requiredWorkers || 1);
  const [startDate, setStartDate] = useState(
    initialValues.startDate ? initialValues.startDate.slice(0, 10) : ""
  );
  const [applicationDeadline, setApplicationDeadline] = useState(
    initialValues.applicationDeadline ? initialValues.applicationDeadline.slice(0, 10) : ""
  );
  const [experienceRequired, setExperienceRequired] = useState(
    initialValues.experienceRequired !== undefined && initialValues.experienceRequired !== null
      ? String(initialValues.experienceRequired)
      : ""
  );
  const [preferredLanguages, setPreferredLanguages] = useState(initialValues.preferredLanguages || []);
  const [shiftType, setShiftType] = useState(initialValues.shiftType || "flexible");
  const [startTime, setStartTime] = useState(initialValues.startTime || "");
  const [endTime, setEndTime] = useState(initialValues.endTime || "");
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    catalogApi.getCategories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    if (categoryId) {
      catalogApi.getSkills(categoryId).then(setSkills).catch(() => {});
    } else {
      setSkills([]);
    }
  }, [categoryId]);

  const togglePreferredLanguage = (lang) => {
    setPreferredLanguages((prev) =>
      prev.includes(lang) ? prev.filter((item) => item !== lang) : [...prev, lang]
    );
  };

  const toggleSkill = (skillId) => {
    setSkillIds((prev) =>
      prev.includes(skillId) ? prev.filter((id) => id !== skillId) : [...prev, skillId]
    );
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) {
      setFormError("Please select a location on the map.");
      return;
    }
    setFormError(null);

    const formValues = {
      title,
      description,
      originalLanguage,
      categoryId,
      skillIds,
      city: city || undefined,
      address: address || undefined,
      coordinates,
      payType,
      payAmount: Number(payAmount),
      requiredWorkers: Number(requiredWorkers),
      startDate,
      applicationDeadline: applicationDeadline || undefined,
      experienceRequired: experienceRequired !== "" ? Number(experienceRequired) : 0,
      preferredLanguages: preferredLanguages.length > 0 ? preferredLanguages : undefined,
      shiftType,
      startTime: startTime || undefined,
      endTime: endTime || undefined,
    };

    onSubmit(formValues);
  };

  return (
    <form onSubmit={handleSubmit} className="job-form">
      {formError && (
        <div className="error-banner" role="alert" style={{ marginBottom: 16 }}>
          <span>{formError}</span>
        </div>
      )}

      <label className="form-field">
        <span>Job title *</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Need 2 Plumbers for residential pipe fitting"
          required
        />
      </label>

      <label className="form-field">
        <span>
          Description <em>(optional)</em>
        </span>
        <textarea
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the job duties, tools needed, or site conditions..."
        />
      </label>

      <label className="form-field">
        <span>Language you are writing in</span>
        <select value={originalLanguage} onChange={(e) => setOriginalLanguage(e.target.value)}>
          {APP_LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {LANGUAGE_LABELS[lang]}
            </option>
          ))}
        </select>
        <span className="form-field-hint">
          LokRozgar AI will automatically translate your job into all supported languages.
        </span>
      </label>

      <div className="form-field-row">
        <label className="form-field">
          <span>Category *</span>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
            <option value="">Select a category</option>
            {categories.map((category) => (
              <option key={category._id} value={category._id}>
                {pickLocalizedText(category.nameMultilingual, language) || category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>City</span>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g. Sangli, Pune, Mumbai"
          />
        </label>
      </div>

      <label className="form-field">
        <span>Address or Landmark</span>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="e.g. Near Ganpati Temple, Market Yard"
        />
      </label>

      {skills.length > 0 && (
        <div className="form-field">
          <span>Skills needed</span>
          <div className="form-chip-group">
            {skills.map((skill) => (
              <button
                type="button"
                key={skill._id}
                className={`form-chip ${skillIds.includes(skill._id) ? "active" : ""}`}
                onClick={() => toggleSkill(skill._id)}
              >
                {pickLocalizedText(skill.nameMultilingual, language) || skill.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="form-field">
        <span>Job Location on Map *</span>
        <LocationField coordinates={coordinates} onChange={setCoordinates} />
      </label>

      <div className="form-field-row">
        <label className="form-field">
          <span>Pay type *</span>
          <select value={payType} onChange={(e) => setPayType(e.target.value)}>
            {PAY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Pay amount (₹) *</span>
          <input
            type="number"
            min="0"
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
            placeholder="e.g. 600"
            required
          />
        </label>
        <label className="form-field">
          <span>Workers needed *</span>
          <input
            type="number"
            min="1"
            value={requiredWorkers}
            onChange={(e) => setRequiredWorkers(e.target.value)}
            required
          />
        </label>
      </div>

      <div className="form-field-row">
        <label className="form-field">
          <span>Start date *</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
        </label>
        <label className="form-field">
          <span>
            Application deadline <em>(optional)</em>
          </span>
          <input
            type="date"
            value={applicationDeadline}
            onChange={(e) => setApplicationDeadline(e.target.value)}
          />
        </label>
        <label className="form-field">
          <span>
            Min experience (years) <em>(optional)</em>
          </span>
          <input
            type="number"
            min="0"
            value={experienceRequired}
            onChange={(e) => setExperienceRequired(e.target.value)}
            placeholder="0"
          />
        </label>
      </div>

      <div className="form-field-row">
        <label className="form-field">
          <span>Shift</span>
          <select value={shiftType} onChange={(e) => setShiftType(e.target.value)}>
            {SHIFT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>
            Start time <em>(optional)</em>
          </span>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </label>
        <label className="form-field">
          <span>
            End time <em>(optional)</em>
          </span>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </label>
      </div>

      <div className="form-field">
        <span>
          Preferred worker languages <em>(optional)</em>
        </span>
        <div className="form-chip-group">
          {APP_LANGUAGES.map((lang) => (
            <button
              type="button"
              key={lang}
              className={`form-chip ${preferredLanguages.includes(lang) ? "active" : ""}`}
              onClick={() => togglePreferredLanguage(lang)}
            >
              {LANGUAGE_LABELS[lang]}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 24, alignItems: "center" }}>
        <Button type="submit" size="lg" disabled={loading}>
          {loading ? "Processing..." : submitLabel}
        </Button>
        {secondaryAction}
      </div>
    </form>
  );
}
