import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { EmptyState } from "../components/common/EmptyState";

export function NotFoundPage() {
  return (
    <div className="container" style={{ padding: "80px 0" }}>
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="The page you're looking for doesn't exist."
        action={<Link to="/">Go back home</Link>}
      />
    </div>
  );
}
