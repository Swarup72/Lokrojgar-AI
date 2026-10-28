import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  Star,
  Lock,
  Phone,
  MessageSquare,
  MapPin,
  Calendar,
  Clock,
  ArrowRight
} from "lucide-react";
import { useAsync } from "../hooks/useAsync";
import { useLanguage } from "../hooks/useLanguage";
import * as applicationsApi from "../api/applications";
import * as jobsApi from "../api/jobs";
import * as ratingsApi from "../api/ratings";
import * as chatApi from "../api/chat";
import { normalizeError } from "../api/client";
import { pickLocalizedText } from "../utils/localizedText";
import { Card } from "../components/common/Card";
import { StatusPill } from "../components/common/StatusPill";
import { RatingForm } from "../components/reviews/RatingForm";
import { MapLink } from "../components/common/MapLink";
import { Spinner } from "../components/common/Spinner";
import { ErrorBanner } from "../components/common/ErrorBanner";
import { EmptyState } from "../components/common/EmptyState";
import { PAY_TYPE_KEYS, SHIFT_TYPE_KEYS } from "../utils/enumLabels";
import "./ApplicationsPage.css";

export function ApplicationsPage() {
  const { language, t } = useLanguage();
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState("all");
  const [withdrawingId, setWithdrawingId] = useState(null);
  const [withdrawError, setWithdrawError] = useState(null);
  const [ratingApplicationId, setRatingApplicationId] = useState(null);
  const [ratedApplicationIds, setRatedApplicationIds] = useState(new Set());
  const [submittingRating, setSubmittingRating] = useState(false);
  const [resolvingEmployerId, setResolvingEmployerId] = useState(null);
  const [ratingError, setRatingError] = useState(null);
  const [contactByApplication, setContactByApplication] = useState({});
  const [contactBusyId, setContactBusyId] = useState(null);
  const [chatBusyId, setChatBusyId] = useState(null);
  const { data: applications, loading, error, run: refetch } = useAsync(applicationsApi.getMine);

  const handleWithdraw = async (applicationId) => {
    setWithdrawingId(applicationId);
    setWithdrawError(null);
    try {
      await applicationsApi.withdraw(applicationId);
      refetch();
    } catch (err) {
      setWithdrawError(normalizeError(err));
    } finally {
      setWithdrawingId(null);
    }
  };

  const loadEmployerContact = async (application) => {
    setContactBusyId(application._id);
    setRatingError(null);
    try {
      const contact = await jobsApi.getEmployerContact(application.jobId._id);
      setContactByApplication((previous) => ({ ...previous, [application._id]: contact }));
    } catch (err) {
      setRatingError(normalizeError(err));
    } finally {
      setContactBusyId(null);
    }
  };

  const openChat = async (application) => {
    setChatBusyId(application._id);
    setRatingError(null);
    try {
      const conversation = await chatApi.getOrCreateConversation({ jobId: application.jobId._id });
      navigate("/messages", { state: { conversationId: conversation._id } });
    } catch (err) {
      setRatingError(normalizeError(err));
    } finally {
      setChatBusyId(null);
    }
  };

  const markRated = (applicationId) => {
    setRatedApplicationIds((prev) => new Set(prev).add(applicationId));
    setRatingApplicationId(null);
  };

  const openRatingForm = async (application) => {
    setRatingError(null);
    if (application.employerUserId) {
      setRatingApplicationId(application._id);
      return;
    }
    setResolvingEmployerId(application._id);
    try {
      const job = await jobsApi.getById(application.jobId._id);
      const employerUserId = job?.employerId?.userId;
      if (!employerUserId) {
        setRatingError({ message: t("employerProfileUnavailable") });
        return;
      }
      application.employerUserId = employerUserId;
      setRatingApplicationId(application._id);
    } catch (err) {
      setRatingError(normalizeError(err));
    } finally {
      setResolvingEmployerId(null);
    }
  };

  const handleRateEmployer = async (application, payload) => {
    setSubmittingRating(true);
    setRatingError(null);
    try {
      await ratingsApi.submit({
        jobId: application.jobId._id,
        toUserId: application.employerUserId,
        ...payload,
      });
      markRated(application._id);
      refetch();
    } catch (err) {
      const normalized = normalizeError(err);
      if (normalized.status === 409) {
        markRated(application._id);
      } else {
        setRatingError(normalized);
      }
    } finally {
      setSubmittingRating(false);
    }
  };

  const renderRateEmployer = (application) => {
    if (application.status !== "completed") return null;
    if (ratedApplicationIds.has(application._id)) {
      return <span className="application-rated-note">{t("youRatedEmployer")}</span>;
    }
    if (application.jobId?.status !== "completed") {
      return (
        <span className="application-rate-hint">
          <Lock size={13} aria-hidden="true" /> {t("ratingOpensWhenClosed")}
        </span>
      );
    }
    if (ratingApplicationId === application._id) {
      return (
        <RatingForm onSubmit={(payload) => handleRateEmployer(application, payload)} submitting={submittingRating} />
      );
    }
    return (
      <button
        type="button"
        className="btn btn-secondary application-rate-btn"
        onClick={() => openRatingForm(application)}
        disabled={resolvingEmployerId === application._id}
      >
        <Star size={15} aria-hidden="true" />{" "}
        {resolvingEmployerId === application._id ? t("common.loading") : t("rateEmployer")}
      </button>
    );
  };

  const getStatusExplanation = (status) => {
    switch (status) {
      case "applied":
        return t("applications.status.applied");
      case "shortlisted":
        return t("applications.status.shortlisted");
      case "accepted":
        return t("applications.status.accepted");
      case "completed":
        return t("applications.status.completed");
      case "rejected":
        return t("applications.status.rejected");
      case "withdrawn":
        return t("applications.status.withdrawn");
      default:
        return "";
    }
  };

  const allApps = applications || [];
  const countInReview = allApps.filter((a) => ["applied", "shortlisted"].includes(a.status)).length;
  const countAccepted = allApps.filter((a) => a.status === "accepted").length;
  const countCompleted = allApps.filter((a) => a.status === "completed").length;
  const countOther = allApps.filter((a) => ["rejected", "withdrawn"].includes(a.status)).length;

  const filterTabs = [
    { key: "all", labelKey: "applications.all", count: allApps.length },
    { key: "inReview", labelKey: "applications.inReview", count: countInReview },
    { key: "accepted", labelKey: "applications.accepted", count: countAccepted },
    { key: "completed", labelKey: "applications.completed", count: countCompleted },
  ];
  if (countOther > 0) {
    filterTabs.push({ key: "other", labelKey: "applications.other", count: countOther });
  }

  const filteredApplications = allApps.filter((app) => {
    if (activeFilter === "inReview") return ["applied", "shortlisted"].includes(app.status);
    if (activeFilter === "accepted") return app.status === "accepted";
    if (activeFilter === "completed") return app.status === "completed";
    if (activeFilter === "other") return ["rejected", "withdrawn"].includes(app.status);
    return true;
  });

  return (
    <div className="container applications-page page-animate">
      <div className="applications-header">
        <div className="applications-header-text">
          <h1>{t("nav.applications")}</h1>
          <p className="applications-sub">{t("myApplicationsDesc")}</p>
        </div>
      </div>

      {withdrawError && <ErrorBanner error={withdrawError} />}
      {ratingError && <ErrorBanner error={ratingError} />}
      {loading && <Spinner label={t("loadingApplications")} />}
      {!loading && error && <ErrorBanner error={error} onRetry={refetch} />}

      {!loading && !error && allApps.length === 0 && (
        <EmptyState
          icon={FileText}
          title={t("noApplicationsYet")}
          description={t("noApplicationsDesc")}
          action={
            <button
              type="button"
              className="btn btn-primary application-browse-btn"
              onClick={() => navigate("/jobs")}
            >
              {t("applications.browseJobsAction")}
            </button>
          }
        />
      )}

      {!loading && !error && allApps.length > 0 && (
        <>
          <div className="applications-filters" role="tablist" aria-label={t("nav.applications")}>
            {filterTabs.map((tab) => {
              const isActive = activeFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`app-filter-tab ${isActive ? "active" : ""}`}
                  onClick={() => setActiveFilter(tab.key)}
                >
                  <span className="app-filter-label">{t(tab.labelKey)}</span>
                  <span className="app-filter-count">{tab.count}</span>
                </button>
              );
            })}
          </div>

          {filteredApplications.length === 0 ? (
            <div className="applications-empty-filter">
              <p>{t("applications.noApplications")}</p>
              <button
                type="button"
                className="btn btn-secondary application-reset-btn"
                onClick={() => setActiveFilter("all")}
              >
                {t("applications.all")}
              </button>
            </div>
          ) : (
            <div className="applications-list">
              {filteredApplications.map((application) => {
                const job = application.jobId;
                const title = job?.titleText || pickLocalizedText(job?.title, language, job?.originalLanguage);
                const canWithdraw = ["applied", "shortlisted"].includes(application.status);
                const isWithdrawing = withdrawingId === application._id;
                const contact = contactByApplication[application._id];
                const isHired = ["accepted", "completed"].includes(application.status);
                const payTypeLabel = job?.payType && PAY_TYPE_KEYS[job.payType] ? t(PAY_TYPE_KEYS[job.payType]) : job?.payType;
                const shiftLabel = job?.shiftType && SHIFT_TYPE_KEYS[job.shiftType] ? t(SHIFT_TYPE_KEYS[job.shiftType]) : job?.shiftType;

                return (
                  <Card key={application._id} className={`application-card application-card--${application.status} animated-card`}>
                    <div className="application-card-grid">
                      {/* Left Column: Job & Application Details */}
                      <div className="application-card-left">
                        <div className="application-heading">
                          <div className="application-title-wrap">
                            <h3 className="application-job-title">{title || t("employer")}</h3>
                            <StatusPill status={application.status} />
                          </div>
                        </div>

                        <div className="application-meta-list">
                          <div className="application-meta-item application-pay-item">
                            <strong className="application-pay-amount">₹{job?.payAmount}</strong>
                            {payTypeLabel && <span className="application-pay-type">/ {payTypeLabel}</span>}
                          </div>
                          {job?.city && (
                            <div className="application-meta-item">
                              <MapPin size={14} aria-hidden="true" />
                              <span>{job.city}</span>
                            </div>
                          )}
                          {shiftLabel && (
                            <div className="application-meta-item">
                              <Clock size={14} aria-hidden="true" />
                              <span>{shiftLabel}</span>
                            </div>
                          )}
                        </div>

                        <div className="application-sub-meta">
                          <span className="application-date">
                            <Calendar size={13} aria-hidden="true" />
                            <span>
                              {t("common.applied")}{" "}
                              {new Date(application.appliedAt || application.createdAt).toLocaleDateString()}
                            </span>
                          </span>
                        </div>

                        {application.note && (
                          <div className="application-note-card">
                            <span className="application-note-title">{t("applications.coverNote")}</span>
                            <p className="application-note-body">{application.note}</p>
                          </div>
                        )}

                        {job?._id && (
                          <div className="application-view-job-wrap">
                            <button
                              type="button"
                              className="application-view-job-link"
                              onClick={() => navigate(`/jobs/${job._id}`)}
                            >
                              <span>{t("applications.viewJob")}</span>
                              <ArrowRight size={13} aria-hidden="true" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Right Column: Status Banner & Contextual Actions */}
                      <div className="application-card-right">
                        <div className={`application-status-card status-${application.status}`}>
                          <p className="application-status-message">
                            {getStatusExplanation(application.status)}
                          </p>
                          {isHired && (
                            <p className="application-status-subnote">
                              {application.status === "accepted"
                                ? t("acceptedJobNextStep")
                                : t("completedJobNextStep")}
                            </p>
                          )}
                        </div>

                        {isHired && (
                          <div className="application-actions-group">
                            <button
                              type="button"
                              className="btn btn-primary application-msg-employer-btn"
                              onClick={() => openChat(application)}
                              disabled={chatBusyId === application._id}
                            >
                              <MessageSquare size={16} aria-hidden="true" />
                              <span>
                                {chatBusyId === application._id ? t("common.loading") : t("messageEmployer")}
                              </span>
                            </button>

                            {contact ? (
                              <div className="application-contact-box">
                                <div className="application-contact-name">
                                  <span className="application-contact-sub">{t("employer")}</span>
                                  <strong>{contact.employerName || t("employer")}</strong>
                                </div>
                                <div className="application-contact-buttons">
                                  {contact.phone && (
                                    <a
                                      href={`tel:${contact.phone}`}
                                      className="btn btn-secondary application-call-link"
                                    >
                                      <Phone size={14} aria-hidden="true" />
                                      <span>{contact.phone}</span>
                                    </a>
                                  )}
                                  {contact.employerLocation && (
                                    <MapLink
                                      location={contact.employerLocation}
                                      label={contact.city || contact.village}
                                      kind={t("employerLocation")}
                                    />
                                  )}
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-secondary application-show-contact-btn"
                                onClick={() => loadEmployerContact(application)}
                                disabled={contactBusyId === application._id}
                              >
                                <Phone size={14} aria-hidden="true" />
                                <span>
                                  {contactBusyId === application._id
                                    ? t("common.loading")
                                    : t("showEmployerContact")}
                                </span>
                              </button>
                            )}

                            {job?.location && (
                              <div className="application-job-map-wrap">
                                <MapLink
                                  location={job.location}
                                  label={job.address || job.city}
                                  kind={t("jobLocation")}
                                />
                              </div>
                            )}

                            {application.status === "completed" && (
                              <div className="application-rating-section">
                                {renderRateEmployer(application)}
                              </div>
                            )}
                          </div>
                        )}

                        {canWithdraw && (
                          <div className="application-actions-group">
                            <button
                              type="button"
                              className="btn btn-outline-danger application-withdraw-btn"
                              onClick={() => handleWithdraw(application._id)}
                              disabled={isWithdrawing}
                            >
                              <span>{isWithdrawing ? t("withdrawing") : t("applications.withdrawButton")}</span>
                            </button>
                          </div>
                        )}

                        {["rejected", "withdrawn"].includes(application.status) && (
                          <div className="application-actions-group">
                            <button
                              type="button"
                              className="btn btn-secondary application-browse-jobs-btn"
                              onClick={() => navigate("/jobs")}
                            >
                              <span>{t("applications.browseJobsAction")}</span>
                              <ArrowRight size={14} aria-hidden="true" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
