import { motion } from "framer-motion";
import { Globe } from "lucide-react";
import type { AdminOrganizationDetail } from "../../api/admin-organizations";

interface OrgConnectionsSectionProps {
  org: AdminOrganizationDetail;
}

export function OrgConnectionsSection({ org }: OrgConnectionsSectionProps) {
  const connections = org.connections || [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-gray-200 bg-white p-6"
    >
      <div className="flex items-center gap-2 mb-4">
        <Globe className="h-5 w-5 text-blue-600" />
        <h3 className="font-semibold text-gray-900">Connections</h3>
      </div>

      {connections.length === 0 ? (
        <p className="text-sm text-gray-500">
          No Google connections linked to this organization.
        </p>
      ) : (
        <div className="space-y-3">
          {connections.map((conn, idx) => (
            <div key={idx} className="rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-gray-600">
                Connected via{" "}
                <span className="font-medium">{conn.email}</span>
              </p>
              {conn.properties?.gbp && conn.properties.gbp.length > 0 ? (
                <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded px-2 py-1 inline-block mt-2 font-medium">
                  GBP: {conn.properties.gbp.length} locations
                </p>
              ) : (
                <p className="text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded px-2 py-1 inline-block mt-2">
                  No GBP
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
