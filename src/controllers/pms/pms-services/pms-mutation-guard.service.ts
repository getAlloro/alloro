import { PmsJobModel } from "../../../models/PmsJobModel";

export async function assertNoActivePmsAutomation(
  organizationId: number | null | undefined,
  locationId: number | null | undefined
) {
  if (!organizationId || !locationId) return;

  const activeJobs = await PmsJobModel.findActiveAutomationJobs(
    organizationId,
    locationId
  );

  if (activeJobs.length === 0) return;

  const blocker = activeJobs[0];
  throw Object.assign(
    new Error("A PMS automation run is already processing for this location."),
    {
      statusCode: 409,
      code: "PMS_AUTOMATION_ACTIVE",
      activeJob: blocker,
    }
  );
}
