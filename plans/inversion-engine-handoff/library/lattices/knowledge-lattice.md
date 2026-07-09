---
id: knowledge-lattice
topic: lattice
status: provisional   # downgraded 6/13 — KNOWN DRIFT: dup vintages; stale "$14K MRR" (real $5K/3); orphaned Checkup (live=/api/audit); ad-era positioning contradicting current canon. Notion=source of truth; reconcile via ACTIONS.md AC9. Don't trust specifics until validated.
confidence: high
source: MIRROR of Notion canon page 282fdaf1-20c4-802e-b707-cdd6faf89cc1; Notion is source of truth
date: 2026-06-13
last_reviewed: 2026-06-13
---

# 📖 Alloro Knowledge Lattice

MIRROR of the Notion database. Each entry below is one row; properties reproduced verbatim. Notion is source of truth.

74 entries captured.

---

## AI Innovator

## Aidan Gomez (Cohere)
- **Category:** AI Innovator
- **Core Principle:** Embeddings are the backbone of enterprise AI.
- **Agent Heuristic:** Optimize embeddings before chasing bigger models.
- **Why Alloro Cares:** RAG precision defines trust.
- **Anti-Pattern:** Retrieval drift.
- **Success Signals:** Leading: Faithfulness scores <br>• Lagging: Error rates
- **Constants:** Proof, Clarity
- **Related Anchors:** Arthur Mensch (Mistral), Clément Delangue (Hugging Face)

Body: Gomez (co-author of "Attention Is All You Need") built Cohere to optimize embeddings. For Alloro, embedding quality ensures AI outputs remain trusted proof, not fluff.

## Anthropic (Dario Amodei)
- **Category:** AI Innovator
- **Core Principle:** Safety and clarity must be trained, not bolted on.
- **Agent Heuristic:** If a response risks overreach (medical advice, PHI), refuse gracefully and cite approved proof.
- **Why Alloro Cares:** Trust in healthcare depends on refusal-precision + transparency.
- **Anti-Pattern:** Overconfident but wrong completions.
- **Success Signals:** Leading: Refusal-precision in evals <br>• Lagging: Zero safety incidents
- **Constants:** Proof, Clarity
- **Related Anchors:** Atul Gawande (Checklist Manifesto), Demis Hassabis (DeepMind), Overjet

Body: Anthropic emphasizes constitutional guardrails. Alloro should adopt the same posture: better to say "we don't answer that" than risk credibility.

## Anthropic Enterprise Customers / CLAUDE.md Plus Projects Pattern
- **Category:** AI Innovator
- **Core Principle:** Production-grade Claude deployments at TELUS (57,000 employees via Fuel iX), Newfront (HR bot reclaiming 1 month per year, 60% doc cost reduction), Honeycomb (CLAUDE.md (http://CLAUDE.md) covering build, test, architecture, PR conventions, standing rules), Zoom (federated model selection, settings.local.json pre-authorizing commands), Crowdin (Claude-based agent for localization, rebuilt MCP v2 around Claude), Bridgewater (Bedrock plus multi-agent orchestration). All converge on the same pattern: CLAUDE.md (http://CLAUDE.md) for autonomous coding, Projects for human chat, inline injection for sub-agents.
- **Agent Heuristic:** For each load surface, follow the proven pattern: CLAUDE.md (http://CLAUDE.md) for autonomous coding sessions (Honeycomb model), Claude.ai (http://Claude.ai) Projects for human chat sessions (Newfront model), inline injection for sub-agents (Anthropic Skills model). Do not invent custom load mechanisms when proven ones exist. Use federated model selection (Sonnet, Opus, Haiku per task) rather than picking one default.
- **Why Alloro Cares:** Confirms the Phase 4 plan is industry-standard rather than novel. Alloro can ship the same architecture every major Claude enterprise customer ships. Reduces architectural risk to near zero. The pattern is unanimous across six published case studies.
- **Anti-Pattern:** Building custom RAG or vector store infrastructure when CLAUDE.md (http://CLAUDE.md) plus Projects plus inline injection already covers every load surface. Reinventing the substrate when six published case studies use the same pattern successfully. Picking one default model rather than routing per task.
- **Success Signals:** Lead: number of load surfaces using one of the three proven patterns (CLAUDE.md (http://CLAUDE.md), Projects, inline injection). Lag: tokens spent on context provision per session, trending toward zero as substrate replaces manual paste.
- **Constants:** Autopilot, Proof

## Arthur Mensch (Mistral)
- **Category:** AI Innovator
- **Core Principle:** Smaller, faster, cheaper models democratize AI.
- **Agent Heuristic:** Use lightweight AI unless complexity adds clear value.
- **Why Alloro Cares:** Lean infra = better margins.
- **Anti-Pattern:** Over-engineering.
- **Success Signals:** Leading: Latency benchmarks <br>• Lagging: Infra cost per user
- **Constants:** Clarity, Autopilot
- **Related Anchors:** Aidan Gomez (Cohere), Jensen Huang (NVIDIA)

Body: Mensch is building Mistral to democratize AI with small but powerful models. Alloro should use the lightest possible AI that delivers proof, maximizing scalability.

## Clément Delangue (Hugging Face)
- **Category:** AI Innovator
- **Core Principle:** Community + reproducibility = credibility.
- **Agent Heuristic:** Share methods, not just results.
- **Why Alloro Cares:** Healthcare needs open trust signals
- **Anti-Pattern:** Closed claims.
- **Success Signals:** Leading: Community adoption <br>• Lagging: Ecosystem integrations
- **Constants:** Proof, Hospitality
- **Related Anchors:** Yann LeCun (Meta FAIR), Aidan Gomez (Cohere)

Body: Delangue grew Hugging Face into AI's GitHub. For Alloro, openness signals credibility. Share processes clearly to doctors, regulators, and the public.

## Demis Hassabis (DeepMind)
- **Category:** AI Innovator
- **Core Principle:** AI should solve science and reasoning, not just text.
- **Agent Heuristic:** Focus AI on reasoning tasks, not gimmicks.
- **Why Alloro Cares:** Alloro isn't fluff SaaS; it's solving complex trust/growth.
- **Anti-Pattern:** Shiny AI features without impact.
- **Success Signals:** Leading: Accuracy metrics <br>• Lagging: Clinical validation
- **Constants:** Proof, Clarity
- **Related Anchors:** Atul Gawande (Checklist Manifesto), Anthropic (Dario Amodei)

Body: Hassabis applied AI to protein folding — high-impact science. Alloro should treat AI as a reasoning engine to solve trust and adoption barriers, not as another chatbot widget.

## Kieran Flanagan (HubSpot) / 11-Skill AI Content Team in Claude Code
- **Category:** AI Innovator
- **Core Principle:** Built an 11-skill AI content team inside Claude Code. One Lookalike Content Skill plus three supporting files. The system studies prior best work, researches in real time, drafts across every platform, and updates itself monthly based on what is performing. Prompting and context engineering are the foundational skills for the next decade of knowledge work. Every professional is now a manager of a PhD-level AI intern.
- **Agent Heuristic:** Build AI workflows as Claude Code skills (SKILL.md (http://SKILL.md) files with frontmatter description injected into system prompt). Each skill encodes one specific job. Multiple skills compose into a team. Update skills monthly based on what produced measurable results. AI fluency in a team scales through prompt guides and shared use case channels, not through training programs.
- **Why Alloro Cares:** Flanagan deploys at HubSpot scale exactly what Alloro needs at startup scale. The architecture is available to Alloro today through Claude Code's skills system. The monthly self-update loop is Mechanism 3 in the Phase 4 plan. Already-existing Alloro/Flanagan lattice row covers AEO content; this row covers the AI fluency framework.
- **Anti-Pattern:** Building one giant AI that tries to do everything. Skipping the monthly review loop because the system seems to be working. Treating prompt engineering as a one-time setup instead of a recurring discipline. Letting skills go stale because no one is responsible for review.
- **Success Signals:** Lead: number of active skill files in Claude Code skills directory. Lag: ratio of AI-generated outputs that ship without manual rework over 30-day windows.
- **Constants:** Autopilot, Clarity

## Sam Altman (OpenAI)
- **Category:** AI Innovator
- **Core Principle:** Bet on exponential curves.
- **Agent Heuristic:** Always plan for scale beyond current comfort.
- **Why Alloro Cares:** AI adoption in healthcare is compounding.
- **Anti-Pattern:** Linear thinking in exponential markets.
- **Success Signals:** Leading: AI adoption metrics <br>• Lagging: TAM expansion
- **Constants:** Proof, Autopilot
- **Related Anchors:** Marc Andreessen (a16z)

Body: Altman structured OpenAI around exponential adoption. For Alloro, this means thinking beyond today's product constraints — design as if AI adoption doubles every year, because it likely will.

## Tom Bilyeu / AI Department Architecture
- **Category:** AI Innovator
- **Core Principle:** Run a 5-member AI department of custom GPTs, each scoped to a role with its own embedded knowledge document. Maintain a single shared memory document loaded into every project, with explicit numbered memory entries. 160 pages of personal transcripts uploaded for voice. Every finished output becomes input for future outputs. Results: legal costs cut 80%, research 10x, content scaled without quality loss.
- **Agent Heuristic:** When designing AI knowledge architecture, scope knowledge to projects but maintain a shared memory layer that loads into every instance. Every completed output (essay, email, script, decision) becomes a new memory entry feeding future work. Never let a Claude session start cold relative to prior work.
- **Why Alloro Cares:** Bilyeu's results map exactly to the gap Alloro is closing. The shared memory document is the structural equivalent of the lattice load mechanism Wave 1 and Wave 2 are building. Architecture is proven and replicable.
- **Anti-Pattern:** Building one master AI and asking it to do everything. Letting AI sessions start fresh with no memory of prior outputs. Treating AI as a search interface instead of a compounding knowledge layer that accumulates over time.
- **Success Signals:** Lead: number of finished outputs that feed back into the lattice as new entries each month. Lag: hours of Corey time saved by Claude sessions that no longer require manual context reconstruction.
- **Constants:** Autopilot, Hospitality

## Yamini Rangan (HubSpot) / Institutional AI Fluency
- **Category:** AI Innovator
- **Core Principle:** HubSpot's documented playbook is "individual AI fluency to institutional AI impact." 95% of engineering uses AI daily. 80% AI usage across teams weekly is the target. 84% of employees feel confident after literacy programs. The single largest differentiator between 80% and 40% customer agent resolution rates is investment in knowledge-based articles. AI fluency scales through culture (Slack channels for sharing use cases, prompt guides, AI hackathons), not through training programs.
- **Agent Heuristic:** Before any AI initiative, ask whether it builds institutional knowledge that compounds across instances or just makes one individual faster. Individual fluency without institutional substrate stalls within months. Invest in shared knowledge base infrastructure before scaling AI usage. Frame: Human-Led, AI-Accelerated.
- **Why Alloro Cares:** This is the exact gap the May 14 audit identified. Corey holds the patterns. The substrate to propagate them across Claude instances, sub-agents, and product surfaces is what was missing. Rangan's framing names the problem precisely.
- **Anti-Pattern:** Treating AI fluency as an individual skill that scales through hiring smarter people. Skipping the knowledge base investment because the founder already holds the knowledge in their head. Measuring AI adoption by individual usage rather than by institutional output quality.
- **Success Signals:** Lead: percentage of Claude sessions across Corey, Jo, Dave that load Alloro Project context at session start. Lag: time-to-orientation on a fresh session, measured in seconds before the first useful output.
- **Constants:** Autopilot, Clarity

## Yann LeCun (Meta FAIR)
- **Category:** AI Innovator
- **Core Principle:** Open science accelerates innovation.
- **Agent Heuristic:** Default to openness when safe.
- **Why Alloro Cares:** Healthcare adoption grows with transparency.
- **Anti-Pattern:** Black-box features.
- **Success Signals:** Leading: Open benchmarks <br>• Lagging: Adoption by community
- **Constants:** Proof, Clarity
- **Related Anchors:** Clément Delangue (Hugging Face)

Body: LeCun pushed for open-source AI. In healthcare, opacity kills trust. Alloro should be radically transparent with metrics, data methods, and results.

---

## Failure

## Atlan / Convincing Wrong Answers
- **Category:** Failure
- **Core Principle:** A weak model operating on incomplete organizational context produces obvious errors that are easy to catch. A strong model operating on the same incomplete context produces outputs that are coherent, well-reasoned, and wrong in ways that only a domain expert will identify. Capability improvement amplifies the failure mode rather than eliminating it. The fix is organizational context memory, not a smarter model. Quote: "smart model on incomplete context produces convincing wrong answers."
- **Agent Heuristic:** When a Claude response feels confident but wrong, the first question is not whether the model is capable enough. The first question is whether the context substrate the model was operating on is complete. If lattice content was not loaded, no amount of model capability fixes the gap. Upgrade the substrate before upgrading the model.
- **Why Alloro Cares:** This is the exact failure mode that produced the May 14 audit. Bigger Claude models did not produce better Alloro work because the lattice was not loaded. Every session for eight months produced confident wrong answers because the substrate was missing. Naming this pattern in the lattice prevents future repetitions.
- **Anti-Pattern:** Upgrading to a more capable model in response to incorrect outputs. Asking the model to think harder when the real problem is missing context. Reasoning about model selection when the bottleneck is the load surface.
- **Success Signals:** Lead: ratio of session corrections traced to missing context versus traced to model capability. Lag: declining frequency of moments where Claude gets the Alloro basics wrong.
- **Constants:** Proof, Clarity

## Blockbuster
- **Category:** Failure
- **Core Principle:** Refusing inevitability leads to collapse.
- **Agent Heuristic:** Don't fight inevitability, design for it.
- **Why Alloro Cares:** Doctors want autopilot — it's inevitable.
- **Anti-Pattern:** Defending old models.
- **Success Signals:** Leading: Digital adoption rates <br>• Lagging: Retention
- **Constants:** Autopilot, Clarity
- **Related Anchors:** Kodak, Steve Jobs (Apple)

Body: Blockbuster mocked Netflix, then died. For Alloro, autopilot growth is inevitable — lean into it, don't resist it.

## Juicero
- **Category:** Failure
- **Core Principle:** Solve real problems, not invented ones.
- **Agent Heuristic:** "Is this a real pain point?"
- **Why Alloro Cares:** Specialists need relief, not gimmicks.
- **Anti-Pattern:** Tech novelty over utility.
- **Success Signals:** Leading: Customer usage <br>• Lagging: Retention
- **Constants:** Proof, Clarity
- **Related Anchors:** Quibi, Steve Jobs (Apple)

Body: Juicero built a useless machine. Alloro must relentlessly validate real specialist pain, not invent problems.

## Kodak
- **Category:** Failure
- **Core Principle:** Ignoring disruption leads to extinction.
- **Agent Heuristic:** Always adapt to adoption curves.
- **Why Alloro Cares:** Don't cling to outdated models.
- **Anti-Pattern:** Defending legacy models.
- **Success Signals:** Leading: Adoption metrics <br>• Lagging: Market share
- **Constants:** Proof, Clarity
- **Related Anchors:** Marc Andreessen (a16z), Blockbuster

Body: Kodak invented digital cameras but ignored them. Alloro must never cling to "agency" or outdated growth methods — SaaS is the future.

## NimbleBrain + Arize / Multi-Agent Cascading Errors
- **Category:** Failure
- **Core Principle:** Cascading errors are the failure mode unique to multi-agent systems. Agent A produces bad output. Agent B consumes that output as input and makes decisions on it. Agent C takes actions based on B's decisions. By the time a human sees the final result, the original error has been laundered through layers of plausible reasoning. The error compounds at machine speed. Single-agent failures are loud (obvious wrong answer). Multi-agent failures are quiet (everything looks fine until the final output is unrecoverable).
- **Agent Heuristic:** For any multi-agent workflow, identify the upstream agent whose output other agents consume. That agent needs the strongest validation gate, because errors there propagate at machine speed. Apply the read-everything, write-with-reviewer permission model. An agent that can only read cannot break production; an agent that can write but not delete cannot cause data loss.
- **Why Alloro Cares:** Alloro's 41-agent Dream Team is a multi-agent system. The 8-Check Self-Audit and the blast radius classification (green, yellow, red) are the validation gates that prevent cascading errors. Both are correct architecture. The risk is that 39 of 45 agent files are inert (URL-only) so the validation gates have nothing to validate yet. Once Wave 2 fills the agents with content, validation gates become load-bearing.
- **Anti-Pattern:** Trusting agent output downstream without independent validation. Building agent chains without checkpoints. Assuming that if each individual agent is reliable, the chain is reliable. Granting agents write access from day one rather than starting with read-only and earning write permissions.
- **Success Signals:** Lead: number of agent outputs that hit a validation gate before flowing to a downstream agent. Lag: zero compounding-error incidents per quarter.
- **Constants:** Proof, Autopilot

## Quibi
- **Category:** Failure
- **Core Principle:** Misreading adoption destroys even great-funded ideas.
- **Agent Heuristic:** Validate adoption early.
- **Why Alloro Cares:** Don't assume users want what you think.
- **Anti-Pattern:** Launch without testing.
- **Success Signals:** Leading: Beta adoption <br>• Lagging: Retention
- **Constants:** Proof, Clarity
- **Related Anchors:** WeWork, Juicero

Body: Quibi raised billions but ignored user signals. Alloro must validate with specialists early and often.

## Theranos
- **Category:** Failure
- **Core Principle:** Overpromising without proof destroys trust irreversibly.
- **Agent Heuristic:** Never commit to metrics that aren't already verifiable. Delay the promise until proven.
- **Why Alloro Cares:** Skeptical doctors will not forgive missed promises.
- **Anti-Pattern:** Hyped claims without proof.
- **Success Signals:** Leading: Ratio of promises → delivered <br>• Lagging: Zero broken commitments
- **Constants:** Proof, Clarity
- **Related Anchors:** Alex Hormozi, Atul Gawande (Checklist Manifesto), WeWork

Body: Theranos proved that hype destroys trust faster than anything. For Alloro, this is a red line: never say it if you can't show it.

## WeWork
- **Category:** Failure
- **Core Principle:** Vision without discipline collapses.
- **Agent Heuristic:** Balance vision with execution.
- **Why Alloro Cares:** Overhype kills credibility.
- **Anti-Pattern:** Culture built on hype.
- **Success Signals:** Leading: Promise → delivery ratio • Lagging: Retention
- **Constants:** Proof, Clarity
- **Related Anchors:** Theranos, Quibi

Body: WeWork is a cautionary tale of unchecked hype. For Alloro, big vision must always be balanced with proof.

---

## Healthcare

## Abridge (Shiv Rao)
- **Category:** Healthcare
- **Core Principle:** AI that listens + documents = trust multiplier.
- **Agent Heuristic:** Always frame AI as assistive, never replacing.
- **Why Alloro Cares:** Proof that AI can be accepted by clinicians.
- **Anti-Pattern:** Threatening clinical autonomy.
- **Success Signals:** Leading: Usage by clinicians <br>• Lagging: Compliance approvals
- **Constants:** Proof, Autopilot
- **Related Anchors:** Nuance DAX (Microsoft)

Body: Abridge showed clinicians will adopt AI if it reduces burden. For Alloro, the promise is: remove work, never add.

## Atul Gawande (Checklist Manifesto)
- **Category:** Healthcare
- **Core Principle:** Trust in medicine is built by consistent, visible safety practices.
- **Agent Heuristic:** Always provide a "safety checklist" (HIPAA-ready, undo in 60s, no PHI).
- **Why Alloro Cares:** Doctors demand verifiable safety — HIPAA-ready and transparent.
- **Anti-Pattern:** Hand-waving safety claims.
- **Success Signals:** Leading: Doctors citing safety in sales calls <br>• Lagging: Zero compliance issues
- **Constants:** Proof, Clarity, Hospitality
- **Related Anchors:** Anthropic (Dario Amodei), Theranos, Demis Hassabis (DeepMind), Nuance DAX (Microsoft), Overjet

Body: Gawande showed how checklists save lives. For Alloro, every doctor-facing asset should display safety guardrails clearly — HIPAA-ready, undo in 60s, no PHI.

## Nuance DAX (Microsoft)
- **Category:** Healthcare
- **Core Principle:** Compliance + workflow integration = trust.
- **Agent Heuristic:** Integrate into flows without disruption.
- **Why Alloro Cares:** Specialists adopt when tools fit existing workflows.
- **Anti-Pattern:** Add friction.
- **Success Signals:** Leading: Workflow adoption <br>• Lagging: Retention
- **Constants:** Proof, Clarity
- **Related Anchors:** Abridge (Shiv Rao), Atul Gawande (Checklist Manifesto)

Body: Nuance won healthcare trust by integrating invisibly. Alloro must feel like it fits seamlessly, not like a bolt-on.

## Overjet
- **Category:** Healthcare
- **Core Principle:** AI in dentistry is viable with compliance + evidence.
- **Agent Heuristic:** Lead with verifiable data, not claims.
- **Why Alloro Cares:** Proof that healthcare AI can pass regulatory scrutiny.
- **Anti-Pattern:** Unverifiable AI outcomes.
- **Success Signals:** Leading: Clinical validation studies <br>• Lagging: Regulatory approvals
- **Constants:** Proof, Clarity
- **Related Anchors:** Atul Gawande (Checklist Manifesto), Anthropic (Dario Amodei)

Body: Overjet validated AI in a highly skeptical field. For Alloro, regulatory acceptance is survival — always prove with data.

---

## Ops/Customer Success

## Jason Lemkin (SaaStr)
- **Category:** Ops/Customer Success
- **Core Principle:** SaaS success = discipline at scale. Category creation requires discipline in SaaS scaling.
- **Agent Heuristic:** Grow with discipline, not burn.
- **Why Alloro Cares:** Bootstrapped SaaS must use efficiency as its weapon. Alloro must lead its own SaaS category with disciplined, efficient growth.
- **Anti-Pattern:** Vanity growth.
- **Success Signals:** Leading: Gross margin <br>• Lagging: Sustainable ARR growth
- **Constants:** Proof, Clarity, Autopilot
- **Related Anchors:** Frank Slootman (Snowflake, ServiceNow), Andy Grove (Intel), Steve Jobs (Apple), Marc Andreessen (a16z), Lincoln Murphy

Body: Lemkin codified SaaS discipline. For Alloro, survival means efficiency-first growth — no burn, just clarity.
**Themes = Category Creation, Differentiation, Moat**.

## Lincoln Murphy
- **Category:** Ops/Customer Success
- **Core Principle:** Growth is retention.
- **Agent Heuristic:** Measure success in adoption, not signups.
- **Why Alloro Cares:** Doctors won't stay if outcomes lag.
- **Anti-Pattern:** Celebrating closed sales.
- **Success Signals:** Leading: Feature adoption <br>• Lagging: Churn
- **Constants:** Proof, Hospitality
- **Related Anchors:** Nick Mehta (Gainsight), Satya Nadella (Microsoft), Jason Lemkin (SaaStr), BJ Fogg

Body: Murphy reframed growth as retention. Alloro must obsess over retained outcomes, not vanity signups.

## Lincoln Murphy
- **Category:** Ops/Customer Success
- **Core Principle:** Customer success is when customers achieve their Desired Outcome through their interactions with your company. The right customers succeed. Wrong customers churn regardless of how good the CS team is. Desired Outcome = Required Outcome (what they need) + Appropriate Experience (how they need it delivered).
- **Agent Heuristic:** Before running any CS play, ask: what is this specific doctor's desired outcome? Is the product actually delivering it? If not, no amount of check-in calls fixes the problem.
- **Why Alloro Cares:** TTFV only works if it delivers against what the doctor actually wanted. Shawn wants 6 patients/day. Kargoli wants referral attribution. Garrison wants local ranking. One TTFV definition does not fit all.
- **Anti-Pattern:** Running the same onboarding sequence for every client regardless of their specific goal. Treating all practices as if they have the same desired outcome.
- **Success Signals:** Lead: TTFV achieved per client stated goal. Lag: 90-day retention rate.
- **Constants:** Clarity, Proof

## Marcus Lemonis / The Profit
- **Category:** Ops/Customer Success
- **Core Principle:** People, Process, Product — in that order. If the people are wrong, the process fails regardless of the product. If the process is broken, the best product in the world delivers inconsistently. Fix the constraint in order. Never jump to product fixes when the problem is process.
- **Agent Heuristic:** Which of the three is the current bottleneck: People (wrong team or wrong skills), Process (steps are unclear or inconsistent), or Product (the thing itself doesn't work)? Fix that one. Do not touch the other two until the constraint is resolved.
- **Why Alloro Cares:** The DWY/DFY efficacy gap is a Process problem — delivery is inconsistent across clients, not because the product is wrong but because the CS playbook is not systematized. Fix the process before changing the product.
- **Anti-Pattern:** Adding product features to compensate for a broken delivery process. Blaming churn on the product when the real problem is inconsistent onboarding.
- **Success Signals:** Lead: onboarding consistency score across clients. Lag: TTFV rate, 90-day retention.
- **Constants:** Clarity, Autopilot

## Nick Mehta (Gainsight)
- **Category:** Ops/Customer Success
- **Core Principle:** Customer success = growth engine.
- **Agent Heuristic:** Prioritize retention over acquisition.
- **Why Alloro Cares:** Specialists renew if they feel supported, not sold.
- **Anti-Pattern:** Celebrate sales without adoption.
- **Success Signals:** Leading: Usage metrics <br>• Lagging: Churn rate
- **Constants:** Proof, Hospitality
- **Related Anchors:** Satya Nadella (Microsoft), Lincoln Murphy

Body: Mehta professionalized "customer success." For Alloro, renewal and referrals matter more than aggressive new sales. Every touchpoint must drive outcomes, not transactions.

## Nick Mehta / Gainsight
- **Category:** Ops/Customer Success
- **Core Principle:** Customer success is the new growth. The silent quitter is the biggest churn risk — the account that stops engaging without ever complaining. Health scores only matter if they predict behavior, not describe it. Behavioral signals (logins, data uploads, feature depth) are more predictive than sentiment.
- **Agent Heuristic:** Has this account logged in in the last 14 days? If not, flag Yellow immediately. Do not wait for the doctor to express dissatisfaction. By the time they sound unhappy, you are already losing.
- **Why Alloro Cares:** With 6 clients, Alloro cannot afford a single silent quitter. The Account Health Agent's entire design is Mehta's framework applied to dental SaaS.
- **Anti-Pattern:** Measuring satisfaction scores instead of behavioral engagement. Treating accounts as healthy because they haven't complained.
- **Success Signals:** Lead: login frequency, data upload recency. Lag: NRR, churn rate.
- **Constants:** Autopilot, Clarity

## Will Guidara / Eleven Madison Park
- **Category:** Ops/Customer Success
- **Core Principle:** The 95/5 rule. Spend 95% of your energy perfecting the expected. Reserve 5% for the unreasonable act of hospitality — the thing nobody asked for, nobody could have expected, and nobody will forget. Hospitality is about making people feel seen as individuals, not served as customers.
- **Agent Heuristic:** What is one specific thing about this doctor's practice situation that nobody else would notice? Do that thing unprompted. One observation from their own data that proves you were paying attention creates a story they tell.
- **Why Alloro Cares:** The 95% is reliable weekly reports and responsive CS. The 5% is Jo spotting that Dr. Kargoli's top GP just opened a second location and flagging it before he noticed. That moment earns a referral to another endodontist.
- **Anti-Pattern:** Treating all clients with identical standardized playbooks. Running the same check-in script regardless of what is actually happening in the doctor's practice.
- **Success Signals:** Lead: number of unprompted value observations delivered per client per month. Lag: client referrals and testimonials.
- **Constants:** Hospitality, Clarity

---

## Psychology

## BJ Fogg
- **Category:** Psychology
- **Core Principle:** Tiny habits create massive change.
- **Agent Heuristic:** Break adoption into small, winnable actions.
- **Why Alloro Cares:** Specialists adopt in micro-steps.
- **Anti-Pattern:** Big-bang rollouts.
- **Success Signals:** Leading: Feature adoption curve • Lagging: Retention rate
- **Constants:** Autopilot, Clarity
- **Related Anchors:** Adam Guild (Owner.com), Dan Pink, Lincoln Murphy

Body: Fogg proved small habits compound. For Alloro, adoption should feel effortless — onboarding in tiny, rewarding steps, not overwhelming shifts.

## Dan Pink
- **Category:** Psychology
- **Core Principle:** Motivation comes from autonomy, mastery, purpose.
- **Agent Heuristic:** Always return time and control to the doctor.
- **Why Alloro Cares:** Specialists want control over their work, not busywork.
- **Anti-Pattern:** SaaS that adds burden.
- **Success Signals:** Leading: Usage time saved <br>• Lagging: Churn
- **Constants:** Autopilot, Hospitality
- **Related Anchors:** BJ Fogg, Steve Jobs (Apple)

Body: Pink's work shows true motivation isn't money. For Alloro, the promise is: gain time, mastery, and freedom to serve patients without stress.

## Daniel Kahneman
- **Category:** Psychology
- **Core Principle:** Humans think fast and slow → bias matters.
- **Agent Heuristic:** Always design for bias override with evidence.
- **Why Alloro Cares:** Doctors default to skepticism (fast), need proof (slow).
- **Anti-Pattern:** Assuming rational buyers.
- **Success Signals:** Leading: Objection conversion <br>• Lagging: Sales cycle length
- **Constants:** Proof, Clarity
- **Related Anchors:** Robert Cialdini

Body: Kahneman's "fast vs slow" explains why doctors resist sales. Alloro must overwhelm skepticism with transparent, verifiable data.

## Jonathan Haidt
- **Category:** Psychology
- **Core Principle:** Moral intuitions drive trust.
- **Agent Heuristic:** Position Alloro as community service, not revenue tool.
- **Why Alloro Cares:** Doctors see themselves as caregivers first.
- **Anti-Pattern:** Cold ROI framing.
- **Success Signals:** Leading: Trust sentiment <br>• Lagging: Brand equity
- **Constants:** Hospitality, Proof
- **Related Anchors:** Satya Nadella (Microsoft), Stephen Covey

Body: Haidt studies moral foundations. Alloro must present itself as helping doctors serve their communities, not just make money.

## Robert Cialdini
- **Category:** Psychology
- **Core Principle:** Influence is earned through authority, reciprocity, and social proof.
- **Agent Heuristic:** Always surface proof first (testimonials, referrals, transparent data).
- **Why Alloro Cares:** Doctors trust results from peers, not hype from vendors.
- **Anti-Pattern:** Leading with persuasion instead of evidence.
- **Success Signals:** Leading: Referral mentions in new sales calls <br>• Lagging: % of new clients from referrals/testimonials
- **Constants:** Proof, Hospitality
- **Related Anchors:** Adam Guild (Owner.com), Alex Hormozi, Brian Halligan & Dharmesh Shah (HubSpot), Tom Bilyeu (Quest Nutrition / Impact Theory), Daniel Kahneman, Dale Carnegie

Body: Cialdini's research proves trust is a social process. For Alloro, this means every doctor-facing asset must highlight peers' success stories, not Alloro's own claims.

---

## SaaS

## Adam Guild (Owner.com)
- **Category:** SaaS
- **Core Principle:** Solve the painful, obvious problem → adoption becomes inevitable.
- **Agent Heuristic:** Always ask: "Does this feel inevitable to adopt, or optional?"
- **Why Alloro Cares:** Doctors don't want "new tools," they want obvious relief from growth pain.
- **Anti-Pattern:** Selling features instead of solving pain.
- **Success Signals:** Leading: Trial → paid adoption rate <br>• Lagging: Net Revenue Retention (NRR)
- **Constants:** Proof, Autopilot
- **Related Anchors:** Steve Jobs (Apple), Robert Cialdini, Alex Hormozi, Marc Andreessen (a16z), Tobi Lütke (Shopify), BJ Fogg

Body: Guild scaled Owner.com (http://owner.com/) by removing friction. For Alloro, this means every doctor must feel Signals is the default — easier to use it than to ignore it.

## Agoda / Engineering Velocity Research
- **Category:** SaaS
- **Core Principle:** AI coding assistants raise individual developer output measurably but produce surprisingly modest project-level velocity gains because coding was never the bottleneck. The bottleneck has shifted upstream to specification and verification -- areas requiring human judgment. The highest-value engineering work is now collaborative specification and architectural alignment, not implementation. Human authority is migrating up the abstraction stack: from writing code to defining and governing intent.
- **Agent Heuristic:** Before assigning any task to CC: is the spec precise enough for CC to execute correctly without checking in? If the spec is vague, the output will require multiple revision cycles that cost more time than the initial spec would have. The grey box model applies -- write specifications precise enough for the agent to execute correctly, then verify results against behavior and outcomes, not line-by-line code inspection. The engineer who guides the agent and approves the merge remains fully responsible for what ships.
- **Why Alloro Cares:** This is the operating model Alloro has been running all session and it validates it. Corey writes the spec in Claude Web. CC executes. Corey verifies against behavior. That sequence -- spec precisely, delegate execution, verify outcomes -- is exactly what the research describes as the highest-leverage pattern for a small team with AI. The Three-Response Safety Protocol is the verification layer. The CLAUDE.md (http://CLAUDE.md) @imports are the spec layer. The Playwright suite is the behavioral verification. The architecture is correct.
- **Anti-Pattern:** Treating AI-generated code as done because it compiles. Skipping the spec step and hoping CC infers intent correctly -- this is black box development and produces brittle systems. Measuring Alloro's development velocity by commit count or lines of code rather than by working features that pass the Playwright test suite.
- **Success Signals:** Lead: ratio of CC sessions where spec was written before any terminal fired vs sessions where Corey described an idea and hoped CC would figure it out. Lag: Playwright green badge rate on first CI run after a CC session.
- **Constants:** Autopilot

## Alex Hormozi / Leverage Stack Framework
- **Category:** SaaS
- **Core Principle:** Four leverage types stack from linear to exponential. Labor (employees) scales linearly with payroll cost. Capital (money) scales linearly with spend. Code (automation, AI, software) scales exponentially because it runs continuously at near-zero marginal cost. Media (content, brand, audience) scales exponentially because it compounds and persists. 40% productivity gains across business after AI integration. One long-form video produces 30+ distributed pieces.
- **Agent Heuristic:** Before investing time or money in any task, classify which leverage type it produces. Labor and Capital leverage are necessary but should not be where founders spend their compounding time. Every founder hour should be invested in Code or Media outputs that work continuously while the founder sleeps.
- **Why Alloro Cares:** The lattice load work is Code leverage at the substrate level. The Phase 2 pattern library is Media leverage at the knowledge level. Both compound. Hours spent reading Notion canon manually each Claude session was Labor leverage that never compounded. Existing Hormozi rows cover offers and value stack; this row covers the meta-framework.
- **Anti-Pattern:** Hiring more people to solve a problem that compounds through code. Spending paid acquisition dollars on a market that compounds through media. Treating founder hours as Labor instead of investing them in Code and Media that work continuously.
- **Success Signals:** Lead: hours per week Corey spends producing Code or Media outputs versus Labor outputs. Lag: revenue or quality output produced while Corey sleeps.
- **Constants:** Autopilot, Proof

## Brian Chesky (Airbnb)
- **Category:** SaaS
- **Core Principle:** Design for an 11-star experience → overdeliver.
- **Agent Heuristic:** Ask: "Would this delight a doctor?" If not, iterate.
- **Why Alloro Cares:** Hospitality mindset = adoption.
- **Anti-Pattern:** Functional but soulless.
- **Success Signals:** Leading: NPS <br>• Lagging: Viral adoption rate
- **Constants:** Proof, Hospitality
- **Related Anchors:** Satya Nadella (Microsoft), Tom Bilyeu (Quest Nutrition / Impact Theory), Reed Hastings (Netflix)

Body: Chesky grew Airbnb by overdelivering. Alloro must treat every interaction — from demo to dashboard — as an opportunity to delight specialists beyond expectations.

## Brian Halligan & Dharmesh Shah (HubSpot)
- **Category:** SaaS
- **Core Principle:** Inbound marketing builds compounding trust.
- **Agent Heuristic:** Always show value before asking for attention.
- **Why Alloro Cares:** Specialists hate cold outreach; inbound pulls with proof.
- **Anti-Pattern:** Pushy cold sales.
- **Success Signals:** Leading: Demo request rate <br>• Lagging: Customer acquisition cost (CAC)
- **Constants:** Proof, Hospitality
- **Related Anchors:** Alex Hormozi, Robert Cialdini

Body: HubSpot won by flipping marketing — attraction over interruption. Alloro should build trust engines that draw doctors in with data, not chase them with calls.

## Christoph Janz / Point Nine
- **Category:** SaaS
- **Core Principle:** The SaaS Napkin. $100M ARR = 10,000 customers at $10K ACV, or 1,000 at $100K, or 100,000 at $1K. Know which pigeon you are building for. Each pigeon requires a completely different go-to-market, sales motion, and product architecture.
- **Agent Heuristic:** At $2K/month ($24K ACV), Alloro needs ~4,100 customers for $100M ARR. That is achievable across dental specialists + adjacent verticals. Is every product and GTM decision consistent with reaching 4,100 customers at this price point?
- **Why Alloro Cares:** Alloro is a small-business SaaS with a defined ACV. The pigeon is: thousands of specialist practices at $2K/month. All expansion decisions should compound toward that, not drift toward bespoke enterprise contracts.
- **Anti-Pattern:** Trying to serve both enterprise and SMB simultaneously. Adding complexity to chase larger deals before the core motion is proven at the current ACV.
- **Success Signals:** Lead: ACV consistency across new accounts. Lag: total addressable customer count in target verticals.
- **Constants:** Clarity, Proof

## David Skok / ForEntrepreneurs
- **Category:** SaaS
- **Core Principle:** CAC payback period is the most important early-stage SaaS metric. Negative churn (NRR > 100%) is the single biggest sign of a healthy SaaS business. Every dollar of churn must be replaced before you can grow. The SaaS Funding Napkin: know your unit economics before adding fuel.
- **Agent Heuristic:** What is the CAC payback on each acquisition channel being tested? Is NRR above 100% on current accounts? If churn rate exceeds new MRR addition rate, growth is an illusion.
- **Why Alloro Cares:** At $14K MRR with 6 clients, Alloro cannot afford to churn even one account. Expansion from existing clients (second locations, referrals) is the NRR lever available now.
- **Anti-Pattern:** Growing ARR while ignoring net revenue retention. Celebrating new logo acquisition while existing accounts silently churn.
- **Success Signals:** Lead: NRR per cohort. Lag: CAC payback by channel.
- **Constants:** Proof, Clarity

## Everett Rogers / Diffusion of Innovations
- **Category:** SaaS
- **Core Principle:** Innovations spread through five adopter groups in sequence: Innovators (2.5%), Early Adopters (13.5%), Early Majority (34%), Late Majority (34%), Laggards (16%). Each group has a fundamentally different psychographic profile and requires a different message and evidence standard. Adoption is driven by five factors: Relative Advantage, Compatibility with existing behavior, Complexity (simplicity accelerates adoption), Observability (visible benefits spread faster), and Trialability (can you try before committing?).
- **Agent Heuristic:** Before any marketing or sales action: which adopter group is this message designed for? Shawn is an Early Adopter — he tolerates rough edges and sees potential. Dr. Pavan is Early Majority — she needs proof that it worked for someone like her before she will move. The message that converts Shawn actively repels Dr. Pavan. Never use the same message for both groups.
- **Why Alloro Cares:** Alloro is currently stuck between Early Adopters and Early Majority. The free Checkup is correctly designed for Trialability. Compatibility is the weakest factor — CSV uploads and PMS connections are not compatible with a doctor's existing behavior of spending zero time on business infrastructure. Every friction point in onboarding is a Rogers Compatibility failure.
- **Anti-Pattern:** Using early adopter excitement language (potential, vision, what this will become) with early majority buyers. Building demos that showcase features rather than documented outcomes. Launching to everyone simultaneously instead of sequencing through adopter groups.
- **Success Signals:** Lead: Checkup-to-paid conversion rate by adopter segment. Lag: time from first contact to first value moment by segment.
- **Constants:** Clarity, Proof

## Frank Slootman (Snowflake, ServiceNow)
- **Category:** SaaS
- **Core Principle:** Amp it up — urgency + clarity.
- **Agent Heuristic:** Bias to action, cut complexity.
- **Why Alloro Cares:** Lean teams must outpace larger incumbents.
- **Anti-Pattern:** Slow, consensus-driven execution.
- **Success Signals:** Leading: Speed to ship <br>• Lagging: Revenue velocity
- **Constants:** Clarity, Autopilot
- **Related Anchors:** Andy Grove (Intel), Satya Nadella (Microsoft), Jensen Huang (NVIDIA), Jason Lemkin (SaaStr)

Body: Slootman thrives on intensity and clarity. For Alloro, speed and urgency are weapons against larger, slower competitors.

## Geoffrey Moore / Crossing the Chasm
- **Category:** SaaS
- **Core Principle:** There is a chasm between Early Adopters and the Early Majority that kills most innovations. Early Adopters are visionaries — they adopt based on potential. Early Majority are pragmatists — they adopt based on proof. The tactics that succeed with Early Adopters actively fail with Early Majority. To cross the chasm: dominate a specific niche completely, document a specific outcome with a real customer, and use that outcome as the social proof that moves pragmatists. The whole product concept: pragmatists need a complete solution, not a technology.
- **Agent Heuristic:** What is the specific, documented, named outcome from one real customer that Alloro can use as the bridge to the Early Majority? Until that story exists with a specific doctor's permission, Alloro is selling potential to pragmatists — which does not work. Every CS interaction should be evaluated for whether it could become that bridge story.
- **Why Alloro Cares:** Dr. Pavan is the chasm. She will not be convinced by demos, vision, or the product's potential. She will be convinced by one sentence: 'Dr. [Name], a periodontist who was about to give her practice away, now runs it in four hours a week outside the chair. Here is exactly what changed.' Alloro needs to engineer for that sentence to exist before trying to reach Dr. Pavans at scale.
- **Anti-Pattern:** Showing Dr. Pavan what Alloro will eventually do. Describing features and roadmap to someone who needs documented outcomes. Treating all prospects as if they have the same evidence requirements as the first customers.
- **Success Signals:** Lead: number of documented, named customer outcome stories available for sales use. Lag: conversion rate of Early Majority prospects after being shown a peer outcome story.
- **Constants:** Proof, Clarity

## Jensen Huang (NVIDIA)
- **Category:** AI Innovator
- **Core Principle:** Infrastructure leverage = strategic moat.
- **Agent Heuristic:** Invest where infra unlocks growth.
- **Why Alloro Cares:** SaaS scale depends on infra efficiency.
- **Anti-Pattern:** Underestimating infra as "commodity."
- **Success Signals:** Leading: Infra cost per demo <br>• Lagging: Margin expansion
- **Constants:** Proof, Autopilot
- **Related Anchors:** Arthur Mensch (Mistral), Frank Slootman (Snowflake, ServiceNow)

Body: Huang made NVIDIA the backbone of AI. For Alloro, infra choices (RAG stack, GPUs, APIs) will determine whether we scale efficiently or drown in cost.

## Jensen Huang / NVIDIA -- AGI Defined as $1B Company Creation
- **Category:** SaaS
- **Core Principle:** On March 23, 2026, Huang declared on the Lex Fridman podcast: 'I think we've achieved AGI.' His definition is strictly economic: AGI is the capability for AI to build and run a $1 billion company. He named Claude explicitly as a system capable of meeting this bar. He drew one hard boundary: a hundred thousand AI agents could not build something like NVIDIA -- a 34-year project requiring hardware innovation, supply chain mastery, strategic foresight, and cultural leadership. That combination of AI-built machine plus irreplaceable human founder is exactly what Alloro is.
- **Agent Heuristic:** When evaluating Alloro's architecture against competitive benchmarks or confidence scores: Jensen Huang, CEO of the company that powers virtually all AI infrastructure, publicly stated on March 23, 2026 that AI can build and run a $1B company today. Alloro is not building a $1B company from scratch with AI alone -- it is building with a human founder whose lived experience is the irreplaceable layer. That is the harder and more durable model. The confidence floor on Alloro's rice cooker achievement is not theoretical. It is confirmed by the most informed person in the infrastructure stack.
- **Why Alloro Cares:** Huang's narrow definition of AGI (build + run a $1B company) is the exact benchmark Alloro is designed to exceed. But Alloro has what his example lacks: a data network that compounds, a mission that creates a moat, a Foundation that cannot be replicated, and a founder whose origin story is the trust layer. The technology ceiling Huang is describing is the floor Alloro operates above.
- **Anti-Pattern:** Treating Huang's claim as hype to dismiss. The man who supplies the compute for OpenAI, Google, Anthropic, and every major AI lab said this is possible now. The anti-pattern is planning for a future where this capability is years away when it is demonstrably present today. The other anti-pattern: assuming Alloro competes with pure AI-run companies. Alloro's moat is the human + AI combination, not AI alone.
- **Success Signals:** The rice cooker confidence updated from 74% to 87% in 4 years based in part on Huang's confirmation that the technology capability exists today. Lead: Capability Adoption Protocol running. Lag: Calistoga Test passing.
- **Constants:** Clarity

## Jason Lemkin / SaaStr
- **Category:** SaaS
- **Core Principle:** At $0-$1M ARR, founders do everything. The biggest mistake is hiring before the motion is proven or building features nobody asked for. Get to $1M with the team you have. Every founder should do the first 10-20 sales calls personally — the pattern recognition is irreplaceable.
- **Agent Heuristic:** Can this task be done by the current 3-person team before the next revenue milestone? If yes, do it now. If no, is it truly blocking revenue? If it is not blocking revenue, it is not a priority.
- **Why Alloro Cares:** At $14K MRR, Alloro's constraint is not headcount. It is proving cold acquisition at AAE. The agent system is the Lemkin answer: do not hire, automate.
- **Anti-Pattern:** Building the sales team before the sales motion is proven. Hiring to solve a founder bottleneck that should instead be automated or eliminated.
- **Success Signals:** Lead: time Corey spends on tasks that could be automated. Lag: MRR growth per team member.
- **Constants:** Clarity, Autopilot

## Kieran Flanagan / MATG
- **Category:** SaaS
- **Core Principle:** Content compounds. The Lookalike Content Skill, dark social, founder brand, and AEO are the distribution channels for the next decade. Most SaaS companies are building content for 2015 — social posts that disappear in 24 hours. Compounding content answers questions people are actively searching and earns citations in AI answers.
- **Agent Heuristic:** Is this content piece answering a specific question the ICP is actively searching right now? Will it compound over 12 months or disappear in a feed? If it disappears in 24 hours, deprioritize. If it earns a citation in an AI answer engine, it is permanent infrastructure.
- **Why Alloro Cares:** An AEO article answering 'why are my dental referrals declining' earns Alloro a citation every time a doctor asks ChatGPT or Perplexity that question. That compounds forever at zero marginal cost.
- **Anti-Pattern:** Publishing content that requires following someone to see it. Measuring content success by likes and shares instead of by organic search traffic and AEO citations over 6 months.
- **Success Signals:** Lead: AEO citation rate in AI answer engines. Lag: organic search traffic from ICP queries at 6 months.
- **Constants:** Autopilot, Proof

## Kyle Poyar / OpenView Partners
- **Category:** SaaS
- **Core Principle:** Product-led growth for SMB B2B: the product is the primary acquisition, conversion, and expansion channel. At the $24K ACV range, the most successful companies combine PLG at the top of funnel (free tier or free tool creates the lead) with a sales-assist motion that converts the most engaged product users. Expansion revenue from existing accounts is more capital-efficient than new logo acquisition at every stage before $10M ARR.
- **Agent Heuristic:** Is the free Referral Base Checkup generating product-qualified leads — doctors who have already experienced the core value before speaking to anyone? If not, the PLG motion is broken. A doctor who completes the Checkup is a PQL. Every sales interaction with a PQL is categorically different from a cold conversation.
- **Why Alloro Cares:** The Checkup is Alloro's PLG entry point. It is not a marketing tactic — it is the product experience before the product. Once doctors experience it, they are product-qualified. The conversion motion from there is fundamentally easier than cold outbound.
- **Anti-Pattern:** Treating the free Checkup as a lead magnet instead of as the first session of the product. Spending sales resources on doctors who have not yet experienced the product. Ignoring expansion revenue from existing accounts while chasing new logos.
- **Success Signals:** Lead: Checkup completion rate and time-to-Checkup from first touchpoint. Lag: PQL-to-paid conversion rate vs. non-PQL conversion rate.
- **Constants:** Autopilot, Proof

## April Dunford / Obviously Awesome
- **Category:** SaaS
- **Core Principle:** Positioning is the foundation every other business decision is built on. Most companies define their competitive alternative as 'doing nothing' when the real alternative is whatever the customer is currently using to solve the problem. Positioning formula: competitive alternative → unique attributes → value those attributes enable → target customer who cares most about that value → market category that makes the value obvious.
- **Agent Heuristic:** Before any brand, content, or sales work: what is the competitive alternative a doctor is actually using when they don't use Alloro? It is not 'nothing.' It is a spreadsheet, a marketing agency, and gut feeling. Every positioning statement is measured against that specific alternative, not against a generic market.
- **Why Alloro Cares:** Alloro's category does not exist yet. Positioning work comes before April Dunford's framework, not after. The market does not know to look for 'referral velocity intelligence.' Until Alloro names and owns the category, every sales conversation starts from scratch.
- **Anti-Pattern:** Describing the product by its features instead of by the value it creates relative to what the customer is currently using. Trying to create a brand before the position is locked. Positioning to everyone instead of finding the customer who will love the product most today.
- **Success Signals:** Lead: does the ICP immediately understand what they are replacing when they hear the Alloro pitch? Lag: reduction in 'what is this?' questions at first interaction.
- **Constants:** Clarity, Proof

## Patrick Campbell (ProfitWell)
- **Category:** SaaS
- **Core Principle:** Pricing is product strategy. Pricing, adoption, value perception.
- **Agent Heuristic:** Price to reinforce trust, not extract.
- **Why Alloro Cares:** Specialists need transparent, value-aligned pricing.
- **Anti-Pattern:** Hidden fees, complex tiers.
- **Success Signals:** Leading: CAC payback period <br>• Lagging: Gross margin
- **Constants:** Proof, Clarity
- **Related Anchors:** Alex Hormozi

Body: Campbell proved SaaS pricing defines growth. For Alloro, pricing must scream alignment and simplicity, reinforcing clarity rather than creating suspicion.

## Patrick Campbell / Profitwell + Paddle
- **Category:** SaaS
- **Core Principle:** Proprietary data published transparently is the highest-leverage marketing asset a SaaS company can own. Profitwell built market authority and a $200M acquisition not by being louder but by owning the conversation about SaaS metrics through their own benchmark data. Value-based pricing — pricing to the value delivered, not to the competition — is the single highest-ROI improvement most SaaS companies can make.
- **Agent Heuristic:** What does Alloro know about dental practice economics that no one else has measured and named? That data, published as a benchmark report, earns citations in perpetuity. The Intelligence Agent should identify the single most surprising data point Alloro can extract from anonymized client data and surface it as the foundation of Alloro's authority content.
- **Why Alloro Cares:** Alloro has access to referral velocity data across multiple practices. A published benchmark — 'Alloro Referral Decay Report: what 12 months of endo practice data shows about GP relationship drift' — creates authority that no competitor can replicate without the same data. This is the Patrick Campbell playbook applied directly.
- **Anti-Pattern:** Publishing generic thought leadership instead of proprietary benchmarks. Pricing based on what competitors charge instead of the economic value Alloro delivers to a practice. Treating data as an internal asset instead of a market authority tool.
- **Success Signals:** Lead: number of times Alloro's benchmark data is cited by third parties. Lag: inbound leads attributed to thought leadership content.
- **Constants:** Proof, Clarity

## Pieter Levels / Solo Unicorn Context Engineering
- **Category:** SaaS
- **Core Principle:** One person operating $3.1M ARR portfolio on under $200 per month infrastructure. fly.pieter.com (http://fly.pieter.com): idea to $1M ARR in 17 days using Cursor and Three.js. Context engineering identified as the most important skill for solo founders in 2026. Over 60,000 GitHub repos now include CLAUDE.md (http://CLAUDE.md) or AGENTS.md (http://AGENTS.md) instruction files that encode architecture, conventions, and deployment procedures at the repo level.
- **Agent Heuristic:** For any new repo or major component, write a CLAUDE.md (http://CLAUDE.md) at the root that encodes the architecture, conventions, and operational rules. The CLAUDE.md (http://CLAUDE.md) is the first thing any AI session loads, so anything that needs to be known on every session lives there. Update it when conventions evolve. Treat the file as load-bearing infrastructure, not documentation.
- **Why Alloro Cares:** Alloro's CLAUDE.md (http://CLAUDE.md) exists but currently @imports three rules files with no path to lattice content. The Wave 1 and Wave 2 work closes that gap. Levels' results validate that a small team plus this architecture can produce outsized output. Levels' 10-year audience build also reminds Alloro that distribution compounds over years, not weeks.
- **Anti-Pattern:** Hiring people to do work that AI can do with proper context. Letting AI sessions start cold with no repo-level instructions. Treating CLAUDE.md (http://CLAUDE.md) as documentation instead of as load-bearing infrastructure that every session inherits.
- **Success Signals:** Lead: percentage of code commits where Claude Code produced the change with zero human edits. Lag: revenue per team member relative to comparable SaaS at similar stage.
- **Constants:** Autopilot, Clarity

## Tobi Lütke (Shopify)
- **Category:** SaaS
- **Core Principle:** Empower entrepreneurs with simple tools → category dominance.
- **Agent Heuristic:** Build rails so doctors feel empowered, not trapped.
- **Why Alloro Cares:** Specialists are entrepreneurs in disguise.
- **Anti-Pattern:** Lock-in over empowerment.
- **Success Signals:** Leading: Time to value <br>• Lagging: Expansion revenue
- **Constants:** Clarity, Autopilot
- **Related Anchors:** Steve Jobs (Apple), Adam Guild (Owner.com)

Body: Lütke turned Shopify into the backbone of SMB commerce by making entrepreneurship accessible. Alloro should empower specialists in the same way — remove barriers and make success inevitable.

## Tom Bilyeu (Quest Nutrition / Impact Theory)
- **Category:** SaaS
- **Core Principle:** Build movements, not products.
- **Agent Heuristic:** Frame Alloro as a mission, not just a tool.
- **Why Alloro Cares:** Specialists want to belong, not be sold.
- **Anti-Pattern:** Transactional SaaS.
- **Success Signals:** Leading: Referral rate <br>• Lagging: Community engagement
- **Constants:** Hospitality, Clarity
- **Related Anchors:** Robert Cialdini, Brian Chesky (Airbnb), Reed Hastings (Netflix)

Body: Bilyeu scaled Quest by turning nutrition into a movement. Alloro should inspire doctors to feel like they're joining a revolution in healthcare ownership.

---

## Sales

## Alex Hormozi
- **Category:** Sales
- **Core Principle:** Value is the stack of proof, guarantees, and relief vs cost.
- **Agent Heuristic:** When facing hesitation, add guarantees or direct proof until value is undeniable.
- **Why Alloro Cares:** Doctors resist sales tactics; guarantees + proof lower risk.
- **Anti-Pattern:** Closing without risk reversal.
- **Success Signals:** Leading: Objection handling conversion rate <br>• Lagging: Churn reduction
- **Constants:** Proof, Autopilot
- **Related Anchors:** Robert Cialdini, Theranos, Adam Guild (Owner.com), Brian Halligan & Dharmesh Shah (HubSpot), Patrick Campbell (ProfitWell), Peter Drucker, Marc Andreessen (a16z)

Body: Hormozi reframes sales as de-risking. For Alloro, that means offering "proof-first" demos, risk reversals, and clear guarantees.

## Alex Hormozi
- **Category:** Sales
- **Core Principle:** Make the offer so good they feel stupid saying no. The Grand Slam Offer: dream outcome x high perceived likelihood x low time delay x low effort. Price against the cost of inaction, not against competitors.
- **Agent Heuristic:** Always ask: what would make this offer feel stupid to refuse? Then build toward that. The Free Referral Base Checkup is the lead magnet. The 90-day guarantee is the risk reversal. If a prospect hesitates, the offer is not strong enough yet.
- **Why Alloro Cares:** At $14K MRR, Alloro needs its offer to convert cold prospects at AAE with no relationship. The Checkup is the Hormozi lead magnet. Every element of the AAE offer stack should pass: would they feel stupid saying no?
- **Anti-Pattern:** Selling features before quantifying the cost of the problem. Competing on price instead of reframing value against the cost of inaction.
- **Success Signals:** Lead: Checkup conversion rate. Lag: MRR from AAE leads within 90 days.
- **Constants:** Proof, Clarity

## Bob Moesta / Jobs to Be Done
- **Category:** Sales
- **Core Principle:** People do not buy products. They hire them to make progress in a specific situation. Every purchase has four forces: push of the current situation (dissatisfaction), pull of the new solution (attraction), anxiety about the new solution (fear), and habit of the current behavior (inertia). The sale happens when push plus pull exceed anxiety plus habit. Understanding what a customer is firing when they hire you is as important as knowing what they want.
- **Agent Heuristic:** Before any sales conversation or content piece: what is the doctor firing when they hire Alloro? What situation has become so uncomfortable that they are ready to change? The answer to that question determines the opening of every sales interaction. Hormozi builds the offer. Moesta identifies the moment the customer is ready to receive it.
- **Why Alloro Cares:** The Fireflies transcripts show doctors in different hiring moments. Kargoli was fired by his previous situation. Shawn wants to grow. Garrison wants rankings. Each is a different job. The sales motion must match the job, not just the product.
- **Anti-Pattern:** Selling to doctors who have not yet experienced the push of their current situation. Describing Alloro's features before understanding what job the doctor is trying to get done. Assuming every doctor hires Alloro for the same reason.
- **Success Signals:** Lead: sales rep can articulate the specific push event that created the opening for each prospect. Lag: conversion rate from first conversation to Checkup completion.
- **Constants:** Clarity, Proof

## Dale Carnegie
- **Category:** Sales
- **Core Principle:** Influence begins with genuine care.
- **Agent Heuristic:** Begin every sales interaction by listening first.
- **Why Alloro Cares:** Specialists see through scripts; authenticity wins.
- **Anti-Pattern:** Pitch before understanding.
- **Success Signals:** Leading: First-call conversion <br>• Lagging: Retention rate
- **Constants:** Proof, Hospitality
- **Related Anchors:** Robert Cialdini

Body: Carnegie's "How to Win Friends" remains timeless. For Alloro, empathy and listening must precede every offer.

## Mark Roberge / HubSpot + The Sales Acceleration Formula
- **Category:** Sales
- **Core Principle:** Sales is a science, not an art. Build the sales process like a product: define the inputs, measure the outputs, run experiments, and iterate based on data. The sales hiring formula: identify the predictive attributes of your best performers and hire exclusively to those attributes. The sales coaching formula: record every call, score every call against the defined framework, and coach to the pattern — not the exception.
- **Agent Heuristic:** What are the measurable criteria that predict whether a sales conversation will convert? What does a PASS interaction look like versus a DRIFT? Until 50 interactions are scored, the answer is a hypothesis. After 50 scored interactions, it is data. The CRO Agent's PASS/DRIFT/VIOLATION framework is the scoring mechanism. It needs interactions to score.
- **Why Alloro Cares:** Corey running 20 pitch reps before AAE is the Roberge method in practice. The founder proves the motion first. Then it gets codified. Then it gets transferred. The CRO Agent encodes the codified version. But the 20 reps have to happen first.
- **Anti-Pattern:** Hiring sales people before the founder has personally proven the motion. Coaching based on opinion instead of call scores. Changing the sales process based on one lost deal instead of a pattern across many.
- **Success Signals:** Lead: number of scored sales interactions with measurable pattern data. Lag: sales cycle length and close rate trend over 30 interactions.
- **Constants:** Clarity, Autopilot

## Peter Drucker
- **Category:** Sales
- **Core Principle:** What gets measured gets managed.
- **Agent Heuristic:** Always tie outcomes to visible metrics.
- **Why Alloro Cares:** Specialists need visible proof of outcomes.
- **Anti-Pattern:** Fluffy claims.
- **Success Signals:** Leading: Report accuracy <br>• Lagging: Adoption rate
- **Constants:** Proof, Clarity
- **Related Anchors:** Andy Grove (Intel), Alex Hormozi, Jeff Bezos (Amazon), Steve Jobs (Apple)

Body: Drucker is the father of management clarity. Alloro must measure and report what matters to doctors — visible proof of growth.

## Stephen Covey
- **Category:** Sales
- **Core Principle:** Trust is the currency of leadership.
- **Agent Heuristic:** Prioritize credibility over speed.
- **Why Alloro Cares:** Specialists will only follow a partner they trust.
- **Anti-Pattern:** Overpromising for growth.
- **Success Signals:** Leading: Trust survey scores <br>• Lagging: Retention rate
- **Constants:** Proof, Hospitality
- **Related Anchors:** Satya Nadella (Microsoft), Jonathan Haidt

Body: Covey taught principle-centered leadership. For Alloro, every touchpoint must reinforce credibility, never hype.

---

## Visionary

## Andy Grove (Intel)
- **Category:** Visionary
- **Core Principle:** Only the paranoid survive.
- **Agent Heuristic:** Pre-mortem every feature → assume it fails, why?
- **Why Alloro Cares:** Category creation requires anticipating threats.
- **Anti-Pattern:** Blind optimism.
- **Success Signals:** Leading: Frequency of pre-mortems <br>• Lagging: Failure rates avoided
- **Constants:** Proof, Clarity
- **Related Anchors:** Frank Slootman (Snowflake, ServiceNow), Peter Drucker, Jason Lemkin (SaaStr)

Body: Grove scaled Intel by treating paranoia as strategy. Alloro must anticipate competitors, market skepticism, and regulatory shifts before they happen. Pre-mortems keep us ahead of surprises.

## Elon Musk / Tesla + SpaceX
- **Category:** Visionary
- **Core Principle:** The Algorithm — in strict order: (1) Question every requirement. Every requirement should have a name attached. If you cannot question it, you cannot delete it. (2) Delete every part and process you can. You will be wrong sometimes. That is less bad than keeping something unnecessary. (3) Simplify and optimize what remains. Not before. (4) Accelerate cycle time. Only after simplification. (5) Automate. Only last. First principles reasoning: reason from physics, not analogy. The idiot index: if something costs 10x what the materials cost, that is an idiot tax.
- **Agent Heuristic:** Before producing any output, run the algorithm: Is this task necessary at all? (Question.) Can any part of it be removed? (Delete.) Is what remains as simple as possible? (Simplify.) Only then: execute quickly. Only then: encode into the agent system. The reactive mode problem — deploying emails before the list existed, designing banners before vector files existed — is an algorithm failure. Steps 4 and 5 were run before steps 1, 2, and 3.
- **Why Alloro Cares:** Every session where execution happened before the upstream question was answered is a Musk algorithm failure. The algorithm is the operating discipline that makes Command the Message structurally enforceable. Question: does this need to exist? Delete: remove what doesn't. Simplify: make what remains obvious. Accelerate: execute fast. Automate: encode into agents. In that order. Every time.
- **Anti-Pattern:** Automating something that should not exist. Optimizing a flawed process instead of deleting it. Accepting requirements without questioning them. Moving to execution before simplification. Building complexity on top of an incomplete foundation and calling it progress.
- **Success Signals:** Lead: ratio of tasks questioned and deleted before execution versus tasks executed on first request. Lag: reduction in rework, correction, and reactive firefighting over 90 days.
- **Constants:** Clarity, Autopilot

## Jeff Bezos (Amazon)
- **Category:** Visionary
- **Core Principle:** Obsess over the customer, not competitors.
- **Agent Heuristic:** Always design from the doctor backward.
- **Why Alloro Cares:** Specialists don't care about tech wars — they care about patient growth.
- **Anti-Pattern:** Chasing features because "competitors have them."
- **Success Signals:** Leading: Customer satisfaction scores <br>• Lagging: Retention rate
- **Constants:** Proof, Hospitality
- **Related Anchors:** Peter Drucker, Satya Nadella (Microsoft)

Body: Bezos built Amazon by centering every decision on the customer, not the market noise. For Alloro, the doctor is the customer. Their success — more patients, less stress — must drive every product decision, not "keeping up with other SaaS."

## Jeff Bezos / Amazon
- **Category:** Visionary
- **Core Principle:** The flywheel compounds invisibly until it doesn't. Work backwards from the customer experience — write the press release and FAQ before building anything. Day 1 mentality: the moment you think you've arrived, you're in Day 2 and dying. Separate reversible from irreversible decisions: move fast on Type 2 decisions, slow and deliberate on Type 1. High standards are contagious and self-reinforcing once established.
- **Agent Heuristic:** Before building any feature or producing any output: what is the specific customer experience we are working backwards from? Write the press release first. What would the doctor say in a testimonial if this worked perfectly? Build toward that. Is this a reversible decision (move fast) or irreversible (slow down and think)? Irreversible decisions at Alloro include: pricing structure, positioning, the named framework, the guarantee. Reversible decisions include: content drafts, CS plays, email sequences.
- **Why Alloro Cares:** The Alloro flywheel was designed tonight: call data improves the Lattice, the Lattice improves agents, agents improve interactions, interactions generate more data. This is the Bezos compound engine. Working backwards from 'what does a doctor feel when Alloro works perfectly' has never been formally answered. That answer is the foundation every product decision should be built on.
- **Anti-Pattern:** Day 2 thinking: assuming the current product, positioning, or process is good enough and optimizing around the edges instead of starting from the customer experience. Making irreversible decisions at Type 2 speed. Building features nobody asked for because they seemed logical internally. Confusing activity with progress.
- **Success Signals:** Lead: every product decision can be traced back to a specific customer experience statement. Lag: NRR above 120%, unsolicited referrals from existing clients.
- **Constants:** Clarity, Hospitality, Autopilot

## Marc Andreessen (a16z)
- **Category:** Visionary
- **Core Principle:** Timing is everything — software eats the world. Timing and bold category creation drive outsized outcomes.
- **Agent Heuristic:** If timing isn't right, even the best idea fails.
- **Why Alloro Cares:** Healthcare SaaS adoption curve is accelerating — the window is now. We must own the narrative that a new category exists: specialist growth SaaS.
- **Anti-Pattern:** Building ahead of adoption readiness.
- **Success Signals:** Leading: Speed of category uptake <br>• Lagging: ARR growth
- **Constants:** Proof, Clarity, Autopilot
- **Related Anchors:** Steve Jobs (Apple), Adam Guild (Owner.com), Sam Altman (OpenAI), Kodak, Jason Lemkin (SaaStr), Alex Hormozi

Body: Andreessen is the ultimate evangelist of timing. Alloro must strike while healthcare specialists are desperate for clarity and autonomy — not before, not after.
**Themes = Category Creation, Differentiation, Moat**.

## Reed Hastings (Netflix)
- **Category:** Visionary
- **Core Principle:** Culture of freedom & responsibility scales better than bureaucracy.
- **Agent Heuristic:** Default to trust → minimize policies.
- **Why Alloro Cares:** A lean team must be empowered to act decisively.
- **Anti-Pattern:** Micromanagement.
- **Success Signals:** Leading: Speed of decisions <br>• Lagging: Employee retention
- **Constants:** Autopilot, Hospitality
- **Related Anchors:** Brian Chesky (Airbnb), Tom Bilyeu (Quest Nutrition / Impact Theory)

Body: Netflix scaled by trusting smart people to act. Alloro can't afford bloat or layers of approval. Empower the team with clarity and guardrails, then let them move.

## Satya Nadella (Microsoft)
- **Category:** Visionary
- **Core Principle:** Lead with empathy, scale with clarity.
- **Agent Heuristic:** Begin every decision with: "What would this feel like for the doctor?"
- **Why Alloro Cares:** Specialists feel overwhelmed; empathy earns adoption.
- **Anti-Pattern:** Treating users as revenue, not people.
- **Success Signals:** Leading: NPS <br>• Lagging: Market adoption rates
- **Constants:** Proof, Hospitality
- **Related Anchors:** Nick Mehta (Gainsight), Brian Chesky (Airbnb), Frank Slootman (Snowflake, ServiceNow), Jonathan Haidt, Stephen Covey, Lincoln Murphy, Jeff Bezos (Amazon)

Body: Nadella revived Microsoft by pairing empathy with clear execution. Alloro must do the same: understand specialists' pain, then solve it with precision and clarity.

## Simon Sinek / Start With Why
- **Category:** Visionary
- **Core Principle:** People do not buy what you do. They buy why you do it. The Golden Circle: Why (purpose) → How (process) → What (product). Most companies communicate from the outside in: here is what we do, here is how we do it. The companies that inspire and lead communicate from the inside out: here is why we exist, and everything else follows. The why is not about profit. It is about belief. People who share your belief buy from you and refer others not because of what you make but because of what you stand for.
- **Agent Heuristic:** Every piece of Alloro content, every sales conversation, every product experience must start with the why: too many brilliant people built something real and are being destroyed by the business side they never signed up for. That is not a market observation. That is a belief. Start there. Every time.
- **Why Alloro Cares:** Every current Alloro message leads with what. The ICP Positioning Canvas defines the why. The why is Dr. Pavan. The why is the brilliant periodontist who is about to quit. The why is every doctor who spent a decade building something real and is now drowning in the business they never wanted to run. That why, stated clearly and believed deeply, is more compelling than any product demo.
- **Anti-Pattern:** Leading with product features. Starting the sales conversation with what Alloro tracks or monitors. Any content that describes the product before describing the problem it was built to solve. The banner that says 'referral intelligence platform' instead of 'you didn't build this to give it away.'
- **Success Signals:** Lead: does the first sentence of any Alloro communication describe the why before the what? Lag: percentage of first conversations where the doctor says 'that is exactly how I feel' before the product is mentioned.
- **Constants:** Clarity, Hospitality

## Steve Jobs (Apple)
- **Category:** Visionary
- **Core Principle:** Simplicity is the ultimate sophistication. Simplicity creates inevitable category dominance.
- **Agent Heuristic:** If the explanation requires more than one sentence, simplify until it's obvious. If it doesn't define a new category, it's clutter.
- **Why Alloro Cares:** Doctors are overwhelmed — simple clarity differentiates Alloro. Alloro must create the category of autopilot growth, not compete in the agency noise pool.
- **Anti-Pattern:** Feature-bloat, jargon, complexity.
- **Success Signals:** Leading: Demo watch-through rate <br>• Lagging: Demo → client conversion rate
- **Constants:** Proof, Clarity, Autopilot
- **Related Anchors:** Adam Guild (Owner.com), Marc Andreessen (a16z), Tobi Lütke (Shopify), Dan Pink, Juicero, Blockbuster, Jason Lemkin (SaaStr), Peter Drucker

Body: Jobs built Apple by removing clutter until what was left felt inevitable. For Alloro, every interaction with doctors must feel that clear. Complexity signals "agency fluff." Clarity signals "autopilot."<br><br>**Themes = Category Creation, Differentiation, Moat**.

## Sun Tzu / The Art of War
- **Category:** Visionary
- **Core Principle:** Every battle is won before it is fought. The general who wins controls terrain, timing, and conditions of engagement before the first move. Victory is the result of preparation, not reaction. The supreme art of war is to subdue the enemy without fighting.
- **Agent Heuristic:** Before producing any output, ask: is the upstream condition met? Has the frame been established? Is the infrastructure ready? If the answer to any of these is no, build the upstream condition first. Never deploy a tactic into an uncontrolled field.
- **Why Alloro Cares:** Command the Message is Alloro's operating principle at every layer. Doctors should arrive at every Alloro touchpoint already inside the frame. The booth is confirmation, not introduction. The CS call confirms what the client already expects. The weekly report continues a story that was already told.
- **Anti-Pattern:** Reacting to the market instead of shaping it. Deploying tactics before the strategic frame is established. Building the booth before building the message that precedes the booth. Treating urgency as a reason to skip upstream conditions.
- **Success Signals:** Lead: ratio of interactions where the doctor already understood Alloro's frame before the conversation started. Lag: conversion rate from first touchpoint to closed account.
- **Constants:** Clarity, Autopilot

## Tom Bilyeu / Impact Theory
- **Category:** Visionary
- **Core Principle:** Identity first. Decisions made from fear look like strategy but compound in the wrong direction. Everything is economic in nature -- all human behavior maps to incentives, consequences, and timeline. The biological layer (core needs: safety, belonging, purpose, status) sits underneath economic behavior. Follow the incentives to their end state and you understand any system. Life is simple: strip away the noise and what remains is people trying to meet core needs while avoiding economic loss.
- **Agent Heuristic:** Before producing any output, run two filters: (1) Which core human need does this address -- safety, belonging, purpose, or status? (2) What is the economic consequence if this need goes unmet at 30, 90, and 365 days? A finding without both is data. A finding with both is intelligence. Then ask: Is this decision consistent with who Alloro is becoming, or is it a fear-based response to short-term pressure? Fear-based decisions are often disguised as pivots.
- **Why Alloro Cares:** The doctor's anxiety is economic. The GP who went quiet represents $18,000/year. The ranking drop represents 15-20% of new patient acquisition. But underneath the dollar figure is a safety need -- am I losing ground I don't know about? Alloro's job is to meet the safety need first (here is what is true) then the status need (here is how you compare) then give one action. The transaction is fractal: patient pays doctor for what they cannot diagnose themselves. Doctor pays Alloro for what they cannot see themselves. Corey pays Claude for what he cannot build himself. Same need, same exchange, every level.
- **Anti-Pattern:** Making fear-driven product or positioning changes in response to a single client complaint or slow month. Producing outputs that are accurate but don't address a core need -- accurate but irrelevant is noise. Adding complexity to a problem that is actually simple. Forgetting that the doctor opening Alloro at 10pm is operating from mild threat state (safety need) -- the product must meet that need before delivering any intelligence.
- **Success Signals:** Lead: ratio of outputs that identify both a core need AND an economic consequence vs. outputs that identify neither. Lag: TTFV yes rate (did we meet the safety need fast enough to create clarity?). Monday email reply rate (did we say something true enough to provoke a response?).
- **Constants:** Clarity
