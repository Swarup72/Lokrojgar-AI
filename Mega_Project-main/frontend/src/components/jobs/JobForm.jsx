import { useEffect, useState } from "react";
import * as catalogApi from "../../api/catalog";
import { useLanguage } from "../../hooks/useLanguage";
import { pickLocalizedText } from "../../utils/localizedText";
import { PAY_TYPES, SHIFT_TYPES, APP_LANGUAGES, LANGUAGE_LABELS } from "../../utils/enums";
import { PAY_TYPE_KEYS, SHIFT_TYPE_KEYS } from "../../utils/enumLabels";
import { Button } from "../common/Button";
import { LocationField } from "../common/LocationField";
import { SkillPicker } from "./SkillPicker";
import "../common/Form.css";
import "./JobForm.css";

export function JobForm({
  initialValues = {},
  onSubmit,
  submitLabel = null,
  secondaryAction = null,
  loading = false,
}) {
  const { language, t } = useLanguage();

  const [categories, setCategories] = useState([]);

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

  const togglePreferredLanguage = (lang) => {
    setPreferredLanguages((prev) =>
      prev.includes(lang) ? prev.filter((item) => item !== lang) : [...prev, lang]
    );
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) {
      setFormError(t("jobs.form.locationRequired"));
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

      {/* SECTION 1: Basic Job Information */}
      <section className="job-form-section">
        <div className="job-form-section-header">
          <div className="job-form-section-badge">1</div>
          <div className="job-form-section-title-wrap">
            <h3 className="job-form-section-title">{t("jobs.form.section1Title")}</h3>
            <p className="job-form-section-desc">{t("jobs.form.section1Desc")}</p>
          </div>
        </div>

        <div className="job-form-section-body">
          <label className="form-field">
            <span>{t("jobs.form.titleRequired")}</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("jobs.form.titlePlaceholder")}
              required
            />
          </label>

          <label className="form-field">
            <span>
              {t("jobs.form.description")} <em>({t("common.optional")})</em>
            </span>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("jobs.form.descriptionPlaceholder")}
            />
          </label>

          <label className="form-field">
            <span>{t("jobs.form.writingLanguage")}</span>
            <select value={originalLanguage} onChange={(e) => setOriginalLanguage(e.target.value)}>
              {APP_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {LANGUAGE_LABELS[lang]}
                </option>
              ))}
            </select>
            <span className="form-field-hint">{t("jobs.form.autoTranslateHint")}</span>
          </label>
        </div>
      </section>

      {/* SECTION 2: Job Category and Required Skills */}
      <section className="job-form-section">
        <div className="job-form-section-header">
          <div className="job-form-section-badge">2</div>
          <div className="job-form-section-title-wrap">
            <h3 className="job-form-section-title">{t("jobs.form.section2Title")}</h3>
            <p className="job-form-section-desc">{t("jobs.form.section2Desc")}</p>
          </div>
        </div>

        <div className="job-form-section-body">
          <label className="form-field">
            <span>{t("jobs.form.categoryRequired")}</span>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
              <option value="">{t("jobs.form.selectCategory")}</option>
              {categories.map((category) => (
                <option key={category._id} value={category._id}>
                  {pickLocalizedText(category.nameMultilingual, language) || category.name}
                </option>
              ))}
            </select>
          </label>

          <div className="form-field">
            <span>{t("jobs.form.skillsNeeded")}</span>
            <p className="form-hint">{t("jobs.form.skillsHint")}</p>
            <SkillPicker
              categoryId={categoryId}
              title={title}
              description={description}
              value={skillIds}
              onChange={setSkillIds}
            />
          </div>
        </div>
      </section>

      {/* SECTION 3: Work Location */}
      <section className="job-form-section">
        <div className="job-form-section-header">
          <div className="job-form-section-badge">3</div>
          <div className="job-form-section-title-wrap">
            <h3 className="job-form-section-title">{t("jobs.form.section3Title")}</h3>
            <p className="job-form-section-desc">{t("jobs.form.section3Desc")}</p>
          </div>
        </div>

        <div className="job-form-section-body">
          <div className="form-field-row">
            <label className="form-field">
              <span>{t("common.city")}</span>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder={t("jobs.form.cityPlaceholder")}
              />
            </label>

            <label className="form-field">
              <span>{t("jobs.form.address")}</span>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={t("jobs.form.addressPlaceholder")}
              />
            </label>
          </div>

          <label className="form-field">
            <span>{t("jobs.form.mapLocationRequired")}</span>
            <LocationField coordinates={coordinates} onChange={setCoordinates} />
          </label>
        </div>
      </section>

      {/* SECTION 4: Pay and Work Details */}
      <section className="job-form-section">
        <div className="job-form-section-header">
          <div className="job-form-section-badge">4</div>
          <div className="job-form-section-title-wrap">
            <h3 className="job-form-section-title">{t("jobs.form.section4Title")}</h3>
            <p className="job-form-section-desc">{t("jobs.form.section4Desc")}</p>
          </div>
        </div>

        <div className="job-form-section-body">
          <div className="form-field-row">
            <label className="form-field">
              <span>{t("jobs.form.payTypeRequired")}</span>
              <select value={payType} onChange={(e) => setPayType(e.target.value)}>
                {PAY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(PAY_TYPE_KEYS[type])}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>{t("jobs.form.payAmountRequired")}</span>
              <input
                type="number"
                min="0"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder={t("jobs.form.payAmountPlaceholder")}
                required
              />
            </label>
            <label className="form-field">
              <span>{t("jobs.form.workersRequired")}</span>
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
              <span>{t("jobs.form.startDateRequired")}</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </label>
            <label className="form-field">
              <span>
                {t("deadline")} <em>({t("common.optional")})</em>
              </span>
              <input
                type="date"
                value={applicationDeadline}
                onChange={(e) => setApplicationDeadline(e.target.value)}
              />
            </label>
            <label className="form-field">
              <span>
                {t("jobs.form.minExperience")} <em>({t("common.optional")})</em>
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
              <span>{t("jobs.form.shiftLabel")}</span>
              <select value={shiftType} onChange={(e) => setShiftType(e.target.value)}>
                {SHIFT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(SHIFT_TYPE_KEYS[type])}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>
                {t("jobs.form.startTime")} <em>({t("common.optional")})</em>
              </span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </label>
            <label className="form-field">
              <span>
                {t("jobs.form.endTime")} <em>({t("common.optional")})</em>
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
              {t("jobs.form.preferredLanguages")} <em>({t("common.optional")})</em>
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
        </div>
      </section>

      {/* SECTION 5: Review and Publish */}
      <section className="job-form-section job-form-section-publish">
        <div className="job-form-section-header">
          <div className="job-form-section-badge">5</div>
          <div className="job-form-section-title-wrap">
            <h3 className="job-form-section-title">{t("jobs.form.section5Title")}</h3>
            <p className="job-form-section-desc">{t("jobs.form.section5Desc")}</p>
          </div>
        </div>

        <div className="job-form-actions">
          <Button type="submit" size="lg" disabled={loading}>
            {loading ? t("common.processing") : (submitLabel ?? t("jobs.form.reviewDetails"))}
          </Button>
          {secondaryAction}
        </div>
      </section>
    </form>
  );
}
