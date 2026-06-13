import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Building2, Globe2 } from "lucide-react";
import { useAdminOrganizations } from "../../../hooks/queries/useAdminQueries";
import { useAuditableOrganizationIds } from "../../../hooks/queries/useAiSeoAuditQueries";
import { AiSeoAuditPanel } from "./AiSeoAuditPanel";
import { OrganizationSearchSelect } from "./OrganizationSearchSelect";

type AuditSubjectMode = "organization" | "url";

export function AiSeoAuditAppWorkspace() {
  const [searchParams, setSearchParams] = useSearchParams();
  const mode: AuditSubjectMode =
    searchParams.get("mode") === "url" ? "url" : "organization";
  const orgParam = searchParams.get("organization");
  const selectedOrgId =
    orgParam && Number.isInteger(Number(orgParam)) ? Number(orgParam) : null;
  const organizationsQuery = useAdminOrganizations("active");
  const auditableQuery = useAuditableOrganizationIds();

  const updateParams = useCallback(
    (mutate: (params: URLSearchParams) => void) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          mutate(next);
          return next;
        },
        { replace: true }
      ),
    [setSearchParams]
  );
  // Switching mode or organization changes which runs are relevant, so clear the
  // selected run param to avoid pointing at a run from the previous context.
  const setMode = useCallback(
    (next: AuditSubjectMode) =>
      updateParams((params) => {
        params.set("mode", next);
        params.delete("run");
      }),
    [updateParams]
  );
  const setSelectedOrgId = useCallback(
    (id: number) =>
      updateParams((params) => {
        params.set("organization", String(id));
        params.delete("run");
      }),
    [updateParams]
  );

  // Only organizations with a connected website project + published pages can
  // run a full audit; everything else would immediately hard-cap.
  const organizations = useMemo(() => {
    const auditableIds = new Set(auditableQuery.data?.organizationIds ?? []);
    return [...(organizationsQuery.data || [])]
      .filter((organization) => auditableIds.has(organization.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [organizationsQuery.data, auditableQuery.data]);

  const selectedOrganization = organizations.find(
    (organization) => organization.id === selectedOrgId
  );

  useEffect(() => {
    if (mode !== "organization") return;
    if (selectedOrgId || organizations.length === 0) return;
    setSelectedOrgId(organizations[0].id);
  }, [mode, organizations, selectedOrgId, setSelectedOrgId]);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
            <button
              type="button"
              onClick={() => setMode("organization")}
              className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-black transition-all duration-200 ${
                mode === "organization"
                  ? "bg-white text-alloro-navy shadow-sm"
                  : "text-gray-500 hover:text-alloro-navy"
              }`}
            >
              <Building2 className="h-4 w-4" />
              Organization
            </button>
            <button
              type="button"
              onClick={() => setMode("url")}
              className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-black transition-all duration-200 ${
                mode === "url"
                  ? "bg-white text-alloro-navy shadow-sm"
                  : "text-gray-500 hover:text-alloro-navy"
              }`}
            >
              <Globe2 className="h-4 w-4" />
              Custom URL
            </button>
          </div>

          {mode === "organization" && (
            <OrganizationSearchSelect
              organizations={organizations}
              selectedOrgId={selectedOrgId}
              isLoading={organizationsQuery.isLoading || auditableQuery.isLoading}
              onChange={setSelectedOrgId}
            />
          )}
        </div>
      </section>

      {mode === "organization" ? (
        <AiSeoAuditPanel
          key={selectedOrgId ?? "organization"}
          organizationId={selectedOrgId}
          runsScope="organization"
          contextLabel={
            selectedOrganization
              ? `${selectedOrganization.name} organization audit`
              : "Select an organization to audit"
          }
          showUrlAction={false}
          organizationActionLabel="Run Org Audit"
        />
      ) : (
        <AiSeoAuditPanel
          key="custom-url"
          organizationId={null}
          runsScope="url_only"
          contextLabel="Custom URL audit"
          showOrganizationAction={false}
          urlActionLabel="Run URL Audit"
        />
      )}
    </div>
  );
}
