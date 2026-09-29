import { LoaderCircle } from "lucide-react";
import "./Spinner.css";

export function Spinner({ size = 24, label }) {
  return (
    <div className="spinner" role="status" aria-live="polite">
      <LoaderCircle size={size} className="spinner-icon" aria-hidden="true" />
      {label ? <span>{label}</span> : <span className="visually-hidden">Loading</span>}
    </div>
  );
}

export function FullPageSpinner({ label }) {
  return (
    <div className="full-page-spinner">
      <Spinner size={32} label={label} />
    </div>
  );
}
