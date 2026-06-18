// dependency-cruiser — code-constitution layering enforcement (Part II, src/).
//
// Encodes the Data-Flow Articles as hard import-boundary rules — structurally,
// not by grep. Every rule cites its §N.M (see ~/.claude/skills/code-constitution
// /SKILL.md §7). Severity is "warn" (advisory): dependency-cruiser only exits
// non-zero on "error", so this surfaces violations without failing CI during the
// baseline rollout. Promote a rule to "error" once that Article's debt is cleared.
//
// NOTE: §7.4 currently surfaces ~18 modules that import the connection outside
// models/ — most are the accepted `db.transaction(...)` openers in
// gbp/agents/practice-ranking services. Review before promoting to "error".

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "db-only-in-models", // §7.4
      comment:
        "All DB access goes through models/ (code-constitution §7.4). Only models/ and database/ may import the knex connection.",
      severity: "warn",
      from: { pathNot: "^src/(models|database)/" },
      to: { path: "^src/database/connection" },
    },
    {
      name: "controllers-no-db", // §7.3
      comment:
        "Controllers orchestrate and shape responses; they never touch the DB directly (code-constitution §7.3).",
      severity: "warn",
      from: { path: "^src/controllers/" },
      to: { path: "^src/database/connection" },
    },
    {
      name: "models-no-upward-imports", // §7.1
      comment:
        "Layering is one-directional Routes→Controllers→Services→Models (code-constitution §7.1). Models must not import controllers/services/routes.",
      severity: "warn",
      from: { path: "^src/models/" },
      to: { path: "^src/(controllers|services|routes)/" },
    },
    {
      name: "routes-are-thin", // §7.2
      comment:
        "Routes are thin: they apply middleware and call controllers, not models directly (code-constitution §7.2).",
      severity: "warn",
      from: { path: "^src/routes/" },
      to: { path: "^src/models/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    exclude: {
      path: "^src/(database/(migrations|seeds)/|__tests__/)|\\.test\\.ts$",
    },
  },
};
