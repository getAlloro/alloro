import { BookOpen, Plus } from "lucide-react";

/**
 * Library — P1 placeholder (plans/07042026-alloro-os-admin-port).
 * The real document list (rows, folders, drag-and-drop, ⌘K search) lands in
 * P3; this ships a designed, honest empty state so the OS tab renders today.
 */
export default function OsLibrary() {
  return (
    <section className="pt-14">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white">
          <BookOpen className="h-5 w-5 text-gray-400" strokeWidth={1.5} />
        </div>
        <h2 className="mt-5 font-display text-xl text-alloro-textDark">
          The library is empty
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">
          Internal docs, playbooks, and SOPs will live here once the Library
          build ships.
        </p>
        <button
          type="button"
          disabled
          title="Document creation arrives with the Library build (Phase 3)"
          className="mt-6 inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-alloro-orange px-4 py-2 text-sm font-semibold text-white opacity-50"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          New document
        </button>
        <p className="mt-10 w-full border-t border-gray-200 pt-4 font-mono text-[11px] uppercase tracking-[0.12em] text-gray-400">
          0 documents · indexing idle
        </p>
      </div>
    </section>
  );
}
