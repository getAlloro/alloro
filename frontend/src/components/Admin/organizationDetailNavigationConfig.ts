export type OrganizationDetailSectionKey =
  | "subscription"
  | "users"
  | "pilot"
  | "connections"
  | "website"
  | "gbpAutomation"
  | "agent"
  | "settings";

export const ORGANIZATION_DETAIL_SECTION_KEYS: OrganizationDetailSectionKey[] = [
  "subscription",
  "users",
  "pilot",
  "connections",
  "website",
  "gbpAutomation",
  "agent",
  "settings",
];

export type OrganizationDetailSubmenuSectionKey =
  | "website"
  | "gbpAutomation"
  | "agent";

export const ORGANIZATION_DETAIL_AGENT_TAB_KEYS = [
  "tasks",
  "notifications",
  "rankings",
  "pms",
  "proofline",
  "summary",
  "opportunity",
  "cro",
  "referral",
] as const;

export type OrganizationDetailAgentTabKey =
  (typeof ORGANIZATION_DETAIL_AGENT_TAB_KEYS)[number];

export const ORGANIZATION_DETAIL_WEBSITE_TAB_KEYS = [
  "pages",
  "layouts",
  "code-manager",
  "media",
  "form-submissions",
  "posts",
  "menus",
  "reviews",
  "redirects",
  "integrations",
  "backups",
  "advanced-tools",
  "costs",
] as const;

export type OrganizationDetailWebsiteTabKey =
  (typeof ORGANIZATION_DETAIL_WEBSITE_TAB_KEYS)[number];

export const ORGANIZATION_DETAIL_GBP_TAB_KEYS = [
  "reviews",
  "posts",
  "settings",
] as const;

export type OrganizationDetailGbpTabKey =
  (typeof ORGANIZATION_DETAIL_GBP_TAB_KEYS)[number];

export function isOrganizationDetailSectionKey(
  value: string | null
): value is OrganizationDetailSectionKey {
  return ORGANIZATION_DETAIL_SECTION_KEYS.includes(
    value as OrganizationDetailSectionKey
  );
}

export function isOrganizationDetailAgentTabKey(
  value: string | null
): value is OrganizationDetailAgentTabKey {
  return ORGANIZATION_DETAIL_AGENT_TAB_KEYS.includes(
    value as OrganizationDetailAgentTabKey
  );
}

export function isOrganizationDetailWebsiteTabKey(
  value: string | null
): value is OrganizationDetailWebsiteTabKey {
  return ORGANIZATION_DETAIL_WEBSITE_TAB_KEYS.includes(
    value as OrganizationDetailWebsiteTabKey
  );
}

export function isOrganizationDetailGbpTabKey(
  value: string | null
): value is OrganizationDetailGbpTabKey {
  return ORGANIZATION_DETAIL_GBP_TAB_KEYS.includes(
    value as OrganizationDetailGbpTabKey
  );
}
