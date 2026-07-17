export const FIXTURE_IDS = {
  adminUser: 900_001,
  clientUser: 900_002,
  organization: 900_001,
  organizationUser: 900_001,
  location: 900_001,
  googleConnection: 900_001,
  googleProperty: 900_001,
  review: "90000000-0000-4000-8000-000000000001",
} as const;

export const FIXTURE_IDENTITIES = {
  adminEmail: "worktree-admin@getalloro.com",
  clientEmail: "worktree-client@example.test",
  organizationName: "One Endodontics (Synthetic Worktree)",
  organizationDomain: "one-endodontics.worktree.test",
  locationName: "One Endodontics Test Office",
} as const;
