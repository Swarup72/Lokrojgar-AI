
import { useMemo, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  PlusCircle,
  BriefcaseBusiness,
  Eye,
  UserRound,
  Users,
  MessageSquare,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileText,
  MapPin,
  Wallet,
  Building2,
  ClipboardList,
} from "lucide-react";

import { useAuth } from "../hooks/useAuth";
import { useAsync } from "../hooks/useAsync";
import { useLanguage } from "../hooks/useLanguage";
import { PAY_TYPE_KEYS } from "../utils/enumLabels";
import * as jobsApi from "../api/jobs";
import { pickLocalizedText } from "../utils/localizedText";
import { ownEmployerName } from "../utils/displayName";

import { Card } from "../components/common/Card";
import { StatusPill } from "../components/common/StatusPill";
import { Spinner } from "../components/common/Spinner";
import { ErrorBanner } from "../components/common/ErrorBanner";
import { EmptyState } from "../components/common/EmptyState";
import { JobStatusActions } from "../components/jobs/JobStatusActions";

import "./EmployerDashboardPage.css";
import { ProfileAvatar } from "../components/common/ProfileAvatar";
const DASHBOARD_TEXT = {
  en: {
    welcome: "Welcome back!",
    quickActions: "Manage Your Work",
    quickDescription: "Choose an option to manage jobs and workers.",
    postJob: "Post a New Job",
    myJobs: "My Jobs",
    applicants: "View Applicants",
    profile: "My Profile",
    messages: "Messages",
    totalJobs: "Total Jobs",
    activeJobs: "Active Jobs",
    draftJobs: "Draft Jobs",
    closedJobs: "Closed Jobs",
    jobsSection: "Manage Your Job Posts",
    jobDetails: "View Details",
    workersNeeded: "Workers Needed",
    noTitle: "Untitled Job",
    all: "All",
    active: "Active",
    draft: "Draft",
    closed: "Closed",
    filterEmpty: "No jobs found in this category.",
    hired: "Workers Hired",
    applicantsHint: "Open a job to manage its applicants.",
  },
  hi: {
    welcome: "वापस स्वागत है!",
    quickActions: "अपना काम संभालें",
    quickDescription: "नौकरियाँ और कामगार संभालने के लिए विकल्प चुनें।",
    postJob: "नई नौकरी डालें",
    myJobs: "मेरी नौकरियाँ",
    applicants: "आवेदक देखें",
    profile: "मेरी प्रोफाइल",
    messages: "संदेश",
    totalJobs: "कुल नौकरियाँ",
    activeJobs: "सक्रिय नौकरियाँ",
    draftJobs: "ड्राफ्ट नौकरियाँ",
    closedJobs: "बंद नौकरियाँ",
    jobsSection: "अपनी नौकरियाँ संभालें",
    jobDetails: "विवरण देखें",
    workersNeeded: "आवश्यक कामगार",
    noTitle: "बिना नाम की नौकरी",
    all: "सभी",
    active: "सक्रिय",
    draft: "ड्राफ्ट",
    closed: "बंद",
    filterEmpty: "इस श्रेणी में कोई नौकरी नहीं मिली।",
    hired: "कामगार नियुक्त",
    applicantsHint: "आवेदकों को देखने के लिए नौकरी चुनें।",
  },
  mr: {
    welcome: "पुन्हा स्वागत आहे!",
    quickActions: "तुमचे काम व्यवस्थापित करा",
    quickDescription: "नोकऱ्या आणि कामगार व्यवस्थापित करण्यासाठी पर्याय निवडा.",
    postJob: "नवीन नोकरी टाका",
    myJobs: "माझ्या नोकऱ्या",
    applicants: "अर्जदार पहा",
    profile: "माझे प्रोफाइल",
    messages: "संदेश",
    totalJobs: "एकूण नोकऱ्या",
    activeJobs: "सक्रिय नोकऱ्या",
    draftJobs: "मसुदा नोकऱ्या",
    closedJobs: "बंद नोकऱ्या",
    jobsSection: "तुमच्या नोकऱ्या व्यवस्थापित करा",
    jobDetails: "तपशील पहा",
    workersNeeded: "आवश्यक कामगार",
    noTitle: "नाव नसलेली नोकरी",
    all: "सर्व",
    active: "सक्रिय",
    draft: "मसुदा",
    closed: "बंद",
    filterEmpty: "या प्रकारात कोणतीही नोकरी सापडली नाही.",
    hired: "नियुक्त कामगार",
    applicantsHint: "अर्जदार पाहण्यासाठी नोकरी निवडा.",
  },
};

const ACTIVE_STATUSES = ["open", "partially_assigned"];
const CLOSED_STATUSES = [
  "completed",
  "cancelled",
  "expired",
  "assigned",
];

export function EmployerDashboardPage() {
  const { user, employerProfile } = useAuth();
  const { language, t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const [activeFilter, setActiveFilter] = useState("all");

  const {
    data: jobs,
    loading,
    error,
    run: refetchJobs,
  } = useAsync(jobsApi.getEmployerMine);

  const ui = DASHBOARD_TEXT[language] || DASHBOARD_TEXT.en;

  const allJobs = Array.isArray(jobs) ? jobs : [];

  const stats = useMemo(() => {
    return {
      total: allJobs.length,
      active: allJobs.filter((job) =>
        ACTIVE_STATUSES.includes(job.status)
      ).length,
      draft: allJobs.filter((job) => job.status === "draft").length,
      closed: allJobs.filter((job) =>
        CLOSED_STATUSES.includes(job.status)
      ).length,
    };
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    if (activeFilter === "active") {
      return allJobs.filter((job) =>
        ACTIVE_STATUSES.includes(job.status)
      );
    }

    if (activeFilter === "draft") {
      return allJobs.filter((job) => job.status === "draft");
    }

    if (activeFilter === "closed") {
      return allJobs.filter((job) =>
        CLOSED_STATUSES.includes(job.status)
      );
    }

    return allJobs;
  }, [jobs, activeFilter]);

  const quickActions = [
    {
      id: "post",
      icon: PlusCircle,
      label: ui.postJob,
      path: "/post-job",
      className: "employer-action-post",
    },
    {
      id: "jobs",
      icon: BriefcaseBusiness,
      label: ui.myJobs,
      path: "#employer-jobs",
      className: "employer-action-jobs",
    },
    {
      id: "profile",
      icon: UserRound,
      label: ui.profile,
      path: "/profile",
      className: "employer-action-profile",
    },
    {
      id: "messages",
      icon: MessageSquare,
      label: ui.messages,
      path: "/messages",
      className: "employer-action-messages",
    },
  ];

  const tabs = [
    { id: "all", label: ui.all, count: stats.total },
    { id: "active", label: ui.active, count: stats.active },
    { id: "draft", label: ui.draft, count: stats.draft },
    { id: "closed", label: ui.closed, count: stats.closed },
  ];

  return (
    <div className="container employer-dashboard page-animate">
      {location.state?.message && (
        <div className="employer-success-banner" role="status">
          <CheckCircle2 size={21} aria-hidden="true" />
          <span>{location.state.message}</span>
        </div>
      )}

      {/* Welcome */}
      <header className="employer-dashboard-header">
        <div className="employer-welcome-content">
          <ProfileAvatar
  role="employer"
  size={76}
  className="employer-welcome-avatar"
/>


          <div className="employer-welcome-text">
            <p className="employer-welcome-eyebrow">{ui.welcome}</p>

            <h1>
              {t("dashboard.greeting", {
                name: ownEmployerName(employerProfile, user) || "there",
              })}
            </h1>

            <p className="employer-dashboard-sub">
              {t("dashboard.employerSubtitle")}
            </p>
          </div>
        </div>

        <Link
          to="/post-job"
          className="employer-primary-action animated-button"
        >
          <PlusCircle size={22} aria-hidden="true" />
          <span>{ui.postJob}</span>
        </Link>
      </header>

      {/* Quick actions */}
      <section className="employer-quick-section">
        <div className="employer-quick-heading">
          <h2>{ui.quickActions}</h2>
          <p>{ui.quickDescription}</p>
        </div>

        <div className="employer-icon-grid">
          {quickActions.map((action) => {
            const Icon = action.icon;

            return (
              <Link
                key={action.id}
                to={action.path}
                className={`employer-icon-card ${action.className}`}
              >
                <span className="employer-icon-circle">
                  <Icon size={33} strokeWidth={2.1} aria-hidden="true" />
                </span>

                <strong>{action.label}</strong>

                <ArrowRight
                  size={18}
                  className="employer-card-arrow"
                  aria-hidden="true"
                />
              </Link>
            );
          })}
        </div>
      </section>

      {/* Statistics */}
      <section className="employer-stats-section">
        <div className="employer-stats-grid">
          <div className="employer-stat-card stat-total">
            <span className="employer-stat-icon">
              <BriefcaseBusiness size={25} aria-hidden="true" />
            </span>
            <strong>{stats.total}</strong>
            <span>{ui.totalJobs}</span>
          </div>

          <div className="employer-stat-card stat-active">
            <span className="employer-stat-icon">
              <CheckCircle2 size={25} aria-hidden="true" />
            </span>
            <strong>{stats.active}</strong>
            <span>{ui.activeJobs}</span>
          </div>

          <div className="employer-stat-card stat-draft">
            <span className="employer-stat-icon">
              <FileText size={25} aria-hidden="true" />
            </span>
            <strong>{stats.draft}</strong>
            <span>{ui.draftJobs}</span>
          </div>

          <div className="employer-stat-card stat-closed">
            <span className="employer-stat-icon">
              <Clock3 size={25} aria-hidden="true" />
            </span>
            <strong>{stats.closed}</strong>
            <span>{ui.closedJobs}</span>
          </div>
        </div>
      </section>

      {/* My jobs */}
      <section
        className="employer-dashboard-section"
        id="employer-jobs"
      >
        <div className="employer-section-heading">
          <h2>
            <ClipboardList size={25} aria-hidden="true" />
            {ui.jobsSection}
          </h2>
        </div>

        <div className="employer-filter-tabs" role="group" aria-label={ui.myJobs}>
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={`employer-filter-tab ${
                activeFilter === tab.id ? "active" : ""
              }`}
              aria-pressed={activeFilter === tab.id}
            >
              {tab.label}
              <span className="employer-filter-count">{tab.count}</span>
            </button>
          ))}
        </div>

        {loading && <Spinner label={t("loadingJobs")} />}

        {!loading && error && (
          <ErrorBanner error={error} onRetry={refetchJobs} />
        )}

        {!loading && !error && allJobs.length === 0 && (
          <EmptyState
            icon={BriefcaseBusiness}
            title={t("employer.dashboard.noJobs")}
            description={t("postJobPromptDesc")}
            action={
              <Link to="/post-job" className="employer-empty-action">
                <PlusCircle size={18} aria-hidden="true" />
                {ui.postJob}
              </Link>
            }
          />
        )}

        {!loading &&
          !error &&
          allJobs.length > 0 &&
          filteredJobs.length === 0 && (
            <p className="employer-no-filter-results">
              {ui.filterEmpty}
            </p>
          )}

        {!loading && !error && filteredJobs.length > 0 && (
          <div className="employer-job-list">
            {filteredJobs.map((job) => {
              const title = pickLocalizedText(
                job.title,
                language,
                job.originalLanguage
              );

              const category = job.categoryId;

              const categoryName =
                category && typeof category === "object"
                  ? pickLocalizedText(
                      category.nameMultilingual || category.name,
                      language
                    )
                  : null;

              const payLabel = job.payType
                ? t(PAY_TYPE_KEYS[job.payType] ?? job.payType)
                : "";

              return (
                <Card
                  key={job._id}
                  className="employer-job-card animated-card"
                >
                  <div className="employer-job-card-header">
                    <div className="employer-job-main-info">
                      <div className="employer-job-title-row">
                        <span className="employer-job-icon">
                          <BriefcaseBusiness
                            size={25}
                            aria-hidden="true"
                          />
                        </span>

                        <div className="employer-job-title-content">
                          <Link
                            to={`/jobs/${job._id}`}
                            state={{ job }}
                            className="employer-job-title-link"
                          >
                            <h3>{title || ui.noTitle}</h3>
                          </Link>

                          {categoryName && (
                            <p className="employer-job-category">
                              {categoryName}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="employer-job-meta">
                        {job.city && (
                          <span>
                            <MapPin size={16} aria-hidden="true" />
                            {job.city}
                          </span>
                        )}

                        {job.payAmount != null && (
                          <span>
                            <Wallet size={16} aria-hidden="true" />
                            ₹{Number(job.payAmount).toLocaleString("en-IN")}
                            {payLabel ? ` / ${payLabel}` : ""}
                          </span>
                        )}

                        <span>
                          <Users size={16} aria-hidden="true" />
                          {job.filledWorkers || 0}/
                          {job.requiredWorkers ?? 0} {ui.hired}
                        </span>
                      </div>
                    </div>

                    <StatusPill status={job.status} />
                  </div>

                  <div className="employer-job-actions">
                    <button
                      type="button"
                      className="btn btn-secondary employer-view-button"
                      onClick={() =>
                        navigate(`/jobs/${job._id}`, {
                          state: { job },
                        })
                      }
                    >
                      <Eye size={17} aria-hidden="true" />
                      <span>{t("common.viewDetails")}</span>
                    </button>

                    {/* Existing job controls, including applicants */}
                    <JobStatusActions
                      job={job}
                      onActionCompleted={refetchJobs}
                      compact
                    />
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
