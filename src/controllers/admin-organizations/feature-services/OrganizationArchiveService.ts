import {
  IOrganization,
  OrganizationModel,
} from "../../../models/OrganizationModel";
import {
  IProject,
  ProjectModel,
} from "../../../models/website-builder/ProjectModel";
import {
  GbpAutomationSettingsModel,
  IGbpAutomationSettings,
} from "../../../models/GbpAutomationSettingsModel";
import { refreshCustomDomainCache } from "../../../middleware/corsCustomDomains";

type ProjectArchiveSnapshot = {
  id: string;
  archived_at: string | null;
  custom_domain: string | null;
  custom_domain_alt: string | null;
  domain_verified_at: string | null;
};

type GbpAutomationSettingsSnapshot = {
  id: string;
  review_reply_enabled: boolean;
  local_post_generation_enabled: boolean;
};

type OrganizationArchiveRecord = {
  archived_at: string;
  archived_by_user_id: number | null;
  archive_reason: string | null;
  project_snapshots: ProjectArchiveSnapshot[];
  gbp_automation_settings: GbpAutomationSettingsSnapshot[];
};

type ArchiveMetadata = Record<string, unknown> & {
  organization_archive?: OrganizationArchiveRecord;
  last_organization_archive?: OrganizationArchiveRecord & {
    unarchived_at: string;
    unarchived_by_user_id: number | null;
  };
};

export type OrganizationArchiveResult = {
  organization: IOrganization;
  archivedProjects: number;
  disconnectedDomains: number;
  pausedAutomationSettings: number;
};

export type OrganizationUnarchiveResult = {
  organization: IOrganization;
  restoredProjects: number;
  restoredAutomationSettings: number;
};

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

function projectSnapshot(project: IProject): ProjectArchiveSnapshot {
  return {
    id: project.id,
    archived_at: toIso(project.archived_at),
    custom_domain: project.custom_domain ?? null,
    custom_domain_alt: project.custom_domain_alt ?? null,
    domain_verified_at: toIso(project.domain_verified_at),
  };
}

function settingsSnapshot(
  settings: IGbpAutomationSettings
): GbpAutomationSettingsSnapshot {
  return {
    id: settings.id,
    review_reply_enabled: settings.review_reply_enabled,
    local_post_generation_enabled: settings.local_post_generation_enabled,
  };
}

function getArchiveMetadata(organization: IOrganization): ArchiveMetadata {
  return {
    ...(organization.archive_metadata ?? {}),
  } as ArchiveMetadata;
}

export async function archiveOrganization(params: {
  organizationId: number;
  archivedByUserId: number | null;
  reason?: string | null;
}): Promise<OrganizationArchiveResult> {
  const result = await OrganizationModel.transaction(async (trx) => {
    const organization = await OrganizationModel.findById(params.organizationId, trx);
    if (!organization) {
      const error = new Error("Organization not found") as Error & {
        statusCode: number;
        code: string;
      };
      error.statusCode = 404;
      error.code = "ORGANIZATION_NOT_FOUND";
      throw error;
    }

    if (organization.archived_at) {
      return {
        organization,
        archivedProjects: 0,
        disconnectedDomains: 0,
        pausedAutomationSettings: 0,
      };
    }

    const archivedAt = new Date();
    const projects = await ProjectModel.findAllByOrganizationId(
      params.organizationId,
      trx
    );
    const automationSettings = await GbpAutomationSettingsModel.listByOrganizationId(
      params.organizationId,
      trx
    );
    const connectedDomainCount = projects.filter(
      (project) =>
        project.custom_domain ||
        project.custom_domain_alt ||
        project.domain_verified_at
    ).length;

    const archiveRecord: OrganizationArchiveRecord = {
      archived_at: archivedAt.toISOString(),
      archived_by_user_id: params.archivedByUserId,
      archive_reason: params.reason?.trim() || null,
      project_snapshots: projects.map(projectSnapshot),
      gbp_automation_settings: automationSettings.map(settingsSnapshot),
    };

    const metadata = getArchiveMetadata(organization);
    metadata.organization_archive = archiveRecord;

    await OrganizationModel.updateById(
      params.organizationId,
      {
        archived_at: archivedAt,
        archived_by_user_id: params.archivedByUserId,
        archive_reason: archiveRecord.archive_reason,
        archive_metadata: metadata,
      },
      trx
    );

    const archivedProjects = await ProjectModel.archiveForOrganization(
      params.organizationId,
      archivedAt,
      trx
    );
    await ProjectModel.disconnectDomainsForOrganization(params.organizationId, trx);

    let pausedAutomationSettings = 0;
    for (const settings of automationSettings) {
      const shouldPause =
        settings.review_reply_enabled || settings.local_post_generation_enabled;
      if (shouldPause) {
        pausedAutomationSettings += 1;
      }

      await GbpAutomationSettingsModel.updateById(
        settings.id,
        {
          review_reply_enabled: false,
          local_post_generation_enabled: false,
          metadata: {
            ...(settings.metadata ?? {}),
            organization_archive_pause: {
              archived_at: archivedAt.toISOString(),
              archived_by_user_id: params.archivedByUserId,
              previous_review_reply_enabled: settings.review_reply_enabled,
              previous_local_post_generation_enabled:
                settings.local_post_generation_enabled,
            },
          },
        },
        trx
      );
    }

    const archivedOrganization = await OrganizationModel.findById(
      params.organizationId,
      trx
    );

    return {
      organization: archivedOrganization ?? organization,
      archivedProjects,
      disconnectedDomains: connectedDomainCount,
      pausedAutomationSettings,
    };
  });

  await refreshCustomDomainCache();
  return result;
}

export async function unarchiveOrganization(params: {
  organizationId: number;
  unarchivedByUserId: number | null;
}): Promise<OrganizationUnarchiveResult> {
  const result = await OrganizationModel.transaction(async (trx) => {
    const organization = await OrganizationModel.findById(params.organizationId, trx);
    if (!organization) {
      const error = new Error("Organization not found") as Error & {
        statusCode: number;
        code: string;
      };
      error.statusCode = 404;
      error.code = "ORGANIZATION_NOT_FOUND";
      throw error;
    }

    const metadata = getArchiveMetadata(organization);
    const archiveRecord = metadata.organization_archive;

    if (!organization.archived_at) {
      return {
        organization,
        restoredProjects: 0,
        restoredAutomationSettings: 0,
      };
    }

    let restoredProjects = 0;
    if (archiveRecord?.project_snapshots) {
      for (const snapshot of archiveRecord.project_snapshots) {
        await ProjectModel.updateById(
          snapshot.id,
          {
            archived_at: snapshot.archived_at ? new Date(snapshot.archived_at) : null,
          },
          trx
        );
        restoredProjects += 1;
      }
    }

    let restoredAutomationSettings = 0;
    if (archiveRecord?.gbp_automation_settings) {
      for (const snapshot of archiveRecord.gbp_automation_settings) {
        await GbpAutomationSettingsModel.updateById(
          snapshot.id,
          {
            review_reply_enabled: snapshot.review_reply_enabled,
            local_post_generation_enabled: snapshot.local_post_generation_enabled,
          },
          trx
        );
        restoredAutomationSettings += 1;
      }
    }

    if (archiveRecord) {
      metadata.last_organization_archive = {
        ...archiveRecord,
        unarchived_at: new Date().toISOString(),
        unarchived_by_user_id: params.unarchivedByUserId,
      };
      delete metadata.organization_archive;
    }

    await OrganizationModel.updateById(
      params.organizationId,
      {
        archived_at: null,
        archived_by_user_id: null,
        archive_reason: null,
        archive_metadata: metadata,
      },
      trx
    );

    const unarchivedOrganization = await OrganizationModel.findById(
      params.organizationId,
      trx
    );

    return {
      organization: unarchivedOrganization ?? organization,
      restoredProjects,
      restoredAutomationSettings,
    };
  });

  await refreshCustomDomainCache();
  return result;
}
