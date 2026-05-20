import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { CATEGORIES, getPagesByCategory } from "../data/pages";

export function HomePage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-12"
    >
      {/* Hero */}
      <div className="max-w-[640px]">
        <h1 className="font-display text-5xl text-alloro-navy mb-4">
          Welcome to Alloro
        </h1>
        <p className="text-lg text-alloro-slate leading-relaxed">
          Everything you need to know about your practice dashboard — from signing in to
          tracking your local rankings and managing your team.
        </p>
      </div>

      {/* Category cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {CATEGORIES.map(({ key, label }) => {
          const pages = getPagesByCategory(key);
          return (
            <div
              key={key}
              className="bg-white rounded-2xl border border-alloro-border p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <h3 className="text-sm font-bold text-alloro-navy mb-3">{label}</h3>
              <ul className="space-y-2">
                {pages.map((page) => (
                  <li key={page.slug}>
                    <NavLink
                      to={`/docs/${page.slug}`}
                      className="flex items-center justify-between group text-sm text-alloro-slate hover:text-alloro-orange transition-colors"
                    >
                      <span>{page.title}</span>
                      <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Version note */}
      <div className="bg-alloro-orange-light rounded-xl p-5 border border-alloro-orange/20">
        <p className="text-sm text-alloro-navy">
          <span className="font-bold">Current version:</span> 0.0.82 — May 2026.{" "}
          <NavLink to="/changelog" className="text-alloro-orange font-semibold hover:underline">
            View changelog →
          </NavLink>
        </p>
      </div>
    </motion.div>
  );
}
