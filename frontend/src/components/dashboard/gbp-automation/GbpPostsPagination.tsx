export type GbpPostsPaginationProps = {
  page: number;
  total: number;
  totalPages: number;
  isDisabled: boolean;
  onPageChange: (page: number) => void;
};

export function GbpPostsPagination({
  page,
  total,
  totalPages,
  isDisabled,
  onPageChange,
}: GbpPostsPaginationProps) {
  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
      <span>
        Showing {total.toLocaleString()} synced posts · Page {page} of {totalPages}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={isDisabled || page <= 1}
          onClick={() => onPageChange(Math.max(page - 1, 1))}
          className="rounded-[8px] border border-slate-200 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Prev
        </button>
        <button
          type="button"
          disabled={isDisabled || page >= totalPages}
          onClick={() => onPageChange(Math.min(page + 1, totalPages))}
          className="rounded-[8px] border border-slate-200 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
