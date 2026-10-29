
import { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate, useParams, Link } from "react-router-dom";
import {
  MapPin,
  Wallet,
  Briefcase,
  Clock,
  Languages,
  CalendarDays,
  ArrowLeft,
  Users,
  Volume2,
  Square,
  Play,
  Pause,
  Star,
  Send,
  CheckCircle2,
  LogIn,
  ShieldCheck,
  FileText,
  ArrowRight,
} from "lucide-react";

import { useAuth } from "../hooks/useAuth";
import { PAY_TYPE_KEYS, SHIFT_TYPE_KEYS } from "../utils/enumLabels";
import { useLanguage } from "../hooks/useLanguage";
import { employerName } from "../utils/displayName";
import { pickLocalizedText } from "../utils/localizedText";
import { USER_ROLES } from "../utils/enums";
import * as jobsApi from "../api/jobs";
import * as applicationsApi from "../api/applications";
import { normalizeError } from "../api/client";

import { Card } from "../components/common/Card";
import { StatusPill } from "../components/common/StatusPill";
import { Spinner } from "../components/common/Spinner";
import { speakText, stopSpeech, pauseSpeech, resumeSpeech } from "../utils/speech";
import { ErrorBanner } from "../components/common/ErrorBanner";
import { EmptyState } from "../components/common/EmptyState";
import { JobStatusActions } from "../components/jobs/JobStatusActions";
import { RatingStars } from "../components/common/RatingStars";
import { RatingList } from "../components/reviews/RatingList";

import "./JobDetailsPage.css";

const LABELS = {
  en: {
    listen: "Listen to job details",
    stop: "Stop audio",
    pause: "Pause",
    resume: "Resume",
    speaking: "Speaking...",
    paused: "Paused",
    reviews: "Employer Reviews",
    viewReviews: "View Reviews",
    years: "years",
    postedBy: "Posted by",
    salary: "Salary",
    location: "Work Location",
    workers: "Workers Needed",
    experience: "Experience",
    shift: "Work Timing",
    languages: "Languages",
    start: "Start Date",
    deadline: "Apply Before",
    skills: "Skills Required",
    applyHeading: "Apply for this job",
    applyHint: "You can apply in a few simple steps.",
    optionalNote: "Message to employer (optional)",
    notePlaceholder: "Write a short message if you want...",
    submit: "Apply Now",
    sending: "Sending Application...",
    success: "Application Sent Successfully!",
    successDesc: "Your application has been submitted to the employer.",
    myApplications: "View My Applications",
    loginHint: "Log in as a worker to apply for this job.",
    login: "Login to Apply",
    workerOnly: "Only worker accounts can apply for jobs.",
    closed: "This job is not accepting applications.",
    audioUnavailable: "Audio is not supported in this browser.",
  },
  hi: {
    listen: "नौकरी की जानकारी सुनें",
    stop: "आवाज़ बंद करें",
    pause: "रोकें",
    resume: "फिर से चलाएं",
    speaking: "बोल रहे हैं...",
    paused: "रुका हुआ",
    reviews: "मालिक की समीक्षाएं",
    viewReviews: "समीक्षाएं देखें",
    years: "वर्ष",
    postedBy: "नौकरी देने वाला",
    salary: "वेतन",
    location: "काम की जगह",
    workers: "कामगारों की ज़रूरत",
    experience: "अनुभव",
    shift: "काम का समय",
    languages: "भाषाएँ",
    start: "शुरू होने की तारीख",
    deadline: "आवेदन की अंतिम तारीख",
    skills: "ज़रूरी कौशल",
    applyHeading: "इस नौकरी के लिए आवेदन करें",
    applyHint: "आप कुछ आसान चरणों में आवेदन कर सकते हैं।",
    optionalNote: "मालिक को संदेश (वैकल्पिक)",
    notePlaceholder: "अगर चाहें तो छोटा संदेश लिखें...",
    submit: "अभी आवेदन करें",
    sending: "आवेदन भेजा जा रहा है...",
    success: "आवेदन सफलतापूर्वक भेजा गया!",
    successDesc: "आपका आवेदन नौकरी देने वाले को भेज दिया गया है।",
    myApplications: "मेरे आवेदन देखें",
    loginHint: "आवेदन करने के लिए कामगार खाते से लॉगिन करें।",
    login: "लॉगिन करके आवेदन करें",
    workerOnly: "केवल कामगार खाते से आवेदन किया जा सकता है।",
    closed: "इस नौकरी के लिए आवेदन बंद हैं।",
    audioUnavailable: "इस ब्राउज़र में ऑडियो उपलब्ध नहीं है।",
  },
  mr: {
    listen: "नोकरीची माहिती ऐका",
    stop: "आवाज बंद करा",
    pause: "थांबवा",
    resume: "पुढे सुरू करा",
    speaking: "माहिती सांगत आहे...",
    paused: "थांबवले आहे",
    reviews: "मालकाचे रिव्ह्यू",
    viewReviews: "रिव्ह्यू पाहा",
    years: "वर्षे",
    postedBy: "नोकरी देणारे",
    salary: "पगार",
    location: "कामाचे ठिकाण",
    workers: "कामगारांची गरज",
    experience: "अनुभव",
    shift: "कामाची वेळ",
    languages: "भाषा",
    start: "सुरुवातीची तारीख",
    deadline: "अर्जाची अंतिम तारीख",
    skills: "आवश्यक कौशल्ये",
    applyHeading: "या नोकरीसाठी अर्ज करा",
    applyHint: "तुम्ही काही सोप्या टप्प्यांत अर्ज करू शकता.",
    optionalNote: "मालकाला संदेश (ऐच्छिक)",
    notePlaceholder: "हवे असल्यास छोटा संदेश लिहा...",
    submit: "आता अर्ज करा",
    sending: "अर्ज पाठवत आहे...",
    success: "अर्ज यशस्वीपणे पाठवला!",
    successDesc: "तुमचा अर्ज नोकरी देणाऱ्याकडे पाठवला आहे.",
    myApplications: "माझे अर्ज पाहा",
    loginHint: "अर्ज करण्यासाठी कामगार खात्याने लॉगिन करा.",
    login: "लॉगिन करून अर्ज करा",
    workerOnly: "फक्त कामगार खाते नोकरीसाठी अर्ज करू शकते.",
    closed: "या नोकरीसाठी अर्ज स्वीकारले जात नाहीत.",
    audioUnavailable: "या ब्राउझरमध्ये ऑडिओ उपलब्ध नाही.",
  },
};

const SPEECH_LANGUAGES = {
  en: "en-IN",
  hi: "hi-IN",
  mr: "mr-IN",
};

export function JobDetailsPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, employerProfile } = useAuth();
  const { language, t } = useLanguage();

  const lang = String(language || "en").toLowerCase().slice(0, 2);
  const ui = LABELS[lang] || LABELS.en;

  const [job, setJob] = useState(
    location.state?.job?._id === id ? location.state.job : null
  );
  const [loading, setLoading] = useState(!location.state?.job);
  const [fetchError, setFetchError] = useState(null);

  const [coverNote, setCoverNote] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState(null);
  const [applied, setApplied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [audioError, setAudioError] = useState("");

  const fetchJob = useCallback(() => {
    if (!id) return;

    setLoading(true);
    setFetchError(null);

    jobsApi
      .getById(id)
      .then(setJob)
      .catch((err) => setFetchError(normalizeError(err)))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!job || String(job._id) !== String(id)) {
      fetchJob();
    }
  }, [id, job, fetchJob]);

  useEffect(() => {
    stopSpeech();
    setSpeaking(false);
    setIsPaused(false);
    setAudioError("");
    return () => {
      stopSpeech();
    };
  }, [id]);

  useEffect(() => {
    setApplied(false);
    setApplyError(null);
    setCoverNote("");
  }, [id]);

  if (loading) {
    return (
      <div className="container job-details-page">
        <div className="job-details-loading">
          <Spinner label={t("common.loading")} />
        </div>
      </div>
    );
  }

  if (fetchError && !job) {
    return (
      <div className="container job-details-page">
        <ErrorBanner error={fetchError} onRetry={fetchJob} />
        <button
          type="button"
          className="job-details-back"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft size={18} />
          {t("common.back")}
        </button>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="container job-details-page">
        <EmptyState
          icon={Briefcase}
          title={t("jobs.notFound")}
          description={t("jobs.notFoundDesc")}
          action={<Link to="/jobs">{t("browseAllJobs")}</Link>}
        />
      </div>
    );
  }

  const title =
    job.titleText ||
    pickLocalizedText(job.title, language, job.originalLanguage) ||
    t("jobs.untitled");

  const description =
    job.descriptionText ||
    pickLocalizedText(job.description, language, job.originalLanguage);

  const postedBy = employerName(job.employerId);
  const isWorker = user?.roles?.includes(USER_ROLES.WORKER);

  const employerRatingAvg =
    typeof job.employerId?.ratingAvg === "number"
      ? job.employerId.ratingAvg
      : typeof job.employerRatingAvg === "number"
      ? job.employerRatingAvg
      : undefined;

  const employerRatingCount =
    typeof job.employerId?.ratingCount === "number"
      ? job.employerId.ratingCount
      : typeof job.employerRatingCount === "number"
      ? job.employerRatingCount
      : 0;

  const employerUserId =
    job.employerId?.userId?._id ||
    job.employerId?.userId ||
    (typeof job.employerId === "string" ? job.employerId : null);

  const isOwner =
    job.isOwner ||
    (employerProfile &&
      String(employerProfile._id) ===
        String(job.employerId?._id || job.employerId));

  const isOpen = job.status === "open";

  const formattedPay =
    job.payAmount !== undefined && job.payAmount !== null
      ? `₹${Number(job.payAmount).toLocaleString("en-IN")}`
      : "";

  const payType = job.payType
    ? t(PAY_TYPE_KEYS[job.payType] ?? job.payType)
    : "";

  const shift = job.shiftType
    ? t(SHIFT_TYPE_KEYS[job.shiftType] ?? job.shiftType)
    : "";

  const formatDate = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString(
      lang === "mr" ? "mr-IN" : lang === "hi" ? "hi-IN" : "en-IN"
    );
  };

  const handleToggleSpeak = () => {
    setAudioError("");

    if (speaking) {
      stopSpeech();
      setSpeaking(false);
      setIsPaused(false);
      return;
    }

    const parts = [
      title,
      postedBy ? `${ui.postedBy}: ${postedBy}` : null,
      job.city ? `${ui.location}: ${job.city}${job.address ? `, ${job.address}` : ""}` : null,
      formattedPay ? `${ui.salary}: ${formattedPay} ${payType}` : null,
      shift ? `${ui.shift}: ${shift}` : null,
      job.experienceRequired ? `${ui.experience}: ${job.experienceRequired} ${ui.years}` : null,
      job.requiredWorkers ? `${ui.workers}: ${job.requiredWorkers}` : null,
      description || null,
    ].filter(Boolean);

    const speechText = parts.join(". ");

    const started = speakText({
      text: speechText,
      lang,
      rate: 0.88,
      onStart: () => {
        setSpeaking(true);
        setIsPaused(false);
      },
      onPause: () => setIsPaused(true),
      onResume: () => setIsPaused(false),
      onEnd: () => {
        setSpeaking(false);
        setIsPaused(false);
      },
      onError: () => {
        setSpeaking(false);
        setIsPaused(false);
      },
      onNoVoice: () => {
        setSpeaking(false);
        setIsPaused(false);
        setAudioError(ui.audioUnavailable);
      },
    });

    if (!started) {
      setSpeaking(false);
      setIsPaused(false);
    }
  };

  const handlePauseAudio = () => {
    pauseSpeech();
    setIsPaused(true);
  };

  const handleResumeAudio = () => {
    resumeSpeech();
    setIsPaused(false);
  };

  const handleStopAudio = () => {
    stopSpeech();
    setSpeaking(false);
    setIsPaused(false);
  };

  const handleApply = async (event) => {
    event.preventDefault();

    if (applying || applied) return;

    setApplying(true);
    setApplyError(null);

    try {
      await applicationsApi.apply({
        jobId: job._id,
        coverNote: coverNote.trim() || undefined,
      });

      setApplied(true);
    } catch (err) {
      setApplyError(normalizeError(err));
    } finally {
      setApplying(false);
    }
  };

  const handleEmployerAction = (action) => {
    if (action === "delete") {
      navigate("/employer-dashboard", {
        state: { message: t("jobs.deletedSuccess") },
      });
    } else {
      fetchJob();
    }
  };

  return (
    <div className="container job-details-page page-animate">
      <button
        type="button"
        className="job-details-back"
        onClick={() => navigate(-1)}
      >
        <ArrowLeft size={19} aria-hidden="true" />
        <span>{t("common.back")}</span>
      </button>

      {location.state?.message && (
        <div className="job-details-notice" role="status">
          <CheckCircle2 size={19} />
          {location.state.message}
        </div>
      )}

      {isOwner && (
        <Card className="job-employer-bar">
          <div className="job-details-employer-management">
            <div>
              <strong>{t("jobs.employerManagement")}</strong>
              <div className="job-details-management-status">
                <StatusPill status={job.status} />
                <span>
                  <Users size={17} />
                  {job.filledWorkers || 0} / {job.requiredWorkers || 1}{" "}
                  {t("workersHired")}
                </span>
              </div>
            </div>
          </div>

          <JobStatusActions
            job={job}
            onActionCompleted={handleEmployerAction}
          />
        </Card>
      )}

      <Card className="job-details-card">
        <div className="job-details-header">
          <div className="job-details-icon">
            <Briefcase size={32} aria-hidden="true" />
          </div>

          <div className="job-details-header-content">
            <div className="job-details-title-row">
              <h1>{title}</h1>
              <StatusPill status={job.status} />
            </div>

            {postedBy && (
              <div className="job-details-employer-meta">
                <p className="job-details-employer">
                  {ui.postedBy}: <strong>{postedBy}</strong>
                </p>
                <div className="job-details-employer-rating">
                  <RatingStars
                    value={employerRatingAvg}
                    count={employerRatingCount}
                  />
                  {employerUserId && (
                    <a href="#reviews" className="job-details-reviews-link">
                      {employerRatingCount > 0
                        ? `${ui.reviews} (${employerRatingCount})`
                        : ui.reviews}
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="job-details-audio">
          {!speaking ? (
            <button
              type="button"
              className="job-details-listen"
              onClick={handleToggleSpeak}
              aria-label={ui.listen}
            >
              <Volume2 size={21} aria-hidden="true" />
              <span>{ui.listen}</span>
            </button>
          ) : (
            <div className="job-details-audio-controls" role="group" aria-label="Audio controls">
              <span className="job-details-audio-status" aria-live="polite">
                {isPaused ? ui.paused : ui.speaking}
              </span>

              {isPaused ? (
                <button
                  type="button"
                  className="job-details-audio-btn resume"
                  onClick={handleResumeAudio}
                  aria-label={ui.resume}
                >
                  <Play size={18} aria-hidden="true" />
                  <span>{ui.resume}</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="job-details-audio-btn pause"
                  onClick={handlePauseAudio}
                  aria-label={ui.pause}
                >
                  <Pause size={18} aria-hidden="true" />
                  <span>{ui.pause}</span>
                </button>
              )}

              <button
                type="button"
                className="job-details-audio-btn stop"
                onClick={handleStopAudio}
                aria-label={ui.stop}
              >
                <Square size={18} aria-hidden="true" />
                <span>{ui.stop}</span>
              </button>
            </div>
          )}

          {audioError && <p className="job-details-audio-error" role="alert">{audioError}</p>}
        </div>

        <div className="job-details-grid">
          {job.city && (
            <div className="job-details-info">
              <span className="job-details-info-icon location">
                <MapPin size={25} aria-hidden="true" />
              </span>
              <div>
                <span className="job-details-info-label">{ui.location}</span>
                <strong>
                  {job.city}
                  {job.address ? `, ${job.address}` : ""}
                </strong>
              </div>
            </div>
          )}

          {formattedPay && (
            <div className="job-details-info">
              <span className="job-details-info-icon salary">
                <Wallet size={25} aria-hidden="true" />
              </span>
              <div>
                <span className="job-details-info-label">{ui.salary}</span>
                <strong>
                  {formattedPay}
                  {payType ? ` / ${payType}` : ""}
                </strong>
              </div>
            </div>
          )}

          <div className="job-details-info">
            <span className="job-details-info-icon workers">
              <Users size={25} aria-hidden="true" />
            </span>
            <div>
              <span className="job-details-info-label">{ui.workers}</span>
              <strong>
                {job.requiredWorkers || 1} {t("workersNeeded")}
              </strong>
              <small>
                {job.filledWorkers || 0} {t("workersHired")}
              </small>
            </div>
          </div>

          {typeof job.experienceRequired === "number" && (
            <div className="job-details-info">
              <span className="job-details-info-icon experience">
                <Briefcase size={25} aria-hidden="true" />
              </span>
              <div>
                <span className="job-details-info-label">{ui.experience}</span>
                <strong>
                  {job.experienceRequired === 0
                    ? t("noExperienceRequired")
                    : `${job.experienceRequired}+ ${t("yearsExperience")}`}
                </strong>
              </div>
            </div>
          )}

          {job.shiftType && (
            <div className="job-details-info">
              <span className="job-details-info-icon shift">
                <Clock size={25} aria-hidden="true" />
              </span>
              <div>
                <span className="job-details-info-label">{ui.shift}</span>
                <strong>{shift}</strong>
                {job.startTime && job.endTime && (
                  <small>
                    {job.startTime} - {job.endTime}
                  </small>
                )}
              </div>
            </div>
          )}

          {job.preferredLanguages?.length > 0 && (
            <div className="job-details-info">
              <span className="job-details-info-icon languages">
                <Languages size={25} aria-hidden="true" />
              </span>
              <div>
                <span className="job-details-info-label">{ui.languages}</span>
                <strong>{job.preferredLanguages.join(", ")}</strong>
              </div>
            </div>
          )}

          {job.startDate && (
            <div className="job-details-info">
              <span className="job-details-info-icon date">
                <CalendarDays size={25} aria-hidden="true" />
              </span>
              <div>
                <span className="job-details-info-label">{ui.start}</span>
                <strong>{formatDate(job.startDate)}</strong>
              </div>
            </div>
          )}

          {job.applicationDeadline && (
            <div className="job-details-info">
              <span className="job-details-info-icon date">
                <CalendarDays size={25} aria-hidden="true" />
              </span>
              <div>
                <span className="job-details-info-label">{ui.deadline}</span>
                <strong>{formatDate(job.applicationDeadline)}</strong>
              </div>
            </div>
          )}
        </div>

        {description && (
          <section className="job-details-description">
            <h2>
              <FileText size={22} aria-hidden="true" />
              {t("description")}
            </h2>
            <p>{description}</p>
          </section>
        )}

        {Array.isArray(job.skillIds) &&
          job.skillIds.length > 0 &&
          typeof job.skillIds[0] === "object" && (
            <section className="job-details-skills-section">
              <h2>{ui.skills}</h2>

              <div className="job-details-skills">
                {job.skillIds.map((skill) => (
                  <span
                    className="job-details-skill-tag"
                    key={skill._id}
                  >
                    <ShieldCheck size={16} aria-hidden="true" />
                    {pickLocalizedText(
                      skill.nameMultilingual || skill.name,
                      language
                    ) ||
                      (typeof skill.name === "string"
                        ? skill.name
                        : "")}
                  </span>
                ))}
              </div>
            </section>
          )}

        {!isOwner && (
          <section className="job-details-apply" id="apply">
            <div className="job-details-apply-heading">
              <span className="job-details-apply-icon">
                <Send size={25} aria-hidden="true" />
              </span>

              <div>
                <h2>{ui.applyHeading}</h2>
                <p>{ui.applyHint}</p>
              </div>
            </div>

            {!isAuthenticated && (
              <div className="job-details-login-prompt">
                <p>{ui.loginHint}</p>

                <Link
                  to="/login"
                  state={{ from: location.pathname }}
                  className="job-details-primary-btn"
                >
                  <LogIn size={20} />
                  {ui.login}
                  <ArrowRight size={19} />
                </Link>
              </div>
            )}

            {isAuthenticated && !isWorker && (
              <p className="job-details-apply-hint">{ui.workerOnly}</p>
            )}

            {isAuthenticated && isWorker && !isOpen && (
              <p className="job-details-apply-hint">{ui.closed}</p>
            )}

            {isAuthenticated && isWorker && isOpen && !applied && (
              <form onSubmit={handleApply}>
                {applyError && <ErrorBanner error={applyError} />}

                <label className="job-details-cover-note">
                  <span>{ui.optionalNote}</span>

                  <textarea
                    rows={3}
                    value={coverNote}
                    onChange={(event) =>
                      setCoverNote(event.target.value)
                    }
                    placeholder={ui.notePlaceholder}
                    maxLength={1000}
                  />
                </label>

                <button
                  type="submit"
                  className="job-details-primary-btn"
                  disabled={applying}
                >
                  <Send size={21} aria-hidden="true" />
                  <span>{applying ? ui.sending : ui.submit}</span>
                  {!applying && (
                    <ArrowRight size={20} aria-hidden="true" />
                  )}
                </button>
              </form>
            )}

            {applied && (
              <div className="job-details-success" role="status">
                <CheckCircle2 size={44} aria-hidden="true" />
                <h3>{ui.success}</h3>
                <p>{ui.successDesc}</p>

                <Link
                  to="/applications"
                  className="job-details-primary-btn"
                >
                  {ui.myApplications}
                  <ArrowRight size={20} aria-hidden="true" />
                </Link>
              </div>
            )}
          </section>
        )}
      </Card>

      {employerUserId && (
        <section id="reviews" className="job-details-reviews-section">
          <Card className="job-details-reviews-card">
            <div className="job-details-reviews-header">
              <div>
                <h2>
                  <Star size={22} aria-hidden="true" />
                  {ui.reviews}
                </h2>
                <p className="job-details-reviews-subtitle">
                  {t("rating.workerRatingsSubtitle")}
                </p>
              </div>
              <div className="job-details-reviews-rating-badge">
                <RatingStars value={employerRatingAvg} count={employerRatingCount} />
              </div>
            </div>
            <RatingList
              userId={String(employerUserId)}
              employerProfile={typeof job.employerId === "object" ? job.employerId : null}
              isEmployer={true}
              isWorker={false}
              activeTab="employer"
            />
          </Card>
        </section>
      )}
    </div>
  );
}
