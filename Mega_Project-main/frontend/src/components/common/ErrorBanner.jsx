import { AlertCircle } from "lucide-react";
import { mapErrorToFriendlyMessage } from "../../utils/errorMessages";
import "./ErrorBanner.css";

/**
 * Renders a normalized error ({status, message, isNetworkError} from
 * api/client.js) as safe, friendly copy - never the raw backend message for
 * a recognized status code.
 * @param {{error: {status:number|null, isNetworkError:boolean}, context?: "voice"|"default", onRetry?: () => void}} props
 */
export function ErrorBanner({ error, context = "default", onRetry }) {
  if (!error) return null;

  return (
    <div className="error-banner" role="alert">
      <AlertCircle size={18} aria-hidden="true" />
      <span>{mapErrorToFriendlyMessage(error, context)}</span>
      {onRetry && (
        <button type="button" className="error-banner-retry" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
