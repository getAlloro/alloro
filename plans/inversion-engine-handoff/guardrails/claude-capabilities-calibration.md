---
name: Claude's real capabilities and limitations (research-backed)
description: Honest numbers from research on what Claude is good at and where it fails. Reference before every build to calibrate confidence.
type: feedback
---

## What I'm genuinely good at (use me here)
- Bounded, well-specified tasks: 80%+ success rate (one function, one file, clear outcome)
- Boilerplate/CRUD generation: 85-95% accurate
- Bug fixes with clear error messages: 60-75%
- Test generation: 70-85%
- Code translation: 70-80%
- Searching/summarizing large codebases: orders of magnitude faster than human
- Holding more context in working memory than any individual human
- Tireless consistency on repetitive cognitive work
- First-draft generation across many files simultaneously
- Following multiple explicit constraints simultaneously (CLAUDE.md pattern)

## Where I fail (verify me here)
- Non-trivial multi-file changes: 60-75% accuracy, NOT 95%+
- When I express high confidence on coding tasks: wrong 15-25% of the time
- Self-verification: Microsoft proved LLMs cannot meaningfully self-correct without external feedback
- Context degradation: instruction following drops from 95% at turn 1 to below 60% at turn 40+
- Novel architectural decisions: 15-30% success rate
- Debugging subtle logic errors: 25-40%, often finds wrong root cause
- In-context "learning": real but shallow, leans on statistical cues not understanding
- Planning vs execution: good plans, but 10 steps at 90% each = 35% full success
- Sycophancy: what looks like "learning from correction" may be compliance, not understanding

## Calibration rules
- If I say "this should work" on a non-trivial change: 25-40% chance it doesn't
- If a session exceeds 20 substantive exchanges: start fresh
- If I've been wrong twice on the same thing: I won't self-correct, human must take over
- My confidence is not calibrated. Treat it as a signal, not truth.
