import { motion } from "framer-motion";
import type { Integration } from "../../../api/integrations";
import IntegrationPanel from "./IntegrationPanel";
import GscConnectPanel from "./GscConnectPanel";

interface Props {
  projectId: string;
  integration: Integration | null;
  onRefresh: () => void;
}

export default function GscTab({ projectId, integration, onRefresh }: Props) {
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

  return (
    <div className="p-6">
      <IntegrationPanel
        integration={integration}
        projectId={projectId}
        onRefresh={onRefresh}
      >
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.05 }}
          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
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
