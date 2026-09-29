import { ChevronLeft, ChevronRight } from "lucide-react";
import "./Pagination.css";

/** @param {{page:number, totalPages:number, hasPrevPage:boolean, hasNextPage:boolean, onPageChange:(p:number)=>void}} props */
export function Pagination({ page, totalPages, hasPrevPage, hasNextPage, onPageChange }) {
  if (totalPages <= 1) return null;

  return (
    <div className="pagination">
      <button type="button" disabled={!hasPrevPage} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
        <ChevronLeft size={18} aria-hidden="true" />
      </button>
      <span>
        Page {page} of {totalPages}
      </span>
      <button type="button" disabled={!hasNextPage} onClick={() => onPageChange(page + 1)} aria-label="Next page">
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
