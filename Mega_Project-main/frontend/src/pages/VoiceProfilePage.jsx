import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Mic, Upload, LoaderCircle } from "lucide-react";
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
import "./VoiceProfilePage.css";

const EXAMPLE_TEXT = {
  mr: '"माझे नाव राहुल आहे. मला ५ वर्षांचा प्लंबिंगचा अनुभव आहे. मला पुण्यात काम हवे आहे..."',
  hi: '"मेरा नाम राहुल है। मुझे 5 साल का प्लंबिंग का अनुभव है। मुझे पुणे में काम चाहिए..."',
  en: '"My name is Rahul. I have 5 years of experience as a plumber. I am looking for work in Pune..."',
};

export function VoiceProfilePage() {
  const { refreshBootstrap } = useAuth();
  const { language: uiLanguage } = useLanguage();
  const navigate = useNavigate();

  const [step, setStep] = useState("language"); // language | input | processing | review | success
  const [recordingLanguage, setRecordingLanguage] = useState(uiLanguage);
  const [inputMode, setInputMode] = useState("record"); // record | upload
  const [audioSource, setAudioSource] = useState(null); // Blob | File
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
      // The confirm response shape is { workerProfile, voiceSkillResolution }
      // (not the bare WorkerProfile it used to be) since the backend now
      // resolves voice-extracted skills/preferredJobCategories against the
      // real catalog instead of silently ignoring them.
      const { workerProfile, voiceSkillResolution } = await voiceProfileApi.confirm(
        voiceProfile._id,
        confirmedFields
      );
      await refreshBootstrap();
      setConfirmedProfile(workerProfile);
      setSkillResolution(voiceSkillResolution);
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
    <div className="container voice-page">
      <button type="button" className="voice-page-back" onClick={() => navigate("/profile")}>
        <ArrowLeft size={16} aria-hidden="true" /> Back to Profile
      </button>

      <Card className="voice-page-card">
        {step !== "success" && (
          <>
            <h1 className="voice-page-title">Create Your Profile with Voice</h1>
            <p className="voice-page-subtitle">
              Tell us about yourself naturally in your preferred language. We'll convert your speech into a profile.
            </p>
          </>
        )}

        {error && <ErrorBanner error={error} context="voice" />}

        {step === "language" && (
          <div className="voice-language-step">
            {/* This selects the SPOKEN language forwarded to Whisper
                (voiceProfileApi.extract -> backend -> STT), not the app's UI
                language. The old "Choose your language" read as a UI setting,
                so a worker with a Marathi interface would record in English
                and have it decoded as Marathi. */}
            <p className="voice-step-label">Which language will you speak?</p>
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
            <button type="button" className="btn btn-primary btn-lg" onClick={() => setStep("input")}>
              Continue
            </button>
          </div>
        )}

        {step === "input" && (
          <div className="voice-input-step">
            <p className="voice-input-example">
              <strong>Tell us about yourself.</strong>
              <br />
              Example: {EXAMPLE_TEXT[recordingLanguage] || EXAMPLE_TEXT.en}
            </p>

            <div className="voice-input-mode">
              <button type="button" className={inputMode === "record" ? "active" : ""} onClick={() => setInputMode("record")}>
                <Mic size={15} aria-hidden="true" /> Record Voice
              </button>
              <button type="button" className={inputMode === "upload" ? "active" : ""} onClick={() => setInputMode("upload")}>
                <Upload size={15} aria-hidden="true" /> Upload Audio
              </button>
            </div>

            {inputMode === "record" ? (
              <VoiceRecorder onRecordingComplete={setAudioSource} />
            ) : (
              <AudioUploader onFileReady={setAudioSource} />
            )}

            <button type="button" className="btn btn-primary btn-lg voice-extract-btn" onClick={handleExtract} disabled={!audioSource}>
              Extract Profile
            </button>
          </div>
        )}

        {step === "processing" && (
          <div className="voice-processing-step">
            <LoaderCircle size={40} className="voice-processing-spinner" aria-hidden="true" />
            <h2>🎙 Processing your voice...</h2>
            <p>Please wait while we create your profile.</p>
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
          <VoiceProfileSuccess workerProfile={confirmedProfile} skillResolution={skillResolution} />
        )}
      </Card>

      {step !== "success" && (
        <p className="voice-page-alt-link">
          Prefer to fill it in yourself? <Link to="/profile">Edit your profile manually</Link>
        </p>
      )}
    </div>
  );
}
