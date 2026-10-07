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
  const { language } = useLanguage();
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


  /**
   * The employer's contact details, which the server releases only once this
   * application has been accepted. Fetched on demand rather than with the list,
   * so a worker's application list does not pull contact data for every
   * employer they have ever applied to.
   */
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

  /** Opens (or reopens) the chat for this job and goes to it. */
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

  /**
   * What the worker can see and do once the relationship is accepted. Before
   * acceptance they already have the job's own location from the job itself;
   * this adds the employer's contact details and chat, which exist only because
   * a hiring relationship now does.
   */
  const renderAcceptedExtras = (application) => {
    if (!["accepted", "completed"].includes(application.status)) return null;
    const contact = contactByApplication[application._id];

    return (
      <div className="application-accepted-extras">
        <p className="application-next-step">
          {application.status === "accepted"
            ? "You have this job. Contact the employer to agree when to start."
            : "This work is marked finished. Rating opens once the employer closes the job."}
        </p>

        {/* The JOB site - distinct from the employer's own location below. */}
        <MapLink
          location={application.jobId?.location}
          label={application.jobId?.address || application.jobId?.city}
          kind="Job location"
        />

        <div className="application-contact-row">
          {contact ? (
            <div className="application-contact">
              <strong>{contact.employerName || "Employer"}</strong>
              {contact.phone && (
                <a href={`tel:${contact.phone}`} className="application-contact-phone">
                  <Phone size={14} aria-hidden="true" /> {contact.phone}
                </a>
              )}
              {contact.employerLocation && (
                <MapLink
                  location={contact.employerLocation}
                  label={contact.city || contact.village}
                  kind="Employer location"
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
              {contactBusyId === application._id ? "Loading..." : "Show employer contact"}
            </button>
          )}

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => openChat(application)}
            disabled={chatBusyId === application._id}
          >
            <MessageSquare size={15} aria-hidden="true" />{" "}
            {chatBusyId === application._id ? "Opening..." : "Message employer"}
          </button>
        </div>
      </div>
    );
  };

  const markRated = (applicationId) => {
    setRatedApplicationIds((prev) => new Set(prev).add(applicationId));
    setRatingApplicationId(null);
  };

  /**
   * GET /applications/mine populates `jobId` one level only, so the job's
   * `employerId` arrives as an EmployerProfile id - not the employer's User
   * id, which is what POST /ratings needs. GET /jobs/:jobId is public and
   * populates `employerId`, so the id is resolved from there on demand
   * rather than on every row (and with no backend change).
   */
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
        setRatingError({ message: "This employer's profile could not be loaded, so rating is unavailable." });
        return;
      }
      // Cached on the row so reopening the form does not refetch the job.
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
      // 409 means this employer was already rated for this job, possibly in
      // an earlier session - the same outcome as a successful rating, not an
      // error worth surfacing.
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
    // Ratings require Job.status === "completed" server-side, and
    // PATCH /applications/:id/complete deliberately does NOT close the job -
    // only the employer's "Close Job" does. So an application can be
    // completed while the job is not yet rateable, and saying so is far
    // clearer than letting the submit fail with a 400.
    if (application.status !== "completed") return null;
    if (ratedApplicationIds.has(application._id)) {
      return <span className="application-rated-note">You've rated this employer.</span>;
    }
    if (application.jobId?.status !== "completed") {
      return (
        <span className="application-rate-hint">
          <Lock size={13} aria-hidden="true" /> Rating opens once the employer closes this job
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
        {resolvingEmployerId === application._id ? "Loading..." : "Rate Employer"}
      </button>
    );
  };

  return (
    <div className="container applications-page">
      <h1>My Applications</h1>

      {withdrawError && <ErrorBanner error={withdrawError} />}
      {ratingError && <ErrorBanner error={ratingError} />}
      {loading && <Spinner label="Loading your applications..." />}
      {!loading && error && <ErrorBanner error={error} onRetry={refetch} />}

      {!loading && !error && applications?.length === 0 && (
        <EmptyState icon={FileText} title="No applications yet" description="Jobs you apply for will show up here." />
      )}

      {!loading && !error && applications?.length > 0 && (
        <div className="applications-list">
          {applications.map((application) => {
            const job = application.jobId;
            const title = job?.titleText || pickLocalizedText(job?.title, language, job?.originalLanguage);
            const canWithdraw = ["applied", "shortlisted"].includes(application.status);
            const isWithdrawing = withdrawingId === application._id;
            return (
              <Card key={application._id} className="application-card">
                <div className="application-card-main">
                  <h3>{title || "Job"}</h3>
                  <p>
                    ₹{job?.payAmount} / {job?.payType}
                    {job?.city ? ` · ${job.city}` : ""}
                  </p>
                  <p className="application-card-date">
                    Applied {new Date(application.appliedAt || application.createdAt).toLocaleDateString()}
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
                      {isWithdrawing ? "Withdrawing..." : "Withdraw"}
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
