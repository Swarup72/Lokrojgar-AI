import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLanguage } from "../../hooks/useLanguage";
import "./Pagination.css";

/** @param {{page:number, totalPages:number, hasPrevPage:boolean, hasNextPage:boolean, onPageChange:(p:number)=>void}} props */
export function Pagination({ page, totalPages, hasPrevPage, hasNextPage, onPageChange }) {
  const { t } = useLanguage();
  if (totalPages <= 1) return null;

  return (
    <div className="pagination">
      <button type="button" disabled={!hasPrevPage} onClick={() => onPageChange(page - 1)} aria-label={t("pagination.previous")}>
        <ChevronLeft size={18} aria-hidden="true" />
      </button>
      <span>{t("pagination.pageOf", { page, total: totalPages })}</span>
      <button type="button" disabled={!hasNextPage} onClick={() => onPageChange(page + 1)} aria-label={t("pagination.next")}>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
