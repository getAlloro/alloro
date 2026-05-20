import type { DocCategory } from "../types/docs";

export interface PageMeta {
  slug: string;
  route: string;
  title: string;
  shortTitle: string;
  description: string;
  category: DocCategory;
}

export const PAGE_REGISTRY: PageMeta[] = [
  // Auth
  { slug: "signin", route: "/signin", title: "Sign In", shortTitle: "Sign In", description: "Log into your Alloro dashboard", category: "auth" },
  { slug: "signup", route: "/signup", title: "Sign Up", shortTitle: "Sign Up", description: "Create a new Alloro account", category: "auth" },
  { slug: "forgot-password", route: "/forgot-password", title: "Forgot Password", shortTitle: "Forgot Password", description: "Reset your password", category: "auth" },

  // Dashboard
  { slug: "practice-hub", route: "/dashboard", title: "Practice Hub", shortTitle: "Practice Hub", description: "Your at-a-glance practice overview with key metrics and actions", category: "dashboard" },
  { slug: "referrals-hub", route: "/pmsStatistics", title: "Referrals Hub", shortTitle: "Referrals Hub", description: "Track referral sources, revenue attribution, and patient flow", category: "dashboard" },
  { slug: "local-rankings", route: "/rankings", title: "Local Rankings", shortTitle: "Rankings", description: "Monitor your Google Maps rankings and competitor positions", category: "dashboard" },
  { slug: "todo-list", route: "/tasks", title: "To-Do List", shortTitle: "To-Do List", description: "Manage your recommended actions and tasks", category: "dashboard" },
  { slug: "notifications", route: "/notifications", title: "Notifications", shortTitle: "Notifications", description: "View alerts and updates about your practice", category: "dashboard" },

  // Settings
  { slug: "settings-integrations", route: "/settings/integrations", title: "Integrations", shortTitle: "Integrations", description: "Connect Google Business Profile, analytics, and other services", category: "settings" },
  { slug: "settings-users", route: "/settings/users", title: "Team Members", shortTitle: "Team", description: "Manage team access and permissions", category: "settings" },
  { slug: "settings-billing", route: "/settings/billing", title: "Billing", shortTitle: "Billing", description: "Manage your subscription and payment methods", category: "settings" },
  { slug: "settings-account", route: "/settings/account", title: "Account", shortTitle: "Account", description: "Update your profile and account settings", category: "settings" },

  // Features
  { slug: "website", route: "/dfy/website", title: "Your Website", shortTitle: "Website", description: "Preview and manage your Alloro-built practice website", category: "features" },

  // Help
  { slug: "support", route: "/help", title: "Support", shortTitle: "Support", description: "Submit and track support tickets", category: "help" },
];

export const CATEGORIES: { key: DocCategory; label: string }[] = [
  { key: "auth", label: "Authentication" },
  { key: "dashboard", label: "Dashboard" },
  { key: "settings", label: "Settings" },
  { key: "features", label: "Features" },
  { key: "help", label: "Help & Support" },
];

export function getPagesByCategory(category: DocCategory): PageMeta[] {
  return PAGE_REGISTRY.filter((p) => p.category === category);
}

export function getPageBySlug(slug: string): PageMeta | undefined {
  return PAGE_REGISTRY.find((p) => p.slug === slug);
}
