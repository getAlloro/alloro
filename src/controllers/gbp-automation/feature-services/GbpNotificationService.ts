import { NotificationModel } from "../../../models/NotificationModel";

type GbpNotificationKind =
  | "gbp_reply_draft_ready"
  | "gbp_reply_published"
  | "gbp_reply_deploy_failed"
  | "gbp_post_published"
  | "gbp_post_deploy_failed";

interface NotifyParams {
  organizationId: number;
  locationId: number;
  workItemId: string;
  kind: GbpNotificationKind;
  title: string;
  message: string;
}

export class GbpNotificationService {
  static async create(params: NotifyParams): Promise<number> {
    return NotificationModel.create({
      organization_id: params.organizationId,
      location_id: params.locationId,
      title: params.title,
      message: params.message,
      type: "system",
      metadata: {
        kind: params.kind,
        workItemId: params.workItemId,
        severity: params.kind.endsWith("_deploy_failed") ? "high" : "normal",
      },
    });
  }
}
