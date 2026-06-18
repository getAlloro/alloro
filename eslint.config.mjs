import tseslint from "typescript-eslint";
import globals from "globals";

// ─────────────────────────────────────────────────────────────
// Backend ESLint — code-constitution enforcement (Part II, src/).
//
// Deliberately NOT a generic `recommended` dump. Only rules that map to a
// specific Constitution Article are enabled, and each cites its §N.M so the
// lint output speaks the same language as scripts/check-conventions.sh and
// the review agent (see ~/.claude/skills/code-constitution/SKILL.md §18).
//
// Severity is `warn` across the board: this is a baseline/ratchet rollout on a
// previously-unlinted backend — it surfaces debt without failing the build.
// Promote rules to `error` per-Article once that Article's debt is cleared.
// ─────────────────────────────────────────────────────────────
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "src/database/migrations/**", // append-only history (§10.3)
      "src/database/seeds/**",
      "src/__tests__/**",
      "frontend/**", // governed by frontend/eslint.config.js
    ],
  },
  {
    files: ["src/**/*.ts"],
    // base = parser + @typescript-eslint plugin registered, NO rules turned on.
    extends: [tseslint.configs.base],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // §2.2 — functions under ~50 lines (80 cap for the baseline; tighten later)
      "max-lines-per-function": [
        "warn",
        { max: 80, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
      // §2.3 — nesting under 4 levels
      "max-depth": ["warn", 4],
      // §9.1 — no console.* in production code (use Pino)
      "no-console": "warn",
      // §17.2 / §4.x — no `any` escape hatch
      "@typescript-eslint/no-explicit-any": "warn",
      // §1.4 — types/interfaces/classes are PascalCase
      "@typescript-eslint/naming-convention": [
        "warn",
        { selector: "typeLike", format: ["PascalCase"] },
      ],
      // §4.2 — no magic numbers. OFF for the baseline (too noisy); opt-in once
      // the high-signal rules above are cleared:
      // "no-magic-numbers": ["warn", { ignore: [-1, 0, 1, 2], ignoreArrayIndexes: true }],
    },
  }
);
