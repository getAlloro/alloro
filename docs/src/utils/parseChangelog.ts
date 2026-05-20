import type { ChangelogEntry } from "../types/docs";

const PAGE_KEYWORDS: Record<string, string[]> = {
  signin: ["sign in", "signin", "login", "authentication", "auth"],
  signup: ["sign up", "signup", "registration", "onboarding"],
  "forgot-password": ["forgot password", "password reset"],
  "practice-hub": ["dashboard", "focus", "practice hub", "overview", "hero", "trajectory"],
  "referrals-hub": ["pms", "referral", "patient journey", "revenue attribution"],
  "local-rankings": ["ranking", "local ranking", "maps", "serpapi", "competitor"],
  "todo-list": ["task", "to-do", "action queue"],
  notifications: ["notification", "alert"],
  "settings-integrations": ["integration", "gbp", "google business", "connect", "analytics"],
  "settings-users": ["user", "team", "member", "permission", "role"],
  "settings-billing": ["billing", "payment", "subscription", "stripe"],
  "settings-account": ["account", "profile"],
  website: ["website", "dfy", "page editor", "template"],
  support: ["support", "ticket", "help"],
};

export function parseChangelogMarkdown(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  const sections = markdown.split(/^## \[/m).slice(1);

  for (const section of sections) {
    const headerMatch = section.match(/^(\d+\.\d+\.\d+)\] - (.+)$/m);
    if (!headerMatch) continue;

    const version = headerMatch[1]!;
    const date = headerMatch[2]!;

    const titleMatch = section.match(/^### (.+)$/m);
    const title = titleMatch?.[1] ?? "Update";

    const bodyStart = section.indexOf("\n", section.indexOf("###"));
    const body = bodyStart >= 0 ? section.slice(bodyStart).trim() : "";
    const firstParagraph = body.split("\n\n")[0] ?? "";

    const pagesAffected = detectAffectedPages(section.toLowerCase());

    entries.push({
      version,
      date,
      title,
      summary: firstParagraph.replace(/\*\*/g, "").slice(0, 200),
      pagesAffected,
    });
  }

  return entries;
}

function detectAffectedPages(text: string): string[] {
  const affected: string[] = [];
  for (const [slug, keywords] of Object.entries(PAGE_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) {
      affected.push(slug);
    }
  }
  return affected;
}

export function getEntriesForPage(entries: ChangelogEntry[], slug: string): ChangelogEntry[] {
  return entries.filter((e) => e.pagesAffected.includes(slug));
}
