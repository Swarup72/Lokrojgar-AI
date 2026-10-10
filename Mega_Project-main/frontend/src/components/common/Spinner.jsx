import { LoaderCircle } from "lucide-react";
import { useLanguage } from "../../hooks/useLanguage";
import "./Spinner.css";

export function Spinner({ size = 24, label }) {
  const { t } = useLanguage();
  return (
    <div className="spinner" role="status" aria-live="polite">
      <LoaderCircle size={size} className="spinner-icon" aria-hidden="true" />
      {label ? <span>{label}</span> : <span className="visually-hidden">{t("common.loading")}</span>}
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
