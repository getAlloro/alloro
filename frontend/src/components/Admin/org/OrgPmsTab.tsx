import { useState } from "react";
import { motion } from "framer-motion";
import { RefreshCw, TrendingUp } from "lucide-react";
import { useAdminOrgPms } from "../../hooks/queries/useAdminOrgTabQueries";

interface OrgPmsTabProps {
  organizationId: number;
  locationId: number | null;
}

export function OrgPmsTab({ organizationId, locationId }: OrgPmsTabProps) {
  const [page, setPage] = useState(1);

  const pageSize = 50;

  // TanStack Query — replaces useEffect + useState + parallel fetch
  const { data, isLoading: loading } = useAdminOrgPms(
    organizationId,
    locationId,
    page,
  );

  const jobs = data?.jobs ?? [];
  const total = data?.total ?? 0;
  const keyData = data?.keyData ?? null;
  const totalPages = Math.ceil(total / pageSize);

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "pending":
        return "bg-yellow-50 text-yellow-700 border-yellow-200";
      case "processing":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "completed":
        return "bg-green-50 text-green-700 border-green-200";
      case "failed":
        return "bg-red-50 text-red-700 border-red-200";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200";
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      {keyData && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-4"
        >
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">
              Total Jobs
            </p>
            <p className="text-2xl font-bold text-gray-900">{total}</p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">
              Data Months
            </p>
            <p className="text-2xl font-bold text-gray-900">
              {keyData.months?.length || 0}
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">
              <TrendingUp className="h-3 w-3 inline mr-1" />
              Total Production
            </p>
            <p className="text-2xl font-bold text-gray-900">
              ${(keyData.totals?.totalProduction || 0).toLocaleString()}
            </p>
          </div>
        </motion.div>
      )}

      {/* Job List */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-500">
          <RefreshCw className="h-5 w-5 animate-spin mr-2" />
          Loading jobs...
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <RefreshCw className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          <p>No PMS jobs found</p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  Job ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  Location
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                  Approved
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {jobs.map((job) => (
                <motion.tr
                  key={job.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                    #{job.id}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {job.location_name || "—"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {formatDate(job.timestamp)}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`text-xs px-2 py-1 rounded border inline-block ${getStatusColor(job.status)}`}
                    >
                      {job.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {job.is_approved ? (
                      <span className="text-xs px-2 py-1 rounded bg-green-50 text-green-700 border border-green-200 inline-block font-medium">
                        ✓ Approved
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded bg-gray-50 text-gray-600 border border-gray-200 inline-block">
                        —
                      </span>
                    )}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <div className="text-sm text-gray-600">
            Page {page} of {totalPages}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ← Previous
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
