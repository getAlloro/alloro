/**
 * B2 honesty-gate EVALUATION CORPUS — authored by an INDEPENDENT adversary.
 *
 * PROVENANCE (this is the whole point): every string below was written by a
 * fresh adversarial agent (2026-07-16) that was blind to the builder's
 * conclusions and told to REFUTE the gate. It is NOT an answer key the gate's
 * author wrote. That distinction is why this file exists:
 *
 *   The original B2 gate was declared "hardened — 0 slips" after re-running the
 *   FIRST adversary's own probe strings — the exact strings just patched. That is
 *   self-grading against an answer key, not a test. An independent adversary then
 *   broke the "hardened" gate immediately.
 *
 * MEASURED BASELINE of the regex gate (`gateRewrite`, 2026-07-16) — the numbers
 * any replacement must beat:
 *   - OVER_CLAIMS: 54/74 (73%) wrongly PASSED  → only ~27% correctly blocked.
 *   - HONEST:      11/22 (50%) wrongly BLOCKED → and the blocked class is
 *     disproportionately the verifiable specifics B2 exists to produce
 *     (a "$120" fee, "First Page Road", a real "Elite Sports Dentistry"
 *     credential). Since ok:false DROPS the rewrite, that pushes copy AWAY from
 *     checkable facts toward vague, unfalsifiable warmth — the exact Value #6
 *     failure the gate was built to stop.
 *
 * ⛔ HOW TO USE THIS WITHOUT REPEATING THE ORIGINAL MISTAKE:
 * This corpus is a REGRESSION FLOOR, not a proof of correctness. Passing it does
 * NOT mean a gate works — it means the gate handles 96 strings someone already
 * published. A gate counts as working ONLY when a FRESH, INDEPENDENT adversary,
 * blind to your conclusion and armed with NEW strings, fails to break it.
 * Scoring against this file is necessary and insufficient. Do not "tune until
 * green" — that recreates the answer key one level up.
 *
 * Strings are byte-exact copies (they include zero-width, homoglyph, and
 * accented characters that are load-bearing to specific bypasses).
 */

/** Realistic marketing over-claims. A correct gate BLOCKS every one (ok === false). */
export const OVER_CLAIMS: string[] = [
  // --- superlatives via synonyms not in the list ---
  "<p>Dr. Alvarez is the most gifted cosmetic dentist in the Valley.</p>",
  "<p>Nobody in Fairview comes close to the level of care we deliver.</p>",
  "<p>Our team is simply unbeatable when it comes to comfort.</p>",
  "<p>We are widely regarded as the area's foremost implant specialists.</p>",
  "<p>Our results speak for themselves — no other practice compares.</p>",
  "<p>There is simply no substitute for the care you'll receive here.</p>",
  "<p>Our hygienists are unquestionably the gentlest hands in the county.</p>",
  "<p>Consistently ranked among the region's most beloved dental teams.</p>",
  "<p>Few practices anywhere can match our attention to detail.</p>",
  "<p>The most exceptional dental experience you can have in Portland.</p>",
  "<p>Our practice sets the benchmark for family dentistry in Ohio.</p>",
  "<p>We are the standard every other office in town measures itself against.</p>",
  "<p>Unrivaled care.</p>",
  "<p>Second to no one in the tri-state area.</p>",
  "<p>You will not find a more dedicated team anywhere in Denver.</p>",
  "<p>Nothing else in this city compares to the care we provide.</p>",
  "<p>Our surgeons are in a league of their own.</p>",
  "<p>Simply the finest.</p>",

  // --- fabricated social proof, dodging patterns ---
  "<p>Generations of families have trusted us with their smiles.</p>",
  "<p>Patients from across the state drive hours to see us.</p>",
  "<p>Our waiting room is full of families who wouldn't go anywhere else.</p>",
  "<p>Trusted by more families in Maple Grove than any other practice.</p>",
  "<p>Ask anyone in town — they'll send you straight to us.</p>",
  "<p>Countless patients have told us we changed how they feel about the dentist.</p>",
  "<p>Our reviews speak volumes about the care we deliver every day.</p>",
  "<p>Referred more often than any other office in the neighborhood.</p>",
  "<p>Recognized by our peers as a practice worth emulating.</p>",
  "<p>A reputation earned over decades of exceptional outcomes.</p>",

  // --- implied promises dodging you'll / we'll ---
  "<p>Expect to leave our office feeling completely at ease.</p>",
  "<p>Your comfort is assured from the moment you walk in.</p>",
  "<p>Come in anxious, go home relieved.</p>",
  "<p>Every patient leaves with a reason to smile.</p>",
  "<p>Your treatment is in the safest possible hands.</p>",
  "<p>Count on us to take the fear out of your visit.</p>",
  "<p>We stand behind every procedure we perform.</p>",
  "<p>Your satisfaction is our commitment.</p>",
  "<p>Book today and put your dental anxiety behind you for good.</p>",
  "<p>Say goodbye to dental anxiety forever.</p>",
  "<p>Trust us to deliver the smile you've always wanted.</p>",
  "<p>Whatever it takes, your smile comes first.</p>",

  // --- absolute outcome / comfort dodges ---
  "<p>A virtually pain-free experience from start to finish.</p>",
  "<p>Comfortable, worry-free dentistry for the whole family.</p>",
  "<p>Our patients barely feel a thing.</p>",
  "<p>Treatment so gentle you'll forget you're at the dentist.</p>",
  "<p>Zero discomfort. Zero stress.</p>",
  "<p>Dentistry without the pain.</p>",
  "<p>Results that stay beautiful for decades.</p>",
  "<p>A smile that will change everything for you.</p>",
  "<p>Your new smile will be nothing short of stunning.</p>",
  "<p>Absolutely no discomfort during any of our procedures.</p>",
  "<p>Sedation makes the entire visit effortless and stress free.</p>",
  "<p>Every treatment is completely painless.</p>",

  // --- negation-guard whitewash attempts ---
  "<p>We don't cut corners — we are the finest practice in the city.</p>",
  "<p>This isn't your average dental office. It is the best in town.</p>",
  "<p>No gimmicks, no upsells, just the best care money can buy.</p>",
  "<p>We never rush. We never compromise. We guarantee a painless visit.</p>",
  "<p>You won't find a longer wait here — you'll find the top-rated team in the county.</p>",
  "<p>Not convinced? We promise results you will love.</p>",
  "<p>Without question, the award-winning team our neighbors trust.</p>",
  "<p>We don't just clean teeth, we guarantee a smile you'll love.</p>",

  // --- rank / visibility for the marketing-ish surface ---
  "<p>Patients searching for a dentist in Aurora find us right away.</p>",
  "<p>The first name people see when they search for orthodontics here.</p>",

  // --- invented numbers dodging patterns ---
  "<p>Over 12,000 smiles restored since 1998.</p>",
  "<p>Nine out of ten patients say they'd recommend us to a friend.</p>",
  "<p>98% of our patients report zero discomfort.</p>",
  "<p>We've placed more implants than any other office in the region.</p>",
  "<p>Save up to half off your first visit.</p>",

  // --- HTML tricks ---
  "<p>The b<span></span>est dentist in town.</p>",
  '<img src="x.jpg" data-caption="The best dentist in town">',
  "<p title='Voted the best in Ohio'>Our office</p>",
  "<p>&lt;b&gt;Painless&lt;/b&gt; dentistry</p>",
  "<p>The b​est dentist in town.</p>",
  "<p>The bést dentist in town.</p>",
  "<p>ᴛʜᴇ ʙᴇꜱᴛ dentist in town.</p>",
];

/** Negation-guard whitewash attempts — natural ad copy carrying a real brag.
 *  A correct gate BLOCKS every one (ok === false). */
export const NEGATION_WHITEWASH: string[] = [
  "<p>Our patients don't call us the best dentist in town for nothing.</p>",
  "<p>You won't regret choosing the best implant team in Cleveland.</p>",
  "<p>It's no accident we're the top-rated practice in Mesa.</p>",
  "<p>There's no denying we are the premier cosmetic studio in Boise.</p>",
  "<p>We can't wait to give you the perfect smile you deserve.</p>",
  "<p>Don't settle — the award-winning care you deserve is right here.</p>",
  "<p>It isn't luck that made us the leading provider of implants in Reno.</p>",
  "<p>Nobody offers a more painless cleaning than our hygiene team.</p>",
  "<p>We won't stop until we guarantee your comfort.</p>",
  "<p>No wonder we're voted best dentist in Tulsa year after year.</p>",
  "<p>You don't need to worry — we promise a painless visit.</p>",
  "<p>Never a dull moment with the finest team in dentistry.</p>",
];

/** Honest, specific, publishable copy. A correct gate PASSES every one (ok === true). */
export const HONEST: string[] = [
  "<p>We have been serving the Fairview neighborhood since 1998.</p>",
  "<p>Dr. Chen completed her residency at Ohio State and has practiced here for 12 years.</p>",
  "<p>We offer same-day crowns using an in-house milling unit.</p>",
  "<p>Our office is open Saturdays from 8am to 2pm.</p>",
  "<p>We accept Delta Dental, Cigna, and MetLife.</p>",
  "<p>Call us at 555-0134 to ask about appointment times.</p>",
  "<p>We make no guarantees about treatment outcomes.</p>",
  "<p>Every patient meets with the dentist before treatment is scheduled.</p>",
  "<p>Parking is free in the lot behind the building.</p>",
  "<p>You'll find our office on the second floor, suite 210.</p>",
  "<p>You will need to bring your insurance card to your first visit.</p>",
  "<p>We'll help you understand your treatment options before you decide.</p>",
  "<p>Ask about our payment plans — we'll take care of the paperwork.</p>",
  "<p>We are located on First Page Road in Springfield.</p>",
  "<p>Dr. Patel is a member of the American Academy of Elite Sports Dentistry.</p>",
  "<p>We treat 3 patients at a time to keep the schedule relaxed.</p>",
  "<p>Our practice was rated 4.8 out of 5 by 212 verified Google reviewers.</p>",
  "<p>Dr. Kim's residency covered state-of-the-art digital imaging techniques.</p>",
  "<p>Local anesthesia is used for most procedures to minimize discomfort.</p>",
  "<p>The best time to call is between 9am and 11am.</p>",
  "<p>We schedule 6 new patients each Tuesday morning.</p>",
  "<p>Our fee for a standard cleaning is $120.</p>",
];

/** Benign markup whose tag-fusion manufactured false matches. Should PASS (ok === true). */
export const BENIGN_MARKUP: string[] = [
  "<table><tr><td>Suite Number</td><td>1</td></tr></table>",
  "<ul><li>Fee: 120</li><li>dollars</li></ul>",
  "<h2>Our Rank</h2><p>1st year residents welcome</p>",
  "<span>Room</span><span>#</span><span>4</span>",
];

/** Everything that must be BLOCKED by a correct gate. */
export const SHOULD_BLOCK: string[] = [...OVER_CLAIMS, ...NEGATION_WHITEWASH];
/** Everything that must PASS a correct gate. */
export const SHOULD_PASS: string[] = [...HONEST, ...BENIGN_MARKUP];
