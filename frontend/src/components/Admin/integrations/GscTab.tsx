import { useState } from "react";
import { motion } from "framer-motion";
import { History, Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";
import {
  backfillGscHistory,
  type Integration,
} from "../../../api/integrations";
import IntegrationPanel from "./IntegrationPanel";
import GscConnectPanel from "./GscConnectPanel";
import { GscPerformanceDashboard } from "./GscPerformanceDashboard";
import { useConfirm } from "../../ui/ConfirmModal";

interface Props {
  projectId: string;
  integration: Integration | null;
  onRefresh: () => void;
}

export default function GscTab({ projectId, integration, onRefresh }: Props) {
  const confirm = useConfirm();
  const [backfilling, setBackfilling] = useState(false);

  if (!integration) {
    return <GscConnectPanel projectId={projectId} onConnected={onRefresh} />;
  }

  const siteUrl = integration.metadata?.siteUrl
    ? String(integration.metadata.siteUrl)
    : null;
  const email = integration.metadata?.googleEmail
    ? String(integration.metadata.googleEmail)
    : null;
  const permissionLevel = integration.metadata?.permissionLevel
    ? String(integration.metadata.permissionLevel)
    : null;
  const connectionOwner = integration.metadata?.connectionOwner
    ? String(integration.metadata.connectionOwner)
    : null;
  const ownerLabel =
    connectionOwner === "admin"
      ? "Admin account"
      : connectionOwner === "organization"
        ? "Client organization"
        : null;

  return (
    <div className="p-6">
      <IntegrationPanel
        integration={integration}
        projectId={projectId}
        onRefresh={onRefresh}
      >
        <GscPerformanceDashboard
          projectId={projectId}
          integrationId={integration.id}
        />
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.05 }}
          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-gray-900">
                Search Console Property
              </h4>
              <p className="text-xs text-gray-400 mt-0.5">
                Rebuild stored GSC daily history from Google when needed.
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                const ok = await confirm({
                  title: "Fetch all historic GSC data?",
                  message:
                    "This clears existing GSC daily data and harvest logs for this website, then queues a complete daily refresh through Google's latest available date.",
                  confirmLabel: "Fetch history",
                  variant: "danger",
                });
                if (!ok) return;

                setBackfilling(true);
                try {
                  const result = await backfillGscHistory(
                    projectId,
                    integration.id,
                  );
                  toast.success(
                    `Historic refresh queued for ${result.data.queuedDays} days`,
                  );
                  onRefresh();
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Failed to queue historic refresh",
                  );
                } finally {
                  setBackfilling(false);
                }
              }}
              disabled={backfilling}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition disabled:opacity-50"
            >
              {backfilling ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <History className="w-3.5 h-3.5" />
              )}
              Fetch History
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <div className="text-gray-400 uppercase tracking-wide font-semibold mb-0.5">
                Site URL
              </div>
              <div className="text-gray-900 font-medium font-mono truncate">
                {siteUrl || "--"}
              </div>
            </div>
            <div>
              <div className="text-gray-400 uppercase tracking-wide font-semibold mb-0.5">
                Google Account
              </div>
              <div className="text-gray-900 font-medium truncate">
                {email || "--"}
              </div>
            </div>
            <div>
              <div className="text-gray-400 uppercase tracking-wide font-semibold mb-0.5">
                Source
              </div>
              <div className="text-gray-900 font-medium truncate">
                {ownerLabel || "--"}
              </div>
            </div>
            <div>
              <div className="text-gray-400 uppercase tracking-wide font-semibold mb-0.5">
                Permission
              </div>
              <div className="text-gray-900 font-medium truncate">
                {permissionLevel || "--"}
              </div>
            </div>
          </div>
        </motion.div>
      </IntegrationPanel>
    </div>
  );
}
