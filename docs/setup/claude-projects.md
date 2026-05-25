# Claude.ai Projects — Alloro Lattice Setup

Manual setup for the **human** load surface (Wave 2, Surface 4). Each operator (Corey, Jo, Dave) creates an Alloro Project in Claude.ai and attaches the four lattice files so every chat in that project starts with the substrate loaded.

The four other load surfaces are wired in code (CLAUDE.md @import, sub-agent inline injection via `scripts/inject-lattice.ts`, product AI services via `src/services/prompt/alloroSubstrate.ts`, knowledgeBridge.ts via lattice parse). This surface is the one we cannot automate — Claude.ai Projects are per-user.

## What you're attaching

All four live in the repo at `.claude/lattices/`. Pull the latest from `sandbox` before attaching.

- `product-outline.md` — May 18 canon: what Alloro is, Connect/Reflect, three Beliefs, ICP, pricing, vocabulary
- `journey-lattice.md` — five-stage customer journey, Be Findable / Choosable / Bookable / Memorable
- `sentiment-lattice.md` — voice and posture; Watchline, Narrator Principle, Score Rings Removed, No Tasks
- `knowledge-lattice.md` — operating heuristics from leaders, companies, failures

## Setup — per operator

### Corey

1. Open Claude.ai → **Projects** → **+ Create**
2. Name: `Alloro HQ`
3. Description: `Founder lane. Visionary work, strategy, Decision Log gates, lattice canon. Loads the lattice substrate on every chat.`
4. **Project knowledge** → **Add knowledge** → upload all four files from `.claude/lattices/`
5. **Custom instructions** (paste):
   ```
   You are operating inside Corey's Alloro Project. The four attached lattice files are canonical — read them before any answer that touches product, voice, or strategy.
   Two beliefs are confirmed (Belief 1 sourced, Belief 2 confirmed). Belief 3 is the unproven bet — never treat it as settled.
   Vocabulary: Alloro Connect (Presence Layer), Alloro Reflect (Intelligence Layer), local service business owner, NS1 / NS2. Never say PatientPath; the rename is canonical.
   ```
6. Verify by asking: **"What does Alloro Connect do?"** Correct answer references the Presence Layer, the Website Engine, AEO, and making the practice findable. If the answer says PatientPath or describes a different surface, the attachment is stale — re-upload.

### Jo

1. Same Project setup. Name: `Alloro Integration`
2. Description: `COO/Integrator lane. Roadmap, team coordination, departmental agent oversight.`
3. Custom instructions (paste):
   ```
   You are operating inside Jo's Alloro Project. The four attached lattice files are canonical. Jo owns roadmap and integration; Corey owns vision; Dave owns build. The Roadmap layer in the Product Outline ("what it must deliver next" in Connect and Reflect) is your starting point.
   Vocabulary: Alloro Connect, Alloro Reflect, local service business owner, NS1 / NS2. Never say PatientPath.
   ```
4. Same verification question.

### Dave

1. Same Project setup. Name: `Alloro Engineering`
2. Description: `CTO lane. Build sequencing, architectural review, sandbox-to-main merge owner. Loads the lattice substrate before any architectural decision.`
3. Custom instructions (paste):
   ```
   You are operating inside Dave's Alloro Project. The four attached lattice files are canonical. Dave receives finished specs only — if a request feels like a rough idea, push it back to Corey or Jo.
   Pricing canon: $2,000 per location flat (P-004). The $10K–$20K retail value figure in the Product Outline is anchored on the full stack — verify which components are live before quoting.
   Vocabulary: Alloro Connect (Presence Layer), Alloro Reflect (Intelligence Layer), local service business owner. Never say PatientPath.
   ```
4. Same verification question.

## Re-upload cadence

The lattice files change. Whenever a Wave-1 lattice update lands on `sandbox`, each operator should re-upload to keep their Project current. Run this in the repo to confirm what's local:

```bash
ls -la .claude/lattices/
sha256sum .claude/lattices/*.md
```

Compare against the four most-recent uploads in your Project. If hashes drift, re-upload.

## Verification (per operator, at setup)

Each of the three Wave-1 verification questions plus the Wave-2 question should answer correctly from the attached files alone:

1. **What does the Watchline sentence say and why is it the first thing a client sees?** Expected: "Nothing moved against you this week. Alloro checked." Feel-first entry point; feel before inform.
2. **What does the Narrator Principle require for every product surface?** Expected: every surface tells the owner what was happening, what Alloro did, and what changed.
3. **Why are score rings permanently removed?** Expected: they reduced a complex practice to a single digit; the narrator approach replaces them by telling the owner qualitatively, anchored to a dollar consequence.
4. **What does Alloro Connect do?** Expected: references the Presence Layer, the Website Engine, AEO, and making the practice findable, credible, and chosen.

If any answer requires the LLM to ask for context that's already in the attachments, the Project is misconfigured.
