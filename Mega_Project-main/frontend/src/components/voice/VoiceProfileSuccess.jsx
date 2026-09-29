import { Link } from "react-router-dom";
import { CheckCircle } from "lucide-react";
import "./VoiceProfileSuccess.css";

/** @param {{workerProfile: object}} props */
export function VoiceProfileSuccess({ workerProfile }) {
  return (
    <div className="voice-success">
      <CheckCircle size={48} className="voice-success-icon" aria-hidden="true" />
      <h2>Profile Updated Successfully</h2>
      <p>Your profile has been created from your voice.</p>

      {workerProfile?.fullName && <p className="voice-success-summary">Name: {workerProfile.fullName}</p>}

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
