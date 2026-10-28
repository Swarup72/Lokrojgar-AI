import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { EmptyState } from "../components/common/EmptyState";
import { useLanguage } from "../hooks/useLanguage";

export function NotFoundPage() {
  const { t } = useLanguage();
  return (
    <div className="container" style={{ padding: "80px 0" }}>
      <EmptyState
        icon={Compass}
        title={t("notFound.title")}
        description={t("notFound.description")}
        action={<Link to="/">{t("common.goHome")}</Link>}
      />
    </div>
  );
}
