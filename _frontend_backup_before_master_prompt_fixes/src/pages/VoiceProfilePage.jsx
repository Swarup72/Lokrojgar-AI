import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Mic, Upload, LoaderCircle, ListChecks } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useLanguage } from "../hooks/useLanguage";
import * as voiceProfileApi from "../api/voiceProfile";
import { normalizeError } from "../api/client";
import { APP_LANGUAGES, LANGUAGE_LABELS } from "../utils/enums";
import { Card } from "../components/common/Card";
import { ErrorBanner } from "../components/common/ErrorBanner";
import { VoiceRecorder } from "../components/voice/VoiceRecorder";
import { AudioUploader } from "../components/voice/AudioUploader";
import { VoiceProfileReview } from "../components/voice/VoiceProfileReview";
import { VoiceProfileSuccess } from "../components/voice/VoiceProfileSuccess";
import { GuidedVoiceWizard } from "../components/voice/GuidedVoiceWizard";
import "./VoiceProfilePage.css";

const EXAMPLE_TEXT = {
  mr: '"माझे नाव राहुल आहे. मला ५ वर्षांचा प्लंबिंगचा अनुभव आहे. मला पुण्यात काम हवे आहे..."',
  hi: '"मेरा नाम राहुल है। मुझे 5 साल का प्लंबिंग का अनुभव है। मुझे पुणे में काम चाहिए..."',
  en: '"My name is Rahul. I have 5 years of experience as a plumber. I am looking for work in Pune..."',
};

export function VoiceProfilePage() {
  const { user, refreshBootstrap } = useAuth();
  const { language: uiLanguage, t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const roleParam = searchParams.get("role");
  const targetRole = roleParam === "employer" || (!roleParam && user?.activeRole === "employer") ? "employer" : "worker";
  const isEmployer = targetRole === "employer";

  const [mode, setMode] = useState(isEmployer ? "guided" : null);
  const [step, setStep] = useState(isEmployer ? "language" : "mode");
  const [recordingLanguage, setRecordingLanguage] = useState(uiLanguage);
  const [inputMode, setInputMode] = useState("record");
  const [audioSource, setAudioSource] = useState(null);
  const [voiceProfile, setVoiceProfile] = useState(null);
  const [confirmedProfile, setConfirmedProfile] = useState(null);
  const [skillResolution, setSkillResolution] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleExtract = async () => {
    if (!audioSource) return;
    setStep("processing");
    setError(null);
    try {
      const result = await voiceProfileApi.extract(audioSource, recordingLanguage);
      setVoiceProfile(result);
      setStep("review");
    } catch (err) {
      setError(normalizeError(err));
      setStep("input");
    }
  };

  const handleConfirm = async (confirmedFields) => {
    setSaving(true);
    setError(null);
    try {
      const result = await voiceProfileApi.confirm(
        voiceProfile._id,
        confirmedFields,
        targetRole
      );
      await refreshBootstrap();
      if (isEmployer) {
        setConfirmedProfile(result.employerProfile);
      } else {
        setConfirmedProfile(result.workerProfile);
        setSkillResolution(result.voiceSkillResolution);
      }
      setStep("success");
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setSaving(false);
    }
  };

  const resetToInput = () => {
    setAudioSource(null);
    setVoiceProfile(null);
    setError(null);
    setStep("input");
  };

  return (
    <div className="container voice-page page-animate">
      <button type="button" className="voice-page-back" onClick={() => navigate("/profile")}>
        <ArrowLeft size={16} aria-hidden="true" /> <span>{t("common.back")}</span>
      </button>

      <Card className="voice-page-card animated-card">
        {step !== "success" && (
          <>
            <h1 className="voice-page-title">
              {isEmployer ? t("voice.guided.employer.title") : t("createProfileVoice")}
            </h1>
            <p className="voice-page-subtitle">
              {isEmployer ? t("voice.guided.employer.subtitle") : t("voiceProfileSubtitle")}
            </p>
          </>
        )}

        {error && <ErrorBanner error={error} context="voice" />}

        {step === "mode" && (
          <div className="voice-mode-step">
            <p className="voice-step-label">{t("voice.mode.title")}</p>
            <div className="voice-mode-options">
              <button type="button" className="voice-mode-option" onClick={() => { setMode("quick"); setStep("language"); }}>
                <Mic size={22} aria-hidden="true" />
                <strong>{t("voice.mode.quick.title")}</strong>
                <span>{t("voice.mode.quick.desc")}</span>
                <em>{t("voice.mode.quick.action")}</em>
              </button>
              <button type="button" className="voice-mode-option" onClick={() => { setMode("guided"); setStep("language"); }}>
                <ListChecks size={22} aria-hidden="true" />
                <strong>{t("voice.mode.guided.title")}</strong>
                <span>{t("voice.mode.guided.desc")}</span>
                <em>{t("voice.mode.guided.action")}</em>
              </button>
            </div>
          </div>
        )}

        {step === "guided" && (
          <GuidedVoiceWizard
            spokenLanguage={recordingLanguage}
            role={targetRole}
            onComplete={async (result) => {
              if (isEmployer) {
                setConfirmedProfile(result.employerProfile);
              } else {
                setConfirmedProfile(result.workerProfile);
                setSkillResolution(result.voiceSkillResolution);
              }
              await refreshBootstrap();
              setStep("success");
            }}
            onExit={() => (isEmployer ? navigate("/profile") : setStep("mode"))}
          />
        )}

        {step === "language" && (
          <div className="voice-language-step">
            <p className="voice-step-label">{t("voice.spokenLanguage")}</p>
            <div className="voice-language-options">
              {APP_LANGUAGES.map((lang) => (
                <button
                  key={lang}
                  type="button"
                  className={`voice-language-option ${recordingLanguage === lang ? "active" : ""}`}
                  onClick={() => setRecordingLanguage(lang)}
                >
                  {LANGUAGE_LABELS[lang]}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-primary btn-lg animated-button"
              onClick={() => setStep(mode === "guided" || isEmployer ? "guided" : "input")}
            >
              {t("voice.guided.continue")}
            </button>
          </div>
        )}

        {step === "input" && (
          <div className="voice-input-step">
            <p className="voice-input-example">
              <strong>{t("tellUsAboutYourself")}</strong>
              <br />
              {t("example")}: {EXAMPLE_TEXT[recordingLanguage] || EXAMPLE_TEXT.en}
            </p>

            <div className="voice-input-mode">
              <button type="button" className={inputMode === "record" ? "active" : ""} onClick={() => setInputMode("record")}>
                <Mic size={15} aria-hidden="true" /> {t("recordVoice")}
              </button>
              <button type="button" className={inputMode === "upload" ? "active" : ""} onClick={() => setInputMode("upload")}>
                <Upload size={15} aria-hidden="true" /> {t("uploadAudio")}
              </button>
            </div>

            {inputMode === "record" ? (
              <VoiceRecorder onRecordingComplete={setAudioSource} />
            ) : (
              <AudioUploader onFileReady={setAudioSource} />
            )}

            <button type="button" className="btn btn-primary btn-lg voice-extract-btn animated-button" onClick={handleExtract} disabled={!audioSource}>
              {t("extractProfile")}
            </button>
          </div>
        )}

        {step === "processing" && (
          <div className="voice-processing-step">
            <LoaderCircle size={40} className="voice-processing-spinner" aria-hidden="true" />
            <h2>🎙 {t("processingVoice")}</h2>
            <p>{t("processingVoiceDesc")}</p>
          </div>
        )}

        {step === "review" && voiceProfile && (
          <VoiceProfileReview
            extractedFields={voiceProfile.extractedFields}
            recordedLanguage={recordingLanguage}
            onConfirm={handleConfirm}
            onBack={resetToInput}
            saving={saving}
          />
        )}

        {step === "success" && (
          <VoiceProfileSuccess
            role={targetRole}
            workerProfile={!isEmployer ? confirmedProfile : null}
            employerProfile={isEmployer ? confirmedProfile : null}
            skillResolution={skillResolution}
          />
        )}
      </Card>

      {step !== "success" && (
        <p className="voice-page-alt-link">
          {t("preferManualFill")} <Link to="/profile">{t("editProfileManually")}</Link>
        </p>
      )}
    </div>
  );
}
