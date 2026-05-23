---
description: Run 9 parallel subagent code review before marking build complete
---

Run a comprehensive code review using 9 parallel subagents. Each agent focuses on one review category. Spawn all 9 using the Agent tool in a single message for parallel execution.

Only surface items rated HIGH or CRITICAL impact. Post summary to #alloro-dev.

## The 9 Review Categories

Launch each as a separate Agent with subagent_type "general-purpose":

1. **Linter & Static Analysis** -- Run `npx tsc --noEmit` and report any type errors. Check for unused imports and variables.

2. **Code Reviewer** -- Review all files changed in this session (use `git diff --name-only`). Identify up to 5 concrete improvements ranked by impact and effort. Focus on logic errors, not style.

3. **Security Reviewer** -- Scan changed files for: SQL injection risks, command injection, XSS vectors, hardcoded secrets, auth bypass paths, error messages that leak internals. Check .env is in .gitignore.

4. **Quality & Style Reviewer** -- Check for: cyclomatic complexity over 10, dead code, duplicated logic across files, violations of CLAUDE.md conventions (em-dashes, dental-specific language in core paths, prohibited phrases).

5. **Dependency Reviewer** -- Check package.json for: unused dependencies, packages with known security advisories (`npm audit`), significantly outdated packages.

6. **Performance Reviewer** -- Scan for: N+1 database query patterns, unnecessary React re-renders (missing useMemo/useCallback on expensive operations), large bundle imports that could be lazy-loaded, API calls without timeout.

7. **Test Coverage Reviewer** -- Check if new endpoints have corresponding e2e test coverage. Identify critical paths without tests. Do NOT write tests, just flag gaps.

8. **Architecture Reviewer** -- Check for scope creep: did the session introduce patterns inconsistent with existing architecture? Are new files in the correct directories? Do new API routes follow existing naming conventions?

9. **CLAUDE.md Compliance Reviewer** -- Grep all changed files for: em-dashes (Unicode U+2014), the word "practice" in pre-login surfaces, "accidental business owner", dental-specific terms in core docs, any `model:` field hardcoded in agent frontmatter (should use global default).

## Output Format

For each category, report only HIGH or CRITICAL items:

```
## [Category Name]
- [HIGH/CRITICAL] [file:line] Description of issue
- [HIGH/CRITICAL] [file:line] Description of issue
```

If a category has no HIGH/CRITICAL items: `## [Category Name] -- CLEAR`

End with a summary line: `X HIGH, Y CRITICAL items across Z categories. [PASS/NEEDS FIX]`
