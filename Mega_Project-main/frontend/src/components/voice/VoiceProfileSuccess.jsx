import { Link } from "react-router-dom";
import { CheckCircle, CircleCheck, CircleHelp } from "lucide-react";
import { useLanguage } from "../../hooks/useLanguage";
import "./VoiceProfileSuccess.css";

/**
 * @param {{workerProfile?: object, employerProfile?: object, skillResolution?: object, role?: "worker"|"employer"}} props
 */
export function VoiceProfileSuccess({ workerProfile, employerProfile, skillResolution, role = "worker" }) {
  const { t } = useLanguage();
  const isEmployer = role === "employer" || !!employerProfile;

  if (isEmployer) {
    const profile = employerProfile || {};
    return (
      <div className="voice-success">
        <CheckCircle size={48} className="voice-success-icon" aria-hidden="true" />
        <h2>{t("voice.success.employerTitle")}</h2>
        <p>{t("voice.success.employerSubtitle")}</p>

        <div className="voice-success-details">
          {profile.businessName && (
            <p className="voice-success-summary">
              {t("voice.success.businessName", { businessName: profile.businessName })}
            </p>
          )}
          {profile.businessType && (
            <p className="voice-success-detail">
              {t("voice.success.businessType", { businessType: profile.businessType })}
            </p>
          )}
          {profile.city && (
            <p className="voice-success-detail">
              {t("voice.success.city", { city: profile.city })}
            </p>
          )}
        </div>

        <div className="voice-success-actions">
          <Link to="/profile" className="btn btn-primary">
            {t("worker.dashboard.viewProfileAction")}
          </Link>
          <Link to="/employer-dashboard" className="btn btn-secondary">
            {t("voice.success.goToEmployerDashboard")}
          </Link>
        </div>
      </div>
    );
  }

  const resolvedSkills = skillResolution?.skills?.resolved || [];
  const unresolvedSkills = skillResolution?.skills?.unresolved || [];
  const hasSkillInfo = resolvedSkills.length > 0 || unresolvedSkills.length > 0;

  return (
    <div className="voice-success">
      <CheckCircle size={48} className="voice-success-icon" aria-hidden="true" />
      <h2>{t("voice.success.title")}</h2>
      <p>{t("voice.success.subtitle")}</p>

      {workerProfile?.fullName && <p className="voice-success-summary">{t("voice.success.name", { name: workerProfile.fullName })}</p>}

      {hasSkillInfo && (
        <div className="voice-success-skills">
          {resolvedSkills.length > 0 && (
            <p>
              <CircleCheck size={15} aria-hidden="true" />{" "}
              {t("voice.success.skillsAdded", { skills: resolvedSkills.map((s) => s.canonicalName).join(", ") })}
            </p>
          )}
          {unresolvedSkills.length > 0 && (
            <p className="voice-success-skills-unresolved">
              <CircleHelp size={15} aria-hidden="true" />{" "}
              {t("voice.success.skillsUnresolved", { skills: unresolvedSkills.join(", ") })}
            </p>
          )}
        </div>
      )}

      <div className="voice-success-actions">
        <Link to="/profile" className="btn btn-primary">
          {t("worker.dashboard.viewProfileAction")}
        </Link>
        <Link to="/worker-dashboard" className="btn btn-secondary">
          {t("voice.success.goToDashboard")}
        </Link>
      </div>
    </div>
  );
}
