export const SCOPE_MAP = {
  gbp: "https://www.googleapis.com/auth/business.manage",
  gsc: "https://www.googleapis.com/auth/webmasters.readonly",
} as const;

export function parseScopes(scopeString: string | null | undefined): string[] {
  const raw = scopeString || "";

  let grantedScopes: string[] = [];
  if (raw.includes(" ")) {
    grantedScopes = raw.split(" ");
  } else if (raw.includes(",")) {
    grantedScopes = raw.split(",");
  } else if (raw.length > 0) {
    grantedScopes = [raw];
  }

  return grantedScopes
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0);
}

export function buildScopeStatus(normalizedScopes: string[]) {
  return {
    gbp: {
      granted: normalizedScopes.includes(SCOPE_MAP.gbp),
      scope: SCOPE_MAP.gbp,
      name: "Google Business Profile",
      description:
        "Manage business listings (used for read access and future review replies)",
    },
    gsc: {
      granted: normalizedScopes.includes(SCOPE_MAP.gsc),
      scope: SCOPE_MAP.gsc,
      name: "Google Search Console",
      description:
        "Read search performance data and site information",
    },
  };
}

export function getMissingScopes(
  scopeStatus: Record<string, { granted: boolean }>
): string[] {
  return Object.entries(scopeStatus)
    .filter(([_, status]) => !status.granted)
    .map(([key]) => key);
}
