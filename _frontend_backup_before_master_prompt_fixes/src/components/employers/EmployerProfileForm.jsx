import { useState } from "react";
import {
  Mic,
  X,
  CheckCircle2,
  LoaderCircle,
  Sparkles,
  Building2,
} from "lucide-react";
import { LocationField } from "../common/LocationField";
import { Button } from "../common/Button";
import { ErrorBanner } from "../common/ErrorBanner";
import { VoiceRecorder } from "../voice/VoiceRecorder";
import { useLanguage } from "../../hooks/useLanguage";
import { LANGUAGE_LABELS, APP_LANGUAGES } from "../../utils/enums";
import * as voiceProfileApi from "../../api/voiceProfile";
import { normalizeError } from "../../api/client";
import "../common/Form.css";
import "./EmployerProfileForm.css";

const VOICE_FIELDS = [
  { id: "businessName", labelKey: "voice.guided.businessName.label", promptKey: "voice.guided.businessName.prompt" },
  { id: "businessType", labelKey: "voice.guided.businessType.label", promptKey: "voice.guided.businessType.prompt" },
  { id: "city", labelKey: "voice.guided.employer.city.label", promptKey: "voice.guided.employer.city.prompt" },
  { id: "village", labelKey: "common.village", promptKey: "voice.speakBusinessDetailsHint" },
];

/** @param {{profile: object|null, saving: boolean, onSave: (payload:object) => void}} props */
export function EmployerProfileForm({ profile, saving, onSave }) {
  const { language, t } = useLanguage();

  const [businessName, setBusinessName] = useState(profile?.businessName || "");
  const [businessType, setBusinessType] = useState(profile?.businessType || "");
  const [city, setCity] = useState(profile?.city || "");
  const [village, setVillage] = useState(profile?.village || "");
  const [bioText, setBioText] = useState(profile?.bio?.[language] || "");
  const [coordinates, setCoordinates] = useState(profile?.location?.coordinates || null);

  // Voice extraction states
  const [showVoiceSection, setShowVoiceSection] = useState(false);
  const [spokenLanguage, setSpokenLanguage] = useState(language || "mr");
  const [activeVoiceField, setActiveVoiceField] = useState("businessName");
  const [processingAudio, setProcessingAudio] = useState(false);
  const [voiceResult, setVoiceResult] = useState(null);
  const [voiceError, setVoiceError] = useState(null);
  const [extractedFlags, setExtractedFlags] = useState({});

  const handleVoiceRecording = async (audioBlob) => {
    if (!audioBlob) return;

    setProcessingAudio(true);
    setVoiceError(null);
    setVoiceResult(null);

    // Map field to backend-supported employer voice steps
    // Backend supports: fullName, businessName, businessType, city
    const backendField = activeVoiceField === "village" ? "city" : activeVoiceField;

    try {
      const result = await voiceProfileApi.submitGuidedStep(
        audioBlob,
        spokenLanguage,
        backendField,
        "employer"
      );

      if (result.ok && result.value) {
        const extractedVal = String(result.value).trim();
        if (extractedVal) {
          if (activeVoiceField === "businessName") {
            setBusinessName(extractedVal);
          } else if (activeVoiceField === "businessType") {
            setBusinessType(extractedVal);
          } else if (activeVoiceField === "city") {
            setCity(extractedVal);
          } else if (activeVoiceField === "village") {
            setVillage(extractedVal);
          }

          setExtractedFlags((prev) => ({ ...prev, [activeVoiceField]: true }));
        }

        setVoiceResult({
          ok: true,
          transcript: result.transcript,
          value: result.value,
          field: activeVoiceField,
        });

        // Automatically advance to the next field in sequence
        const currentIndex = VOICE_FIELDS.findIndex((f) => f.id === activeVoiceField);
        if (currentIndex < VOICE_FIELDS.length - 1) {
          setActiveVoiceField(VOICE_FIELDS[currentIndex + 1].id);
        }
      } else {
        setVoiceResult({
          ok: false,
          transcript: result.transcript,
          reason: result.reason || "generic",
          field: activeVoiceField,
        });
      }
    } catch (err) {
      setVoiceError(normalizeError(err));
    } finally {
      setProcessingAudio(false);
    }
  };

  const handleFieldMicClick = (fieldId) => {
    setActiveVoiceField(fieldId);
    setShowVoiceSection(true);
    setVoiceResult(null);
    setVoiceError(null);
  };

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

  const currentFieldConfig =
    VOICE_FIELDS.find((f) => f.id === activeVoiceField) || VOICE_FIELDS[0];

  return (
    <form onSubmit={handleSubmit} className="employer-profile-form">
      {/* Top action banner for voice assistance */}
      <div className="employer-voice-action-bar">
        <div className="employer-voice-intro">
          <Sparkles size={18} aria-hidden="true" />
          <span>{t("voice.speakBusinessDetails")}</span>
        </div>
        <button
          type="button"
          className="employer-voice-trigger-btn"
          onClick={() => setShowVoiceSection(!showVoiceSection)}
          aria-expanded={showVoiceSection}
        >
          <Mic size={16} aria-hidden="true" />
          <span>
            {showVoiceSection
              ? t("common.cancel")
              : t("voice.fillWithVoice")}
          </span>
        </button>
      </div>

      {/* Interactive Voice Assistant Panel */}
      {showVoiceSection && (
        <div className="employer-voice-panel animated-card">
          <div className="employer-voice-header">
            <h3 className="employer-voice-title">
              <Building2 size={20} color="#0284c7" aria-hidden="true" />
              <span>{t("voice.guided.fillWithVoice")}</span>
            </h3>
            <button
              type="button"
              className="employer-voice-close"
              onClick={() => setShowVoiceSection(false)}
              aria-label={t("common.cancel")}
            >
              <X size={18} />
            </button>
          </div>

          {/* Spoken language selector */}
          <div className="employer-voice-languages">
            <span className="employer-voice-lang-label">
              {t("voice.spokenLanguage")}:
            </span>
            {APP_LANGUAGES.map((langCode) => (
              <button
                key={langCode}
                type="button"
                className={`employer-voice-lang-chip ${
                  spokenLanguage === langCode ? "active" : ""
                }`}
                onClick={() => setSpokenLanguage(langCode)}
              >
                {LANGUAGE_LABELS[langCode]}
              </button>
            ))}
          </div>

          {/* Field tabs */}
          <div className="employer-voice-field-tabs" role="tablist">
            {VOICE_FIELDS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={activeVoiceField === f.id}
                className={`employer-voice-tab ${
                  activeVoiceField === f.id ? "active" : ""
                }`}
                onClick={() => {
                  setActiveVoiceField(f.id);
                  setVoiceResult(null);
                  setVoiceError(null);
                }}
              >
                {t(f.labelKey)}
                {extractedFlags[f.id] && " ✓"}
              </button>
            ))}
          </div>

          {/* Step Prompt */}
          <div className="employer-voice-prompt">
            <p>{t(currentFieldConfig.promptKey)}</p>
            <small>{t("voice.speakBusinessDetailsHint")}</small>
          </div>

          {voiceError && <ErrorBanner error={voiceError} context="voice" />}

          {/* Recorder or Processing indicator */}
          {processingAudio ? (
            <div className="employer-voice-processing">
              <LoaderCircle className="spin-animate" size={24} aria-hidden="true" />
              <span>{t("voice.listeningAnswer")}</span>
            </div>
          ) : (
            <VoiceRecorder
              key={`${activeVoiceField}-${spokenLanguage}`}
              onRecordingComplete={handleVoiceRecording}
            />
          )}

          {/* Voice Extraction Result */}
          {voiceResult && (
            <div
              className={`employer-voice-result ${
                voiceResult.ok ? "success" : "failed"
              }`}
            >
              {voiceResult.transcript && (
                <p>
                  <strong>{t("voice.guided.heard")}:</strong> &ldquo;
                  {voiceResult.transcript}&rdquo;
                </p>
              )}
              {voiceResult.ok ? (
                <p>
                  <CheckCircle2 size={15} style={{ verticalAlign: "middle", marginRight: 5 }} />
                  <strong>{t("voice.extractedSuccessfully")}:</strong> &ldquo;
                  {String(voiceResult.value)}&rdquo;
                </p>
              ) : (
                <p>
                  {t(`voice.guided.error.${voiceResult.reason || "generic"}`)}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Form Fields with individual mic buttons */}
      <div className="form-field-row">
        <label className="form-field">
          <span>{t("employerProfile.businessName")}</span>
          <div className="voice-input-container">
            <input
              type="text"
              value={businessName}
              onChange={(event) => setBusinessName(event.target.value)}
              placeholder="e.g. Kolhapur Electrical Services"
            />
            <button
              type="button"
              className={`field-mic-btn ${activeVoiceField === "businessName" && showVoiceSection ? "active" : ""}`}
              onClick={() => handleFieldMicClick("businessName")}
              title={t("voice.speakField", { field: t("employerProfile.businessName") })}
              aria-label={t("voice.speakField", { field: t("employerProfile.businessName") })}
            >
              <Mic size={15} />
            </button>
          </div>
        </label>

        <label className="form-field">
          <span>{t("employerProfile.businessType")}</span>
          <div className="voice-input-container">
            <input
              type="text"
              value={businessType}
              onChange={(event) => setBusinessType(event.target.value)}
              required
              placeholder="e.g. Electrical Contractor"
            />
            <button
              type="button"
              className={`field-mic-btn ${activeVoiceField === "businessType" && showVoiceSection ? "active" : ""}`}
              onClick={() => handleFieldMicClick("businessType")}
              title={t("voice.speakField", { field: t("employerProfile.businessType") })}
              aria-label={t("voice.speakField", { field: t("employerProfile.businessType") })}
            >
              <Mic size={15} />
            </button>
          </div>
        </label>
      </div>

      <div className="form-field-row">
        <label className="form-field">
          <span>{t("common.city")}</span>
          <div className="voice-input-container">
            <input
              type="text"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              placeholder="e.g. Pune"
            />
            <button
              type="button"
              className={`field-mic-btn ${activeVoiceField === "city" && showVoiceSection ? "active" : ""}`}
              onClick={() => handleFieldMicClick("city")}
              title={t("voice.speakField", { field: t("common.city") })}
              aria-label={t("voice.speakField", { field: t("common.city") })}
            >
              <Mic size={15} />
            </button>
          </div>
        </label>

        <label className="form-field">
          <span>{t("common.village")}</span>
          <div className="voice-input-container">
            <input
              type="text"
              value={village}
              onChange={(event) => setVillage(event.target.value)}
              placeholder="e.g. Khed"
            />
            <button
              type="button"
              className={`field-mic-btn ${activeVoiceField === "village" && showVoiceSection ? "active" : ""}`}
              onClick={() => handleFieldMicClick("village")}
              title={t("voice.speakField", { field: t("common.village") })}
              aria-label={t("voice.speakField", { field: t("common.village") })}
            >
              <Mic size={15} />
            </button>
          </div>
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
        <textarea
          rows={4}
          value={bioText}
          onChange={(event) => setBioText(event.target.value)}
          placeholder="Brief description of your business..."
        />
      </label>

      <Button type="submit" size="lg" disabled={saving}>
        {saving ? t("voice.guided.saving") : t("profile.save")}
      </Button>
    </form>
  );
}
