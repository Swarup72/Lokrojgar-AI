import { useCallback, useEffect, useState } from "react";
import { Check, LoaderCircle, ArrowLeft, ArrowRight, SkipForward } from "lucide-react";
import { useLanguage } from "../../hooks/useLanguage";
import * as voiceJobApi from "../../api/voiceJob";
import { normalizeError } from "../../api/client";
import { SHIFT_TYPES } from "../../utils/enums";
import { SHIFT_TYPE_KEYS, PAY_TYPE_KEYS } from "../../utils/enumLabels";
import { VoiceRecorder } from "../voice/VoiceRecorder";
import { ErrorBanner } from "../common/ErrorBanner";
import { toFormValues } from "../../utils/voiceJobToForm";
import "../voice/GuidedVoiceWizard.css";

/**
 * Guided voice JOB POSTING: one question at a time, for employers.
 *
 * This wizard never publishes. Every answer goes to a server-side draft, and
 * on finish the reviewed values are handed to the caller, which pours them
 * into the existing Add Job form. The employer then edits anything they like
 * and presses the form's own submit — so a job always goes live through the
 * same validated, auto-translating POST /jobs that a typed advert uses.
 *
 * Seven voice steps each cost one transcription (seconds on the local model —
 * the processing copy says so rather than pretending it is instant). Start
 * date and shift are tap-only: a date picker cannot be misheard, and sending
 * those to Whisper would spend a transcription on something already exact.
 */

const VOICE_STEPS = [
  "jobTitle",
  "jobDescription",
  "jobSkills",
  "jobWorkerCount",
  "jobCity",
  "jobPayAmount",
  "jobPayType",
];
const TAP_STEPS = ["jobStartDate", "jobShiftType"];
const STEPS = [...VOICE_STEPS, ...TAP_STEPS];

/**
 * Only the title is treated as required by the wizard, because Job requires a
 * title in at least one language and an advert with no title is not reviewable.
 * Everything else can be left empty and typed into the form — the Job schema
 * enforces the rest at publish time, which is where it belongs.
 */
const REQUIRED_STEPS = new Set(["jobTitle"]);
const PAY_TYPES = ["daily", "monthly", "fixed"];

/** How a captured value is shown back to the employer. */
function formatValue(field, value, t) {
  if (value === null || value === undefined || value === "") return null;
  if (field === "jobPayAmount") return `₹${value}`;
  if (field === "jobWorkerCount") return t("voiceJob.workersCount", { count: value });
  if (field === "jobPayType") return t(PAY_TYPE_KEYS[value] ?? value);
  if (field === "jobShiftType") return t(SHIFT_TYPE_KEYS[value] ?? value);
  if (field === "jobSkills") {
    // The skills step stores both the resolved catalog entries and whatever
    // could not be matched, so the employer can see exactly what was linked.
    const resolved = value?.resolved?.map((s) => s.canonicalName) ?? [];
    const unresolved = value?.unresolved ?? [];
    const all = [...resolved, ...unresolved];
    return all.length ? all.join(", ") : null;
  }
  return String(value);
}

export function GuidedVoiceJobWizard({ spokenLanguage, onComplete, onExit }) {
  const { t } = useLanguage();

  const [stepIndex, setStepIndex] = useState(0);
  const [draftFields, setDraftFields] = useState({});
  const [completedSteps, setCompletedSteps] = useState([]);
  const [audioBlob, setAudioBlob] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(true);
  const [finishing, setFinishing] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const field = STEPS[stepIndex];
  const isVoiceStep = VOICE_STEPS.includes(field);
  const answeredCount = completedSteps.length;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStarting(true);
      try {
        const session = await voiceJobApi.startGuided(spokenLanguage);
        if (cancelled) return;
        setDraftFields(session.draftFields || {});
        setCompletedSteps(session.completedSteps || []);
        // Resume where the employer stopped rather than restarting.
        const firstUnanswered = STEPS.findIndex(
          (s) => !(session.completedSteps || []).includes(s)
        );
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
  }, [spokenLanguage]);

  const goTo = useCallback((index) => {
    setStepIndex(index);
    setAudioBlob(null);
    setLastResult(null);
    setError(null);
  }, []);

  const handleSubmitRecording = async () => {
    if (!audioBlob) return;
    setProcessing(true);
    setError(null);
    try {
      const result = await voiceJobApi.submitGuidedStep(audioBlob, spokenLanguage, field);
      setLastResult(result);
      setDraftFields(result.draftFields || {});
      setCompletedSteps(result.completedSteps || []);
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
      const session = await voiceJobApi.setGuidedField(spokenLanguage, field, value);
      setDraftFields(session.draftFields || {});
      setCompletedSteps(session.completedSteps || []);
    } catch (err) {
      setError(normalizeError(err));
    }
  };

  const next = () => {
    if (stepIndex < STEPS.length - 1) goTo(stepIndex + 1);
    else setReviewing(true);
  };

  /**
   * Hand the reviewed draft to the Add Job form.
   *
   * Nothing is published here. The draft is marked consumed so the next
   * session starts clean, then the values are mapped onto the form's shape.
   */
  const handleUseInForm = async () => {
    setFinishing(true);
    setError(null);
    try {
      await voiceJobApi.consumeGuidedDraft(spokenLanguage);
      onComplete(toFormValues(draftFields, spokenLanguage));
    } catch (err) {
      setError(normalizeError(err));
      setFinishing(false);
    }
  };

  const canSkip = !REQUIRED_STEPS.has(field);
  const currentValue = draftFields[field];

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
        <h2>{t("voiceJob.review")}</h2>
        <p className="guided-hint">{t("voiceJob.reviewHint")}</p>
        {error && <ErrorBanner error={error} />}

        <ul className="guided-review-list">
          {STEPS.map((step, index) => {
            const display = formatValue(step, draftFields[step], t);
            return (
              <li key={step}>
                <span className="guided-review-label">{t(`voiceJob.${step}.label`)}</span>
                <span className={display ? "guided-review-value" : "guided-review-missing"}>
                  {display || t("voice.guided.notAnswered")}
                </span>
                <button
                  type="button"
                  className="guided-link"
                  onClick={() => {
                    setReviewing(false);
                    goTo(index);
                  }}
                >
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
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={handleUseInForm}
            disabled={finishing}
          >
            {finishing ? t("voice.guided.saving") : t("voiceJob.useInForm")}
          </button>
        </div>
        {/* Said explicitly, because "finish" in a wizard usually means "publish". */}
        <p className="guided-hint">{t("voiceJob.notPublishedYet")}</p>
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

      <h2>{t(`voiceJob.${field}.label`)}</h2>
      <p className="guided-prompt">{t(`voiceJob.${field}.prompt`)}</p>
      <p className="guided-hint">
        <em>{t("example")}:</em> {t(`voiceJob.${field}.example`)}
      </p>

      {error && <ErrorBanner error={error} />}

      {isVoiceStep && (
        <>
          {processing ? (
            <div className="guided-processing">
              <LoaderCircle className="spin" size={22} aria-hidden="true" />
              <span>{t("voice.guided.processing")}</span>
            </div>
          ) : (
            <VoiceRecorder
              key={`${field}-${lastResult?.transcript ?? "new"}`}
              onRecordingComplete={setAudioBlob}
            />
          )}

          {!processing && audioBlob && (
            <button
              type="button"
              className="btn btn-primary btn-lg guided-send"
              onClick={handleSubmitRecording}
            >
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
                  {t(`voiceJob.error.${lastResult.reason || "generic"}`)}
                </p>
              )}
            </div>
          )}
        </>
      )}

      {field === "jobStartDate" && (
        <input
          type="date"
          className="guided-tap-input"
          value={currentValue || ""}
          onChange={(event) => saveTapValue(event.target.value || null)}
        />
      )}

      {field === "jobShiftType" && (
        <div className="guided-chips">
          {SHIFT_TYPES.map((option) => (
            <button
              type="button"
              key={option}
              className={`guided-chip ${currentValue === option ? "active" : ""}`}
              onClick={() => saveTapValue(option)}
            >
              {t(SHIFT_TYPE_KEYS[option])}
            </button>
          ))}
        </div>
      )}

      {/* The pay-type step is spoken, but an employer whose frequency was not
          understood can tap it rather than repeating themselves indefinitely. */}
      {field === "jobPayType" && lastResult && !lastResult.ok && (
        <div className="guided-chips">
          {PAY_TYPES.map((option) => (
            <button
              type="button"
              key={option}
              className={`guided-chip ${currentValue === option ? "active" : ""}`}
              onClick={() => saveTapValue(option)}
            >
              {t(PAY_TYPE_KEYS[option])}
            </button>
          ))}
        </div>
      )}

      <div className="guided-actions">
        {stepIndex > 0 && (
          <button type="button" className="btn btn-secondary" onClick={() => goTo(stepIndex - 1)}>
            <ArrowLeft size={16} aria-hidden="true" /> {t("voice.guided.back")}
          </button>
        )}
        {canSkip && (
          <button type="button" className="btn btn-secondary" onClick={next}>
            <SkipForward size={16} aria-hidden="true" /> {t("voice.guided.skip")}
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          onClick={next}
          disabled={REQUIRED_STEPS.has(field) && !completedSteps.includes(field)}
        >
          {t("voice.guided.next")} <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>

      <button type="button" className="guided-link guided-exit" onClick={onExit}>
        {t("voiceJob.exit")}
      </button>
      {/* An employer who leaves must know whether their answers survive. */}
      <p className="guided-hint">{t("voiceJob.draftSaved")}</p>
    </div>
  );
}
