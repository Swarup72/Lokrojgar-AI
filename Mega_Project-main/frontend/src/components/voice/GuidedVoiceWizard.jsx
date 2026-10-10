import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, LoaderCircle, RefreshCw, ArrowLeft, ArrowRight, SkipForward } from "lucide-react";
import { useLanguage } from "../../hooks/useLanguage";
import * as voiceProfileApi from "../../api/voiceProfile";
import { normalizeError } from "../../api/client";
import { APP_LANGUAGES, LANGUAGE_LABELS } from "../../utils/enums";
import { VoiceRecorder } from "./VoiceRecorder";
import { ErrorBanner } from "../common/ErrorBanner";
import "./GuidedVoiceWizard.css";

/**
 * The guided voice profile: one question at a time.
 *
 * Answers go to a SERVER-SIDE draft after every step, so closing the browser
 * mid-wizard loses nothing, and nothing reaches the worker's real profile until
 * they confirm on the review screen. A step that could not be understood is a
 * normal outcome - the worker sees what was heard and redoes that one step only.
 *
 * The five voice steps each cost one transcription (a few seconds on the local
 * model, which the processing copy says out loud rather than pretending it is
 * instant). Languages and availability are tap-only: a three-option choice is
 * faster to tap than to say and cannot be misheard.
 */

const WORKER_VOICE_STEPS = ["fullName", "expectedPay", "experienceYears", "skills", "city"];
const WORKER_TAP_STEPS = ["languages", "availability"];
const WORKER_STEPS = [...WORKER_VOICE_STEPS, ...WORKER_TAP_STEPS];

const EMPLOYER_VOICE_STEPS = ["fullName", "businessName", "businessType", "city"];
const EMPLOYER_TAP_STEPS = [];
const EMPLOYER_STEPS = [...EMPLOYER_VOICE_STEPS, ...EMPLOYER_TAP_STEPS];

// Only the name is required: a profile with no name is not usable, while other fields can be filled in later.
const REQUIRED_STEPS = new Set(["fullName"]);
const AVAILABILITY_OPTIONS = ["available", "busy", "unavailable"];

/** How a captured value is shown back to the user. */
function formatValue(field, value, t) {
  if (value === null || value === undefined || value === "") return null;
  if (field === "expectedPay") return `₹${value}`;
  if (field === "experienceYears") return value === 1 ? "1 year" : `${value} years`;
  if (field === "languages") return value.map((code) => LANGUAGE_LABELS[code] || code).join(", ");
  if (field === "skills") return Array.isArray(value) ? value.join(", ") : String(value);
  return String(value);
}

function getStepLabel(field, role, t) {
  if (role === "employer") {
    if (field === "fullName") return t("voice.guided.employer.fullName.label");
    if (field === "city") return t("voice.guided.employer.city.label");
  }
  return t(`voice.guided.${field}.label`);
}

function getStepPrompt(field, role, t) {
  if (role === "employer") {
    if (field === "fullName") return t("voice.guided.employer.fullName.prompt");
    if (field === "city") return t("voice.guided.employer.city.prompt");
  }
  return t(`voice.guided.${field}.prompt`);
}

export function GuidedVoiceWizard({ spokenLanguage, role = "worker", onComplete, onExit }) {
  const { t } = useLanguage();

  const isEmployer = role === "employer";
  const STEPS = isEmployer ? EMPLOYER_STEPS : WORKER_STEPS;
  const VOICE_STEPS = isEmployer ? EMPLOYER_VOICE_STEPS : WORKER_VOICE_STEPS;

  const [stepIndex, setStepIndex] = useState(0);
  const [draftFields, setDraftFields] = useState({});
  const [completedSteps, setCompletedSteps] = useState([]);
  const [audioBlob, setAudioBlob] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const field = STEPS[stepIndex] || STEPS[0];
  const isVoiceStep = VOICE_STEPS.includes(field);

  // Start or RESUME. The draft already on the server is the source of truth for
  // what has been answered, so a reload picks up where the user left off.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await voiceProfileApi.startGuided(spokenLanguage, role);
        if (cancelled) return;
        setDraftFields(session.draftFields || {});
        setCompletedSteps(session.completedSteps || []);
        // Resume at the first unanswered step rather than always at step 1.
        const firstUnanswered = STEPS.findIndex((step) => !(session.completedSteps || []).includes(step));
        setStepIndex(firstUnanswered === -1 ? 0 : firstUnanswered);
      } catch (err) {
        if (!cancelled) setError(normalizeError(err));
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [spokenLanguage, role]);

  const applyDraft = useCallback((data) => {
    if (data?.draftFields) setDraftFields(data.draftFields);
    if (data?.completedSteps) setCompletedSteps(data.completedSteps);
  }, []);

  /** Sends the recording for THIS step only. */
  const handleSubmitRecording = async () => {
    if (!audioBlob) return;
    setProcessing(true);
    setError(null);
    setLastResult(null);
    try {
      const result = await voiceProfileApi.submitGuidedStep(audioBlob, spokenLanguage, field, role);
      applyDraft(result);
      setLastResult(result);
      // A result that could not be understood is not an error - the user is
      // shown the transcript and the reason, and records that step again.
      setAudioBlob(null);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setProcessing(false);
    }
  };

  const saveTapValue = async (value) => {
    setError(null);
    try {
      const result = await voiceProfileApi.setGuidedField(spokenLanguage, field, value, role);
      applyDraft(result);
    } catch (err) {
      setError(normalizeError(err));
    }
  };

  const goTo = (index) => {
    setStepIndex(index);
    setAudioBlob(null);
    setLastResult(null);
    setError(null);
  };

  const currentValue = draftFields[field] ?? null;
  const hasValue = currentValue !== null && currentValue !== undefined && currentValue !== "";
  const canContinue = hasValue || !REQUIRED_STEPS.has(field);

  /** Commits the draft - the same confirm endpoint the quick flow uses. */
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const session = await voiceProfileApi.getGuidedDraft(spokenLanguage, role);
      if (!session?.voiceProfileId) throw new Error(t("voice.guided.draftNotFound"));
      // Only answered fields are sent. An unanswered field is simply absent, so
      // the server's additive merge leaves whatever the profile already has.
      const confirmedFields = {};
      for (const step of STEPS) {
        const value = session.draftFields?.[step];
        if (value !== null && value !== undefined && value !== "") confirmedFields[step] = value;
      }
      const result = await voiceProfileApi.confirm(session.voiceProfileId, confirmedFields, role);
      onComplete?.(result);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setSaving(false);
    }
  };

  const answeredCount = useMemo(() => STEPS.filter((step) => completedSteps.includes(step)).length, [STEPS, completedSteps]);

  if (starting) {
    return (
      <div className="guided-loading">
        <LoaderCircle className="spin" size={28} aria-hidden="true" />
      </div>
    );
  }

  // --- review ---------------------------------------------------------------
  if (reviewing) {
    return (
      <div className="guided-wizard">
        <h2>{t("voice.guided.review")}</h2>
        <p className="guided-hint">{t("voice.guided.reviewHint")}</p>
        {error && <ErrorBanner error={error} />}

        <ul className="guided-review-list">
          {STEPS.map((step, index) => {
            const display = formatValue(step, draftFields[step], t);
            return (
              <li key={step}>
                <span className="guided-review-label">{getStepLabel(step, role, t)}</span>
                <span className={display ? "guided-review-value" : "guided-review-missing"}>
                  {display || t("voice.guided.notAnswered")}
                </span>
                <button type="button" className="guided-link" onClick={() => { setReviewing(false); goTo(index); }}>
                  {t("voice.guided.retry")}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="guided-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setReviewing(false)}>
            <ArrowLeft size={16} aria-hidden="true" /> {t("voice.guided.back")}
          </button>
          <button type="button" className="btn btn-primary btn-lg" onClick={handleSave} disabled={saving}>
            {saving ? t("voice.guided.saving") : (isEmployer ? t("voice.guided.saveEmployer") : t("voice.guided.save"))}
          </button>
        </div>
      </div>
    );
  }

  // --- one step -------------------------------------------------------------
  return (
    <div className="guided-wizard">
      <div className="guided-progress">
        <span>{t("voice.guided.step", { current: stepIndex + 1, total: STEPS.length })}</span>
        <div className="guided-progress-bar" role="presentation">
          <div style={{ width: `${(answeredCount / STEPS.length) * 100}%` }} />
        </div>
      </div>

      <h2>{getStepLabel(field, role, t)}</h2>
      <p className="guided-prompt">{getStepPrompt(field, role, t)}</p>

      {error && <ErrorBanner error={error} />}

      {isVoiceStep && (
        <>
          {processing ? (
            <div className="guided-processing">
              <LoaderCircle className="spin" size={22} aria-hidden="true" />
              {/* Said plainly: the local model takes seconds, and pretending
                  otherwise makes the wizard feel broken. */}
              <span>{t("voice.guided.processing")}</span>
            </div>
          ) : (
            <VoiceRecorder key={`${field}-${lastResult?.transcript ?? "new"}`} onRecordingComplete={setAudioBlob} />
          )}

          {!processing && audioBlob && (
            <button type="button" className="btn btn-primary btn-lg guided-send" onClick={handleSubmitRecording}>
              <Check size={18} aria-hidden="true" /> {t("voice.guided.continue")}
            </button>
          )}

          {lastResult && (
            <div className={lastResult.ok ? "guided-result ok" : "guided-result failed"}>
              {lastResult.transcript && (
                <p className="guided-transcript">
                  <em>{t("voice.guided.heard")}:</em> {lastResult.transcript}
                </p>
              )}
              {lastResult.ok ? (
                <p className="guided-value">
                  <Check size={16} aria-hidden="true" /> {formatValue(field, lastResult.value, t)}
                </p>
              ) : (
                <p className="guided-failed-reason">
                  {/* A specific, actionable message per reason - never a bare
                      "failed". Falls back to a generic line for an unmapped reason. */}
                  {t(`voice.guided.error.${lastResult.reason || "generic"}`)}
                </p>
              )}
            </div>
          )}
        </>
      )}

      {field === "languages" && (
        <div className="guided-chips">
          {APP_LANGUAGES.map((code) => {
            const selected = (draftFields.languages || []).includes(code);
            return (
              <button
                key={code}
                type="button"
                className={`guided-chip ${selected ? "active" : ""}`}
                onClick={() => {
                  const current = draftFields.languages || [];
                  const next = selected ? current.filter((entry) => entry !== code) : [...current, code];
                  setDraftFields({ ...draftFields, languages: next });
                  // An empty selection is saved as an empty draft array; the
                  // commit path refuses to let that clear a stored list.
                  saveTapValue(next);
                }}
              >
                {LANGUAGE_LABELS[code]}
              </button>
            );
          })}
        </div>
      )}

      {field === "availability" && (
        <div className="guided-chips">
          {AVAILABILITY_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={`guided-chip ${draftFields.availability === option ? "active" : ""}`}
              onClick={() => {
                setDraftFields({ ...draftFields, availability: option });
                saveTapValue(option);
              }}
            >
              {option}
            </button>
          ))}
        </div>
      )}

      {!isVoiceStep && hasValue && (
        <p className="guided-value">
          <Check size={16} aria-hidden="true" /> {formatValue(field, currentValue, t)}
        </p>
      )}

      <div className="guided-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => (stepIndex === 0 ? onExit?.() : goTo(stepIndex - 1))}
          disabled={processing}
        >
          <ArrowLeft size={16} aria-hidden="true" /> {t("voice.guided.back")}
        </button>

        {isVoiceStep && lastResult && !lastResult.ok && (
          <button type="button" className="btn btn-secondary" onClick={() => { setLastResult(null); setAudioBlob(null); }}>
            <RefreshCw size={16} aria-hidden="true" /> {t("voice.guided.retry")}
          </button>
        )}

        {!hasValue && !REQUIRED_STEPS.has(field) && (
          <button type="button" className="guided-link" onClick={() => goTo(stepIndex + 1)} disabled={processing}>
            <SkipForward size={15} aria-hidden="true" /> {t("voice.guided.skip")}
          </button>
        )}

        {stepIndex < STEPS.length - 1 ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => goTo(stepIndex + 1)}
            disabled={processing || !canContinue}
          >
            {t("voice.guided.continue")} <ArrowRight size={16} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setReviewing(true)}
            disabled={processing || !canContinue}
          >
            {t("voice.guided.review")} <ArrowRight size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
