import { Link } from "react-router-dom";
import { ArrowLeft, Trash2 } from "lucide-react";

/**
 * Trash — P1 placeholder (plans/07042026-alloro-os-admin-port).
 * Archived-document listing with restore/purge lands in P3; this ships a
 * designed, honest empty state so the quiet Trash link renders today.
 */
export default function OsTrash() {
  return (
    <section className="pt-14">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white">
          <Trash2 className="h-5 w-5 text-gray-400" strokeWidth={1.5} />
        </div>
        <h2 className="mt-5 font-display text-xl text-alloro-textDark">
          Nothing in the trash
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          Archived documents will wait here before permanent deletion.
        </p>
        <Link
          to="/admin/os"
          className="mt-6 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} />
          Back to Library
        </Link>
        <p className="mt-10 w-full border-t border-gray-200 pt-4 font-mono text-[11px] uppercase tracking-[0.12em] text-gray-400">
          0 items · purge idle
        </p>
      </div>
    </section>
  );
}
