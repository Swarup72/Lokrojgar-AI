import { Navigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { FullPageSpinner } from "../components/common/Spinner";
import { EmptyState } from "../components/common/EmptyState";
import { ShieldAlert } from "lucide-react";

/**
 * @param {{allowedRoles?: string[], children: React.ReactNode}} props
 */
export function ProtectedRoute({ allowedRoles, children }) {
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
          title="You don't have access to this page"
          description="This page isn't available for your current account role."
          action={<Link to="/">Go back home</Link>}
        />
      </div>
    );
  }

  return children;
}
