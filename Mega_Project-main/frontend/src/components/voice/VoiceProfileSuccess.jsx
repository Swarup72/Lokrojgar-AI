import { Link } from "react-router-dom";
import { CheckCircle, CircleCheck, CircleHelp } from "lucide-react";
import "./VoiceProfileSuccess.css";

/**
 * @param {{workerProfile: object, skillResolution?: {skills: {resolved: {rawText:string, id:string, canonicalName:string}[], unresolved: string[]}, preferredJobCategories: {resolved: {rawText:string, id:string, canonicalName:string}[], unresolved: string[]}}}} props
 */
export function VoiceProfileSuccess({ workerProfile, skillResolution }) {
  const resolvedSkills = skillResolution?.skills?.resolved || [];
  const unresolvedSkills = skillResolution?.skills?.unresolved || [];
  const hasSkillInfo = resolvedSkills.length > 0 || unresolvedSkills.length > 0;

  return (
    <div className="voice-success">
      <CheckCircle size={48} className="voice-success-icon" aria-hidden="true" />
      <h2>Profile Updated Successfully</h2>
      <p>Your profile has been created from your voice.</p>

      {workerProfile?.fullName && <p className="voice-success-summary">Name: {workerProfile.fullName}</p>}

      {hasSkillInfo && (
        <div className="voice-success-skills">
          {resolvedSkills.length > 0 && (
            <p>
              <CircleCheck size={15} aria-hidden="true" /> Skills added to your profile:{" "}
              {resolvedSkills.map((s) => s.canonicalName).join(", ")}
            </p>
          )}
          {unresolvedSkills.length > 0 && (
            <p className="voice-success-skills-unresolved">
              <CircleHelp size={15} aria-hidden="true" /> Not recognized yet (not added to your profile):{" "}
              {unresolvedSkills.join(", ")} - you can add these manually from your Skills section.
            </p>
          )}
        </div>
      )}

      <div className="voice-success-actions">
        <Link to="/profile" className="btn btn-primary">
          View Profile
        </Link>
        <Link to="/worker-dashboard" className="btn btn-secondary">
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
