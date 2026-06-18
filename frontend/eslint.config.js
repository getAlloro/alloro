import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // code-constitution (Part III) — article-mapped, warn-only baseline.
      // Each rule cites its §N.M (see ~/.claude/skills/code-constitution/SKILL.md).
      'no-console': 'warn', // §17.1 — no console.* in shipped code
      '@typescript-eslint/no-explicit-any': 'warn', // §17.2 — no any
      'max-depth': ['warn', 4], // §2.3 — nesting under 4 levels
      'max-lines-per-function': [
        'warn',
        { max: 120, skipBlankLines: true, skipComments: true, IIFEs: true },
      ], // §13.2 — lean components (JSX-generous cap)
    },
  },
])
