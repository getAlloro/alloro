/**
 * Lead-email quality gate for the auto-responder (PARTIAL backscatter mitigation).
 *
 * The Responder emails whatever address a visitor typed into a form. If that
 * address is disposable/throwaway or malformed, auto-replying to it wastes sends
 * and can poison the shared sending domain's reputation (backscatter). This is a
 * conservative pre-send filter: it blocks only the UNAMBIGUOUS junk (bad syntax
 * or a known disposable/temp-mail domain), so it should never skip a real lead.
 *
 * NOTE: this is NOT the complete backscatter fix. The full fix is re-enabling the
 * form's own spam defenses (honeypot / timing / flood / duplicate — currently
 * disabled) and, ideally, an MX check on the domain. Those are Dave's call. This
 * gate is a cheap, safe first layer that REDUCES (not eliminates) auto-replies to
 * junk addresses. Surfaced by the 2026-07-13 brain-sweep (Clearout/Warmy pattern).
 */

// A starter list of common disposable / temp-mail domains. Deliberately small and
// high-confidence so it never blocks a real provider; extend as needed.
const DISPOSABLE_DOMAINS = new Set<string>([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.info",
  "sharklasers.com",
  "10minutemail.com",
  "tempmail.com",
  "temp-mail.org",
  "throwawaymail.com",
  "yopmail.com",
  "getnada.com",
  "trashmail.com",
  "maildrop.cc",
  "dispostable.com",
  "fakeinbox.com",
  "mintemail.com",
  "mohmal.com",
  "spam4.me",
  "grr.la",
  "emailondeck.com",
  "moakt.com",
]);

// Strict: exactly one "@", a dotted domain, no whitespace, TLD of 2+ letters.
const STRICT_EMAIL = /^[^\s@]+@([^\s@.]+\.)+[a-z]{2,}$/i;

/**
 * True only when the address is plausibly a real, deliverable inbox — i.e. safe
 * to auto-reply to. Returns false for malformed or disposable addresses.
 * Conservative by design: it blocks only unambiguous junk, so a real lead is
 * never skipped (one junk send is a smaller cost than dropping a real reply).
 */
export function isLikelyDeliverableLeadEmail(
  email: string | null | undefined
): boolean {
  if (!email || typeof email !== "string") return false;
  const normalized = email.trim().toLowerCase();
  if (!STRICT_EMAIL.test(normalized)) return false;
  const domain = normalized.slice(normalized.lastIndexOf("@") + 1);
  if (DISPOSABLE_DOMAINS.has(domain)) return false;
  return true;
}
