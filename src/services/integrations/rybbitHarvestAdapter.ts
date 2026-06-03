import type { IDataHarvestAdapter, ValidateHarvestResult, HarvestResult } from "./harvest-types";
import type { IWebsiteIntegrationSafe } from "../../models/website-builder/WebsiteIntegrationModel";
import { ProjectModel } from "../../models/website-builder/ProjectModel";
import { resolveRybbitTimeZone } from "../../utils/rybbit/rybbit-time-zone";

const RYBBIT_API_URL = process.env.RYBBIT_API_URL || "";
const RYBBIT_API_KEY = process.env.RYBBIT_API_KEY || "";

export class RybbitHarvestAdapter implements IDataHarvestAdapter {
  async validateConnection(integration: IWebsiteIntegrationSafe): Promise<ValidateHarvestResult> {
    const siteId = (integration.metadata as { siteId?: string }).siteId;
    if (!siteId) {
      return { ok: false, error: "missing_site_id", errorMessage: "No siteId in integration metadata" };
    }
    if (!RYBBIT_API_URL || !RYBBIT_API_KEY) {
      return { ok: false, error: "missing_config", errorMessage: "RYBBIT_API_URL or RYBBIT_API_KEY not configured" };
    }

    try {
      const resp = await fetch(`${RYBBIT_API_URL}/api/sites/${siteId}`, {
        headers: { Authorization: `Bearer ${RYBBIT_API_KEY}` },
      });
      if (resp.ok) return { ok: true };
      if (resp.status === 404) return { ok: false, error: "site_not_found", errorMessage: `Rybbit site ${siteId} not found` };
      if (resp.status === 401) return { ok: false, error: "invalid_token", errorMessage: "Rybbit API key is invalid" };
      return { ok: false, error: "unknown", errorMessage: `Rybbit returned ${resp.status}` };
    } catch (err) {
      return { ok: false, error: "network", errorMessage: err instanceof Error ? err.message : String(err) };
    }
  }

  async fetchData(integration: IWebsiteIntegrationSafe, date: string): Promise<HarvestResult> {
    const siteId = (integration.metadata as { siteId?: string }).siteId;
    if (!siteId) {
      return { ok: false, data: null, rowCount: 0, error: "No siteId in metadata" };
    }

    try {
      const timeZone = resolveRybbitTimeZone(
        await ProjectModel.getRybbitTimeZone(integration.project_id),
      );
      const params = new URLSearchParams({
        start_date: date,
        end_date: date,
        time_zone: timeZone,
      });
      const url = `${RYBBIT_API_URL}/api/sites/${siteId}/overview?${params.toString()}`;
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${RYBBIT_API_KEY}` },
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        return { ok: false, data: null, rowCount: 0, error: `Rybbit API ${resp.status}`, errorDetails: body.slice(0, 4096) };
      }

      const data = await resp.json();
      return { ok: true, data, rowCount: 1 };
    } catch (err) {
      return { ok: false, data: null, rowCount: 0, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
