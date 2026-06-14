import { getValidOAuth2ClientByConnection } from "../../auth/oauth2Helper";
import { getGBPAIReadyData } from "../../controllers/gbp/GbpController";
import { GscDataModel } from "../../models/website-builder/GscDataModel";
import { GooglePropertyModel } from "../../models/GooglePropertyModel";
import { LocationModel } from "../../models/LocationModel";
import { OrganizationModel } from "../../models/OrganizationModel";
import { PageModel } from "../../models/website-builder/PageModel";
import { ProjectIdentityModel } from "../../models/website-builder/ProjectIdentityModel";
import { ProjectModel } from "../../models/website-builder/ProjectModel";
import { WebsiteIntegrationModel } from "../../models/website-builder/WebsiteIntegrationModel";
import type {
  ExtractedBusinessIdentity,
  OrganizationAuditContext,
} from "./types";

/**
 * Organizations eligible for a full audit: a website project with a resolvable
 * URL and at least one published page. Mirrors the audit's own NO_CONNECTED_SITE
 * gate so the picker never offers an org that would immediately hard-cap.
 */
export async function listAuditableOrganizationIds(): Promise<number[]> {
  return OrganizationModel.findAuditableIds();
}

export async function resolveOrganizationAuditContext(
  organizationId: number,
): Promise<OrganizationAuditContext> {
  const organization = await OrganizationModel.findById(organizationId);
  if (!organization) {
    throw new Error("Organization not found");
  }

  const project = await ProjectModel.findByOrganizationId(organizationId);
  const projectIdentity = project
    ? await ProjectIdentityModel.findByProjectId<Record<string, unknown>>(project.id)
    : null;
  const locations = await LocationModel.findByOrganizationId(organizationId);
  const locationContexts = await Promise.all(
    locations.map(async (location) => {
      const properties = await GooglePropertyModel.findByLocationId(location.id);
      const selected = properties.find((property) => property.type === "gbp" && property.selected)
        || properties.find((property) => property.type === "gbp")
        || null;
      const gbp = selected ? await fetchGbpData(selected) : { data: null, error: null };
      return {
        id: location.id,
        name: location.name,
        domain: location.domain,
        businessData: location.business_data,
        googlePropertyCount: properties.length,
        selectedGoogleProperty: selected
          ? {
              id: selected.id,
              accountId: selected.account_id,
              externalId: selected.external_id,
              googleConnectionId: selected.google_connection_id,
              displayName: selected.display_name,
            }
          : null,
        gbpData: gbp.data,
        gbpError: gbp.error,
      };
    }),
  );

  const projectUrl = project ? buildProjectUrl(project) : null;
  const publishedPages = project && projectUrl
    ? await PageModel.findPublishedByProjectId(project.id)
    : [];
  // Audit the most important pages first (home, then content, then legal/utility)
  // instead of the first 12 alphabetically — a large site should never have its
  // service pages skipped in favor of boilerplate.
  const pages = [...publishedPages]
    .sort(
      (a, b) =>
        pageImportanceRank(a.path) - pageImportanceRank(b.path) ||
        a.path.localeCompare(b.path),
    )
    .slice(0, 12)
    .map((page) => ({
      id: page.id,
      path: page.path,
      title: page.title,
      url: new URL(page.path || "/", projectUrl as string).toString(),
      importanceWeight: pageImportanceWeight(page.path),
      ...mapPageToLocation(page.path, page.title, locationContexts),
    }));

  return {
    organizationId,
    organizationName: organization.name,
    projectId: project?.id ?? null,
    projectUrl,
    projectIdentity: extractIdentityFromProject(organization.name, projectIdentity),
    locations: locationContexts,
    gsc: project ? await resolveGsc(project.id, pages.map((page) => page.url)) : {
      hasActiveIntegration: false,
      latestReportDate: null,
      rowsForUrls: {},
      error: "No website project connected",
    },
    pages,
    totalPublishedPages: publishedPages.length,
  };
}

function pageImportanceRank(path: string): number {
  const normalized = (path || "/").toLowerCase();
  if (normalized === "/" || normalized === "") return 0;
  if (isUtilityPath(normalized)) return 2;
  return 1;
}

/**
 * Relative weight of a page in the run-level score average. The homepage is the
 * primary entity/citation surface; legal/utility boilerplate shouldn't count as
 * much as a service page.
 */
function pageImportanceWeight(path: string): number {
  const rank = pageImportanceRank(path);
  if (rank === 0) return 2;
  if (rank === 2) return 0.5;
  return 1;
}

function isUtilityPath(path: string): boolean {
  return /legal|privacy|terms|accessibility|hipaa|disclaimer|cookie|sitemap|404/.test(path);
}

function buildProjectUrl(project: {
  custom_domain?: string | null;
  generated_hostname?: string | null;
  selected_website_url?: string | null;
}): string | null {
  if (project.custom_domain) return `https://${project.custom_domain}`;
  if (project.generated_hostname) {
    return `https://${project.generated_hostname}.sites.getalloro.com`;
  }
  return project.selected_website_url || null;
}

function extractIdentityFromProject(
  organizationName: string,
  identity: Record<string, unknown> | null,
): ExtractedBusinessIdentity {
  const business = objectValue(identity?.business);
  const locations = Array.isArray(identity?.locations) ? identity.locations : [];
  const firstLocation = objectValue(locations[0]);
  return {
    name: stringValue(business?.name) || organizationName,
    phone: stringValue(business?.phone) || stringValue(firstLocation?.phone),
    address: stringValue(business?.address) || formatAddress(firstLocation?.address),
    website: stringValue(business?.website) || stringValue(identity?.website),
    sameAs: arrayStrings(business?.sameAs),
  };
}

async function resolveGsc(
  projectId: string,
  urls: string[],
): Promise<OrganizationAuditContext["gsc"]> {
  const integration = await WebsiteIntegrationModel.findByProjectAndPlatform(projectId, "gsc");
  if (!integration || integration.status !== "active") {
    return {
      hasActiveIntegration: false,
      latestReportDate: null,
      rowsForUrls: {},
      error: "No active GSC integration",
    };
  }

  const latestReportDate = await GscDataModel.findLatestReportDate(projectId);
  if (!latestReportDate) {
    return {
      hasActiveIntegration: true,
      latestReportDate: null,
      rowsForUrls: {},
      error: "No GSC harvest rows found",
    };
  }

  const latest = await GscDataModel.findByProjectAndDate(projectId, latestReportDate);
  const rowsForUrls = mapGscRowsToUrls(latest?.data, urls);
  return {
    hasActiveIntegration: true,
    latestReportDate,
    rowsForUrls,
    error: null,
  };
}

async function fetchGbpData(property: {
  google_connection_id: number;
  account_id: string | null;
  external_id: string;
}): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  if (!property.account_id) {
    return { data: null, error: "Missing GBP account id" };
  }
  try {
    const auth = await getValidOAuth2ClientByConnection(property.google_connection_id);
    const data = await getGBPAIReadyData(auth, property.account_id, property.external_id);
    return { data: data as Record<string, unknown>, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "GBP data unavailable",
    };
  }
}

function mapGscRowsToUrls(data: unknown, urls: string[]): Record<string, number> {
  const rowsForUrls: Record<string, number> = {};
  const rows = objectValue(objectValue(data)?.pages)?.rows;
  if (!Array.isArray(rows)) return rowsForUrls;
  const normalizedTargets = new Map(urls.map((url) => [normalizeUrlForCompare(url), url]));
  for (const row of rows) {
    const record = objectValue(row);
    const keys = Array.isArray(record?.keys) ? record.keys : [];
    const pageUrl = typeof keys[0] === "string" ? keys[0] : null;
    if (!pageUrl) continue;
    const target = normalizedTargets.get(normalizeUrlForCompare(pageUrl));
    if (target) {
      rowsForUrls[target] = Number(record?.clicks || 0) + Number(record?.impressions || 0);
    }
  }
  return rowsForUrls;
}

function mapPageToLocation(
  path: string,
  title: string,
  locations: OrganizationAuditContext["locations"],
): { locationId: number | null; mappingConfidence: number | null } {
  const haystack = `${path} ${title}`.toLowerCase();
  for (const location of locations) {
    const name = location.name.toLowerCase();
    const slug = name.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (haystack.includes(name) || haystack.includes(slug)) {
      return { locationId: location.id, mappingConfidence: 85 };
    }
  }
  return { locationId: null, mappingConfidence: null };
}

function normalizeUrlForCompare(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    // GSC indexes the canonical host (often www) while audits build URLs from the
    // project domain (often non-www); align both so page rows actually match.
    parsed.protocol = "https:";
    parsed.hostname = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/$/, "")
      .toLowerCase();
  }
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function arrayStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function formatAddress(value: unknown): string | null {
  const record = objectValue(value);
  if (!record) return stringValue(value);
  return [
    stringValue(record.street),
    stringValue(record.city),
    stringValue(record.state),
    stringValue(record.postalCode),
  ].filter(Boolean).join(", ") || null;
}
