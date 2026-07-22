# Website lever universe — the site is the hub for ALL 3 gates (2026-07-21)

> **The Alloro-hosted website is a lever in Get Found *and* Considered *and* Chosen** — the funnel model under-files it as get-considered-only (B1–B6). Exhaustive lever set with grounded build-state (verified vs code + `docs/capability-ledger.md`). Companion to `gap-reconciliation-2026-07-21.md` (extends it, doesn't twin). Renderer-repo items are **CAN'T-VERIFY** (the `website-renderer` black box — the #1 unblock; it gates crawl→found, speed/CRO→considered, event measurement→all). DRAFT.
> **State key:** BUILT · PARTIAL · GAP · DEFERRED · CAN'T-VERIFY (renderer).

## A. Technical / HTML foundation (crawl + extractability — affects all gates)
| Lever | Gate(s) | State |
|---|---|---|
| Structured data / schema.org | Found (AEO) | **BUILT, extensive** — Dentist/Endodontist/Orthodontist/MedicalBusiness, AggregateRating, FAQPage, BreadcrumbList, Offer, Service, WebSite, Question/Answer, PostalAddress |
| Entity graph (`sameAs`, Organization) | Found | **PARTIAL** — identity-context built; `sameAs` to health directories absent |
| **Server-side render (crawlability)** | Found | **CAN'T-VERIFY** — the black box. If client-rendered, all on-page SEO is invisible to AI/Google |
| robots.txt (allow the *search* bots) | Found | **GAP** — allow OAI-SearchBot/PerplexityBot/Googlebot; training bots block-able |
| Meta title / description | Found/Considered | **BUILT** (seo-generation + `seo_data`) |
| Natural-language URL slugs | Found | **BUILT** (8.67-pt AI-citation lift) |
| Sitemap / canonical / redirects / status codes | Found | **PARTIAL** — htmlValidator + linkChecker exist; renderer owns the served output |
| HTML validity / semantic markup | Found | **BUILT** — htmlValidator + agenticHtmlPipeline |
| Core Web Vitals / speed / mobile UX | Considered | **GAP / CAN'T-VERIFY** — renderer; no CWV lever |
| Image optimization / alt text | Found/Considered | verify |
| Internal linking | Found | **PARTIAL** — linkChecker (checks), not an optimizer |

## B. Content — SEO + AEO (the answers)
| Lever | Gate(s) | State |
|---|---|---|
| Page-per-service / page-per-town (geo pages) | Found | **GAP** |
| GSC→content loop (real demand→pages) | Found | **BUILT/SHIPPED** (A1) — verify still runs |
| **Big-5 / TAYA answer content** (cost, insurance, downsides, comparisons, best-of) | **Found (AEO) + Considered (trust)** | **GAP — the #1 add, dual-gate.** FAQ *schema* built; answer *content* not generated (slot-prefill returns null for insurance) |
| Answer-first formatting / extractable specifics | Found (AEO) | **PARTIAL** (answer-first lint) |
| Blog / educational / topical authority | Found | **PARTIAL** — CMS (Post/Category/Tag/Menu) built; content→outcome unmeasured |
| E-E-A-T / credentialed authorship + medical review | Found/Considered | **PARTIAL** — identity-context; named-author depth = gap |
| Freshness / content updates | Found | verify |

## C. Off-page / links
| Lever | Gate(s) | State |
|---|---|---|
| Backlinks | Found (authority) | **DEFERRED** (lower-value: brand mentions beat backlinks ~3:1 for AI) |
| Off-site brand mentions | Found (AEO — strongest signal) | **GAP** |
| Directory citations / NAP (Bing/Apple/Yelp/Foursquare/health dirs) | Found | **GAP** — observe-only; the off-Google presence |

## D. Get-considered (trust conversion on the site)
| Lever | Gate | State |
|---|---|---|
| Trust signals (credentials, real photos, named providers) | Considered | **PARTIAL** (B3 absent; identity-context partial) |
| On-page review *text* display (social proof) | Considered | **GAP** |
| Insurance / cost clarity | Considered | **GAP** (first-filter; part of the Big-5) |
| Message-match / cohesion | Considered | **GAP** (D1, staged last) |
| CRO copy / voice | Considered | **PARTIAL** (B2 dormant/unwired) |
| Visual design / professionalism | Considered | **BUILT** (builder) |

## E. Get-chosen (conversion mechanics)
| Lever | Gate | State |
|---|---|---|
| Form (the raised hand) | Chosen | **BUILT** — formSubmissionController + source capture (M0) |
| Form security (honeypot / rate-limit) | Chosen | **PARTIAL** — `websiteContactProtection` middleware exists; C1 = re-enable the fuller pipeline |
| Form UX / friction (field count, multi-step) | Chosen | **GAP** |
| Phone CTA / **click-to-call** | Chosen | **BUILT (surface)** — `website_header_phone_ctas`; **GAP = measuring/attributing the call** (the emergency-journey point — the button exists, the count/attribution doesn't) |
| Request-a-time as a submission | Chosen | **GAP** (C2, staged) |
| Post-submit reassurance (on-page) | Chosen | **GAP** — in-lane half dropped (distinct from the out-of-lane auto-responder) |
| Sticky / floating CTA | Chosen | verify |

## F. Measurement (on the site)
| Lever | Gate | State |
|---|---|---|
| Analytics instrumentation (Rybbit) | all | **PARTIAL** (B1, disabled / preview-only) |
| Conversion events (form-view, contact-click) | all | **GAP** (B1-R, renderer-blocked) |
| Source attribution | all | **BUILT (capture)** (M0, PR'd); read-side inert (seam 7) |
| A/B testing | Considered | **GAP** (E1, staged last) |

## The honest headline
The builder is **more complete than the gap-hunt implied** — extensive schema, forms + security middleware + phone CTAs + a full CMS + HTML validator + link checker are built. The real, concentrated gaps: **(1) Big-5 answer CONTENT (dual-gate #1); (2) SSR/crawlability verification (the renderer black box — gates everything); (3) robots-bot-config + off-Google citations/mentions/backlinks (off-page found); (4) on-page reviews + insurance/cost + form-UX + post-submit reassurance (considered/chosen); (5) the measurement read-side (seam 7 inert) + call attribution.** The master unblock stays **renderer access** — it gates crawl (found), speed/CRO (considered), and events (all).
