import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as jobsApi from "../api/jobs";
import * as catalogApi from "../api/catalog";
import { normalizeError } from "../api/client";
import { useLanguage } from "../hooks/useLanguage";
import { pickLocalizedText } from "../utils/localizedText";
import { PAY_TYPES, SHIFT_TYPES, APP_LANGUAGES, LANGUAGE_LABELS } from "../utils/enums";
import { Card } from "../components/common/Card";
import { Button } from "../components/common/Button";
import { ErrorBanner } from "../components/common/ErrorBanner";
import { LocationField } from "../components/common/LocationField";
import "../components/common/Form.css";
import "./PostJobPage.css";

export function PostJobPage() {
  const { language } = useLanguage();
  const navigate = useNavigate();

  const [categories, setCategories] = useState([]);
  const [skills, setSkills] = useState([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [originalLanguage, setOriginalLanguage] = useState(language);
  const [categoryId, setCategoryId] = useState("");
  const [skillIds, setSkillIds] = useState([]);
  const [city, setCity] = useState("");
  const [coordinates, setCoordinates] = useState(null);
  const [payType, setPayType] = useState("daily");
  const [payAmount, setPayAmount] = useState("");
  const [requiredWorkers, setRequiredWorkers] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [experienceRequired, setExperienceRequired] = useState("");
  const [preferredLanguages, setPreferredLanguages] = useState([]);
  const [shiftType, setShiftType] = useState("flexible");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    catalogApi.getCategories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    catalogApi.getSkills(categoryId || undefined).then(setSkills).catch(() => {});
    setSkillIds([]);
  }, [categoryId]);

  const togglePreferredLanguage = (lang) => {
    setPreferredLanguages((prev) => (prev.includes(lang) ? prev.filter((item) => item !== lang) : [...prev, lang]));
  };

  const toggleSkill = (skillId) => {
    setSkillIds((prev) => (prev.includes(skillId) ? prev.filter((id) => id !== skillId) : [...prev, skillId]));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!coordinates) {
      setError({ status: 400, message: "Location is required.", isNetworkError: false });
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const job = await jobsApi.create({
        // The backend's Zod validator requires title/description as
        // {mr?,hi?,en?} objects, not plain strings - see api/jobs.js.
        title: { [originalLanguage]: title },
        description: description ? { [originalLanguage]: description } : undefined,
        originalLanguage,
        categoryId,
        skillIds,
        city: city || undefined,
        coordinates,
        payType,
        payAmount: Number(payAmount),
        requiredWorkers: Number(requiredWorkers),
        startDate,
        experienceRequired: experienceRequired === "" ? undefined : Number(experienceRequired),
        preferredLanguages: preferredLanguages.length > 0 ? preferredLanguages : undefined,
        shiftType,
      });
      navigate("/employer-dashboard", { state: { newJob: job } });
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container post-job-page">
      <h1>Post a Job</h1>

      <Card>
        <form onSubmit={handleSubmit}>
          {error && <ErrorBanner error={error} />}

          <label className="form-field">
            <span>Job title</span>
            <input type="text" value={title} onChange={(event) => setTitle(event.target.value)} required />
          </label>

          <label className="form-field">
            <span>
              Description <em>(optional)</em>
            </span>
            <textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>

          <label className="form-field">
            <span>Language you're writing in</span>
            <select value={originalLanguage} onChange={(event) => setOriginalLanguage(event.target.value)}>
              {APP_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {LANGUAGE_LABELS[lang]}
                </option>
              ))}
            </select>
          </label>

          <div className="form-field-row">
            <label className="form-field">
              <span>Category</span>
              <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required>
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
              <input type="text" value={city} onChange={(event) => setCity(event.target.value)} />
            </label>
          </div>

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
            <span>Location</span>
            <LocationField coordinates={coordinates} onChange={setCoordinates} />
          </label>

          <div className="form-field-row">
            <label className="form-field">
              <span>Pay type</span>
              <select value={payType} onChange={(event) => setPayType(event.target.value)}>
                {PAY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Pay amount (₹)</span>
              <input type="number" min="0" value={payAmount} onChange={(event) => setPayAmount(event.target.value)} required />
            </label>
            <label className="form-field">
              <span>Workers needed</span>
              <input
                type="number"
                min="1"
                value={requiredWorkers}
                onChange={(event) => setRequiredWorkers(event.target.value)}
                required
              />
            </label>
          </div>

          <div className="form-field-row">
            <label className="form-field">
              <span>Start date</span>
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
            </label>
            <label className="form-field">
              <span>
                Experience required (years) <em>(optional)</em>
              </span>
              <input
                type="number"
                min="0"
                value={experienceRequired}
                onChange={(event) => setExperienceRequired(event.target.value)}
              />
            </label>
            <label className="form-field">
              <span>Shift</span>
              <select value={shiftType} onChange={(event) => setShiftType(event.target.value)}>
                {SHIFT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
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

          <Button type="submit" size="lg" disabled={submitting}>
            {submitting ? "Posting..." : "Post Job"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
