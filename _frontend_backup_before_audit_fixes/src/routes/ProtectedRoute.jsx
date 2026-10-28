import { Navigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { FullPageSpinner } from "../components/common/Spinner";
import { EmptyState } from "../components/common/EmptyState";
import { ShieldAlert } from "lucide-react";
import { useLanguage } from "../hooks/useLanguage";

/**
 * @param {{allowedRoles?: string[], children: React.ReactNode}} props
 */
export function ProtectedRoute({ allowedRoles, children }) {
  const { t } = useLanguage();
  const { user, isBootstrapped } = useAuth();
  const location = useLocation();

  if (!isBootstrapped) {
    return <FullPageSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowedRoles && !allowedRoles.some((role) => user.roles?.includes(role))) {
    return (
      <div className="container" style={{ padding: "60px 0" }}>
        <EmptyState
          icon={ShieldAlert}
          title={t("forbidden.title")}
          description={t("forbidden.description")}
          action={<Link to="/">{t("common.goHome")}</Link>}
        />
      </div>
    );
  }

  return children;
}
