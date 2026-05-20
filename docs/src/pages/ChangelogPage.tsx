import { motion } from "framer-motion";
import { NavLink } from "react-router-dom";
import { CHANGELOG_ENTRIES } from "../data/changelog";
import { getPageBySlug } from "../data/pages";

export function ChangelogPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-8"
    >
      <div>
        <h1 className="font-display text-4xl text-alloro-navy mb-3">Changelog</h1>
        <p className="text-base text-alloro-slate max-w-[600px] leading-relaxed">
          All notable changes to Alloro, starting from the current documentation baseline.
        </p>
      </div>

      <div className="space-y-6">
        {CHANGELOG_ENTRIES.map((entry) => (
          <div
            key={entry.version}
            className="bg-white rounded-2xl border border-alloro-border p-6 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <h3 className="text-lg font-semibold text-alloro-navy">{entry.title}</h3>
                <p className="text-sm text-alloro-slate mt-1 leading-relaxed">{entry.summary}</p>
              </div>
              <div className="shrink-0 text-right">
                <span className="px-2.5 py-1 bg-alloro-orange-light text-alloro-orange text-xs font-bold rounded-full">
                  v{entry.version}
                </span>
                <p className="text-[11px] text-alloro-slate mt-1">{entry.date}</p>
              </div>
            </div>

            {entry.pagesAffected.length > 0 && (
              <div className="flex items-center gap-2 pt-3 border-t border-alloro-border">
                <span className="text-[10px] font-bold uppercase tracking-wider text-alloro-slate">
                  Pages affected:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {entry.pagesAffected.map((slug) => {
                    const page = getPageBySlug(slug);
                    return page ? (
                      <NavLink
                        key={slug}
                        to={`/docs/${slug}`}
                        className="px-2 py-0.5 bg-alloro-cream text-alloro-navy text-[11px] font-medium rounded hover:bg-alloro-orange-light hover:text-alloro-orange transition-colors"
                      >
                        {page.shortTitle}
                      </NavLink>
                    ) : null;
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}
