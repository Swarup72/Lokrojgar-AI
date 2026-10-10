import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Star, Lock, Phone, MessageSquare } from "lucide-react";
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
import "./ApplicationsPage.css";

export function ApplicationsPage() {
  const { language, t } = useLanguage();
  const navigate = useNavigate();
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

  const renderAcceptedExtras = (application) => {
    if (!["accepted", "completed"].includes(application.status)) return null;
    const contact = contactByApplication[application._id];

    return (
      <div className="application-accepted-extras">
        <p className="application-next-step">
          {application.status === "accepted"
            ? t("acceptedJobNextStep")
            : t("completedJobNextStep")}
        </p>

        <MapLink
          location={application.jobId?.location}
          label={application.jobId?.address || application.jobId?.city}
          kind={t("jobLocation")}
        />

        <div className="application-contact-row">
          {contact ? (
            <div className="application-contact">
              <strong>{contact.employerName || t("employer")}</strong>
              {contact.phone && (
                <a href={`tel:${contact.phone}`} className="application-contact-phone">
                  <Phone size={14} aria-hidden="true" /> {contact.phone}
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
          ) : (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => loadEmployerContact(application)}
              disabled={contactBusyId === application._id}
            >
              <Phone size={15} aria-hidden="true" />{" "}
              {contactBusyId === application._id ? t("common.loading") : t("showEmployerContact")}
            </button>
          )}

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => openChat(application)}
            disabled={chatBusyId === application._id}
          >
            <MessageSquare size={15} aria-hidden="true" />{" "}
            {chatBusyId === application._id ? t("common.loading") : t("messageEmployer")}
          </button>
        </div>
      </div>
    );
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
        className="btn btn-secondary"
        onClick={() => openRatingForm(application)}
        disabled={resolvingEmployerId === application._id}
      >
        <Star size={15} aria-hidden="true" />{" "}
        {resolvingEmployerId === application._id ? t("common.loading") : t("rateEmployer")}
      </button>
    );
  };

  return (
    <div className="container applications-page page-animate">
      <div className="applications-header">
        <h1>{t("nav.applications")}</h1>
        <p className="applications-sub">{t("myApplicationsDesc")}</p>
      </div>

      {withdrawError && <ErrorBanner error={withdrawError} />}
      {ratingError && <ErrorBanner error={ratingError} />}
      {loading && <Spinner label={t("loadingApplications")} />}
      {!loading && error && <ErrorBanner error={error} onRetry={refetch} />}

      {!loading && !error && applications?.length === 0 && (
        <EmptyState icon={FileText} title={t("noApplicationsYet")} description={t("noApplicationsDesc")} />
      )}

      {!loading && !error && applications?.length > 0 && (
        <div className="applications-list">
          {applications.map((application) => {
            const job = application.jobId;
            const title = job?.titleText || pickLocalizedText(job?.title, language, job?.originalLanguage);
            const canWithdraw = ["applied", "shortlisted"].includes(application.status);
            const isWithdrawing = withdrawingId === application._id;
            return (
              <Card key={application._id} className="application-card animated-card">
                <div className="application-card-main">
                  <h3>{title || "Job"}</h3>
                  <p>
                    ₹{job?.payAmount} / {job?.payType}
                    {job?.city ? ` · ${job.city}` : ""}
                  </p>
                  <p className="application-card-date">
                    {t("common.applied")} {new Date(application.appliedAt || application.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="application-card-side">
                  <StatusPill status={application.status} />
                  {canWithdraw && (
                    <button
                      type="button"
                      className="application-withdraw-btn"
                      onClick={() => handleWithdraw(application._id)}
                      disabled={isWithdrawing}
                    >
                      {isWithdrawing ? t("withdrawing") : t("withdraw")}
                    </button>
                  )}
                  {renderRateEmployer(application)}
                </div>
                {renderAcceptedExtras(application)}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
