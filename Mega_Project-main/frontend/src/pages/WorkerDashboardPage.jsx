
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Mic,
  Search,
  UserRound,
  FileText,
  BriefcaseBusiness,
  Sparkles,
  Inbox,
  ArrowRight,
  Volume2,
  VolumeX,
  MessageSquare,
  CheckCircle2,
  Wallet,
  ClipboardList,
  ShieldCheck,
  Wrench,
  Calendar,
} from "lucide-react";

import { useAuth } from "../hooks/useAuth";
import { useAsync } from "../hooks/useAsync";
import { useLanguage } from "../hooks/useLanguage";
import * as recommendationsApi from "../api/recommendations";
import * as applicationsApi from "../api/applications";
import * as workerSkillsApi from "../api/workerSkills";
import { speakText, stopSpeech } from "../utils/speech";
import { sortRecommendedMatches } from "../utils/recommendationScoring";
import { JobCard } from "../components/jobs/JobCard";
import { Card } from "../components/common/Card";
import { Spinner } from "../components/common/Spinner";
import { ErrorBanner } from "../components/common/ErrorBanner";
import { EmptyState } from "../components/common/EmptyState";
import { StatusPill } from "../components/common/StatusPill";
import { ProfileAvatar } from "../components/common/ProfileAvatar";
import "./WorkerDashboardPage.css";
const PROFILE_FIELDS = [
  "fullName",
  "city",
  "expectedPay",
  "experienceYears",
];

function computeProfileCompletion(profile) {
  if (!profile) return 0;

  const filled = PROFILE_FIELDS.filter((field) => {
    const value = profile[field];
    return value !== null &&
      value !== undefined &&
      String(value).trim() !== "";
  }).length;

  const hasBio = Object.values(profile.bio || {}).some(Boolean);
  const hasLanguages = (profile.languages || []).length > 0;

  return Math.round(
    ((filled + Number(hasBio) + Number(hasLanguages)) / 6) * 100
  );
}

const DASHBOARD_TEXT = {
  en: {
    welcome: "Welcome back!",
    quickActions: "What would you like to do?",
    quickDescription: "Choose an option below to get started.",
    audioHelp: "Listen to Help",
    stopAudio: "Stop Audio",
    requests: "Job Requests",
    messages: "Messages",
    profileProgress: "Your Profile Completion",
    completeProfile: "Complete Your Profile",
    profileComplete: "Your profile is complete!",
    recommended: "Jobs Recommended for You",
    recentApplications: "Your Recent Applications",
    applicationSent: "Your application has been submitted successfully.",
    viewAll: "View All",
    viewJobs: "Explore All Jobs",
    voiceProfile: "Voice Profile",
    helpText:
      "Welcome to Lokrozgar AI. Select Find Jobs to search for work. Select My Applications to view your applications. Select Job Requests to check employer requests. Select My Profile to update your information. Select Voice Profile to fill your profile using your voice.",
  },
  hi: {
    welcome: "वापस स्वागत है!",
    quickActions: "आप क्या करना चाहते हैं?",
    quickDescription: "शुरू करने के लिए नीचे दिए गए विकल्प चुनें।",
    audioHelp: "आवाज़ में सुनें",
    stopAudio: "आवाज़ बंद करें",
    requests: "नौकरी के अनुरोध",
    messages: "संदेश",
    profileProgress: "आपकी प्रोफाइल की प्रगति",
    completeProfile: "प्रोफाइल पूरी करें",
    profileComplete: "आपकी प्रोफाइल पूरी हो गई है!",
    recommended: "आपके लिए सुझाई गई नौकरियाँ",
    recentApplications: "आपके हाल के आवेदन",
    applicationSent: "आपका आवेदन सफलतापूर्वक भेज दिया गया है।",
    viewAll: "सभी देखें",
    viewJobs: "सभी नौकरियाँ देखें",
    voiceProfile: "आवाज़ से प्रोफाइल",
    helpText:
      "लोक रोजगार ए आई में आपका स्वागत है। नौकरी खोजने के लिए नौकरी खोजें चुनें। आवेदन देखने के लिए मेरे आवेदन चुनें। नौकरी के अनुरोध देखने के लिए नौकरी के अनुरोध चुनें। अपनी जानकारी बदलने के लिए प्रोफाइल चुनें।",
  },
  mr: {
    welcome: "पुन्हा स्वागत आहे!",
    quickActions: "तुम्हाला काय करायचे आहे?",
    quickDescription: "सुरुवात करण्यासाठी खालील पर्याय निवडा.",
    audioHelp: "आवाजात ऐका",
    stopAudio: "आवाज बंद करा",
    requests: "नोकरीच्या विनंत्या",
    messages: "संदेश",
    profileProgress: "तुमच्या प्रोफाइलची प्रगती",
    completeProfile: "प्रोफाइल पूर्ण करा",
    profileComplete: "तुमचे प्रोफाइल पूर्ण झाले आहे!",
    recommended: "तुमच्यासाठी सुचवलेल्या नोकऱ्या",
    recentApplications: "तुमचे अलीकडील अर्ज",
    applicationSent: "तुमचा अर्ज यशस्वीपणे पाठवला आहे.",
    viewAll: "सर्व पहा",
    viewJobs: "सर्व नोकऱ्या पहा",
    voiceProfile: "आवाजाने प्रोफाइल",
    helpText:
      "लोक रोजगार ए आय मध्ये आपले स्वागत आहे. नोकरी शोधण्यासाठी नोकरी शोधा निवडा. तुमचे अर्ज पाहण्यासाठी माझे अर्ज निवडा. नोकरीच्या विनंत्या पाहण्यासाठी नोकरीच्या विनंत्या निवडा. तुमची माहिती बदलण्यासाठी प्रोफाइल निवडा.",
  },
};

function extractSkillName(s) {
  if (!s) return "";
  const nameVal = s.name || s.skillName || s.skill?.name || s;
  if (typeof nameVal === "string") return nameVal.toLowerCase().trim();
  if (nameVal && typeof nameVal === "object") {
    const str = nameVal.en || nameVal.mr || nameVal.hi || Object.values(nameVal)[0] || "";
    return typeof str === "string" ? str.toLowerCase().trim() : "";
  }
  return "";
}

export function WorkerDashboardPage() {
  const { user, workerProfile } = useAuth();
  const { t, language } = useLanguage();

  const [appliedJobIds, setAppliedJobIds] = useState(new Set());
  const [applyError, setApplyError] = useState(null);
  const [speaking, setSpeaking] = useState(false);

  const utteranceRef = useRef(null);

  const ui = DASHBOARD_TEXT[language] || DASHBOARD_TEXT.en;

  const {
    data: recommended,
    loading: loadingRecommended,
    error: recommendedError,
  } = useAsync(recommendationsApi.getRecommendedJobs);

  const { data: workerSkills } = useAsync(workerSkillsApi.getMine);

  const {
    data: applications,
    loading: loadingApplications,
    error: applicationsError,
    run: refetchApplications,
  } = useAsync(applicationsApi.getMine);

  const completion = useMemo(
    () => computeProfileCompletion(workerProfile),
    [workerProfile]
  );

  const recentApplications = Array.isArray(applications)
    ? applications.slice(0, 5)
    : [];

  const recommendedJobs = useMemo(
    () => sortRecommendedMatches(recommended, workerSkills),
    [recommended, workerSkills]
  );

  useEffect(() => {
    return () => {
      stopSpeech();
    };
  }, []);

  const handleStopSpeech = () => {
    stopSpeech();
    setSpeaking(false);
  };

  const speak = (message) => {
    const started = speakText({
      text: message,
      lang: language,
      rate: 0.88,
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
      onError: () => setSpeaking(false),
      onNoVoice: () => setSpeaking(false),
    });

    if (!started) {
      setSpeaking(false);
    }
  };

  const handleAudioHelp = () => {
    if (speaking) {
      handleStopSpeech();
    } else {
      speak(ui.helpText);
    }
  };

  const handleApply = async (jobId) => {
    setApplyError(null);

    try {
      await applicationsApi.apply({ jobId });

      setAppliedJobIds((previous) => {
        const updated = new Set(previous);
        updated.add(jobId);
        return updated;
      });

      refetchApplications().catch(() => {});
      speak(ui.applicationSent);
    } catch (error) {
      setApplyError(error);
    }
  };

  const dashboardActions = [
    {
      id: "jobs",
      icon: Search,
      label: t("findJobs"),
      path: "/jobs",
      className: "action-jobs",
    },
    {
      id: "applications",
      icon: FileText,
      label: t("worker.dashboard.myApplicationsAction"),
      path: "/applications",
      className: "action-applications",
    },
    {
      id: "profile",
      icon: UserRound,
      label: t("profile"),
      path: "/profile",
      className: "action-profile",
    },
    {
      id: "voice",
      icon: Mic,
      label: ui.voiceProfile,
      path: "/voice-profile",
      className: "action-voice",
    },
    {
      id: "requests",
      icon: Inbox,
      label: ui.requests,
      path: "/job-requests",
      className: "action-requests",
    },
    {
      id: "availability",
      icon: Calendar,
      label: t("nav.myAvailability"),
      path: "/worker-availability",
      className: "action-profile",
    },
    {
      id: "messages",
      icon: MessageSquare,
      label: ui.messages,
      path: "/messages",
      className: "action-messages",
    },
  ];

  return (
    <div className="container worker-dashboard page-animate">
      {/* Welcome section */}
      <header className="worker-welcome">
        <div className="worker-welcome-content">
          <ProfileAvatar
  role="worker"
  size={76}
  className="worker-welcome-avatar"
/>


          <div className="worker-welcome-text">
            <p className="worker-welcome-eyebrow">{ui.welcome}</p>

            <h1>
              {workerProfile?.fullName ||
                user?.fullName ||
                user?.phone ||
                t("dashboard.greeting", { name: "" })}
            </h1>

            <p>{t("dashboard.workerSubtitle")}</p>
          </div>
        </div>

        <button
          type="button"
          className="worker-audio-button"
          onClick={handleAudioHelp}
          aria-label={speaking ? ui.stopAudio : ui.audioHelp}
          aria-pressed={speaking}
        >
          {speaking ? (
            <VolumeX size={23} aria-hidden="true" />
          ) : (
            <Volume2 size={23} aria-hidden="true" />
          )}
          <span>{speaking ? ui.stopAudio : ui.audioHelp}</span>
        </button>
      </header>

      {/* Quick actions */}
      <section className="worker-quick-section">
        <div className="worker-section-heading">
          <div>
            <h2>{ui.quickActions}</h2>
            <p>{ui.quickDescription}</p>
          </div>
        </div>

        <div className="worker-icon-grid">
          {dashboardActions.map((action) => {
            const Icon = action.icon;

            return (
              <Link
                key={action.id}
                to={action.path}
                className={`worker-icon-card ${action.className}`}
              >
                <span className="worker-icon-circle">
                  <Icon size={35} strokeWidth={2.1} aria-hidden="true" />
                </span>

                <strong>{action.label}</strong>

                <ArrowRight
                  size={18}
                  className="worker-card-arrow"
                  aria-hidden="true"
                />
              </Link>
            );
          })}
        </div>
      </section>

      {/* Profile completion */}
      <Card className="worker-dashboard-completion-card">
        <div className="completion-info">
          <div className="completion-text">
            {completion === 100 ? (
              <CheckCircle2
                size={23}
                className="completion-success-icon"
                aria-hidden="true"
              />
            ) : (
              <Sparkles
                size={23}
                className="completion-sparkle"
                aria-hidden="true"
              />
            )}

            <span>{ui.profileProgress}</span>
          </div>

          <strong>{completion}%</strong>
        </div>

        <div
          className="worker-dashboard-completion-bar"
          role="progressbar"
          aria-valuenow={completion}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={ui.profileProgress}
        >
          <div style={{ width: `${completion}%` }} />
        </div>

        {completion < 100 ? (
          <Link to="/profile" className="worker-complete-profile-link">
            {ui.completeProfile}
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        ) : (
          <p className="worker-profile-complete-message">
            <ShieldCheck size={18} aria-hidden="true" />
            {ui.profileComplete}
          </p>
        )}
      </Card>

      {/* Recommended jobs */}
      <section className="worker-dashboard-section">
        <div className="section-title-row">
          <h2>
            <BriefcaseBusiness size={25} aria-hidden="true" />
            {ui.recommended}
          </h2>

          <Link to="/jobs" className="section-view-all">
            {ui.viewJobs}
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>

        {!workerProfile && (
          <EmptyState
            icon={BriefcaseBusiness}
            title={t("createProfilePrompt")}
            description={t("createProfilePromptDesc")}
            action={
              <Link to="/profile" className="worker-empty-action">
                {ui.completeProfile}
              </Link>
            }
          />
        )}

        {workerProfile && !loadingRecommended && (!workerSkills || workerSkills.length === 0) && (
          <Card className="worker-cold-start-card animated-card">
            <div className="cold-start-content">
              <div className="cold-start-left">
                <div className="cold-start-icon">
                  <Wrench size={24} aria-hidden="true" />
                </div>
                <div className="cold-start-text">
                  <h3>{t("recommendations.coldStartTitle")}</h3>
                  <p>{t("recommendations.coldStartDesc")}</p>
                </div>
              </div>
              <Link to="/profile" className="btn btn-primary">
                {t("recommendations.addSkillsAction")}
              </Link>
            </div>
          </Card>
        )}

        {workerProfile && loadingRecommended && (
          <Spinner label={t("findingJobs")} />
        )}

        {workerProfile && recommendedError && (
          <ErrorBanner error={recommendedError} />
        )}

        {applyError && <ErrorBanner error={applyError} />}

        {workerProfile &&
          !loadingRecommended &&
          !recommendedError &&
          recommendedJobs.length === 0 && (
            <EmptyState
              icon={BriefcaseBusiness}
              title={t("noRecommendedJobs")}
              description={t("checkBackSoon")}
            />
          )}

        {workerProfile &&
          !loadingRecommended &&
          !recommendedError &&
          recommendedJobs.length > 0 && (
            <div className="worker-dashboard-job-list">
              {recommendedJobs
                .filter((match) => match?.job?._id)
                .map((match) => (
                  <div
                    key={match.job._id}
                    className="worker-visual-job-card"
                  >
                    <JobCard
                      job={match.job}
                      matchScore={match.recommendationScore ?? match.matchScore}
                      originalMatchScore={match.originalMatchScore ?? match.matchScore}
                      matchFactors={match.matchFactors}
                      explanation={match.explanation}
                      matchingSkills={match.matchingSkills}
                      missingSkills={match.missingSkills}
                      skillMatchStatus={match.skillMatchStatus}
                      onApply={() => handleApply(match.job._id)}
                      applyDisabled={
                        appliedJobIds.has(match.job._id) ||
                        match.job.status !== "open"
                      }
                      applyLabel={
                        appliedJobIds.has(match.job._id)
                          ? t("common.applied")
                          : t("common.apply")
                      }
                    />
                  </div>
                ))}
            </div>
          )}
      </section>

      {/* Recent applications */}
      <section className="worker-dashboard-section">
        <div className="section-title-row">
          <h2>
            <ClipboardList size={25} aria-hidden="true" />
            {ui.recentApplications}
          </h2>

          <Link to="/applications" className="section-view-all">
            {ui.viewAll}
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>

        {loadingApplications && (
          <Spinner label={t("loadingApplications")} />
        )}

        {applicationsError && (
          <ErrorBanner error={applicationsError} />
        )}

        {!loadingApplications &&
          !applicationsError &&
          recentApplications.length === 0 && (
            <EmptyState
              icon={FileText}
              title={t("noApplicationsYet")}
              description={t("noApplicationsDesc")}
            />
          )}

        {!loadingApplications &&
          !applicationsError &&
          recentApplications.length > 0 && (
            <div className="worker-dashboard-applications">
              {recentApplications.map((application) => (
                <Card
                  key={application._id}
                  className="worker-dashboard-application-card animated-card"
                >
                  <div className="worker-application-details">
                    <div className="worker-application-icon">
                      <FileText size={25} aria-hidden="true" />
                    </div>

                    <div className="worker-application-content">
                      <h3>
                        {application.jobId?.titleText ||
                          application.jobId?.title?.[language] ||
                          application.jobId?.title?.en ||
                          "Job"}
                      </h3>

                      {application.jobId?.payAmount != null && (
                        <p>
                          <Wallet size={17} aria-hidden="true" />
                          ₹{Number(
                            application.jobId.payAmount
                          ).toLocaleString("en-IN")}
                          {application.jobId?.payType
                            ? ` / ${application.jobId.payType}`
                            : ""}
                        </p>
                      )}
                    </div>
                  </div>

                  <StatusPill status={application.status} />
                </Card>
              ))}
            </div>
          )}
      </section>
    </div>
  );
}
