/**
 * Redirects Tab
 *
 * CRUD UI for managing URL redirects per project.
 */

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Trash2,
  Loader2,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import {
  listRedirects,
  createRedirect,
  deleteRedirect,
} from "../../../api/websites";
import type { Redirect } from "../../../api/websites";
import { toast } from "react-hot-toast";
import { getErrorMessage } from "../../../lib/errorMessage";

interface RedirectsTabProps {
  projectId: string;
}

export default function RedirectsTab({ projectId }: RedirectsTabProps) {
  const [redirects, setRedirects] = useState<Redirect[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromPath, setFromPath] = useState("");
  const [toPath, setToPath] = useState("");
  const [redirectType, setRedirectType] = useState<number>(301);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchRedirects = useCallback(async () => {
    try {
      const res = await listRedirects(projectId);
      setRedirects(res.data || []);
    } catch {
      toast.error("Failed to load redirects");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchRedirects();
  }, [fetchRedirects]);

  const handleCreate = async () => {
    if (!fromPath.trim() || !toPath.trim() || creating) return;
    setCreating(true);
    try {
      await createRedirect(projectId, {
        from_path: fromPath.trim(),
        to_path: toPath.trim(),
        type: redirectType,
      });
      setFromPath("");
      setToPath("");
      await fetchRedirects();
      toast.success("Redirect created");
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || "Failed to create redirect");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteRedirect(projectId, id);
      setRedirects((prev) => prev.filter((r) => r.id !== id));
      toast.success("Redirect deleted");
    } catch {
      toast.error("Failed to delete redirect");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ExternalLink className="w-5 h-5 text-gray-500" />
          <h3 className="text-lg font-semibold text-gray-900">Redirects</h3>
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
            {redirects.length}
          </span>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Add form */}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1 block">From</label>
            <input
              type="text"
              value={fromPath}
              onChange={(e) => setFromPath(e.target.value)}
              placeholder="/old-path or /blog/*"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-alloro-orange/20 focus:border-alloro-orange transition-colors"
            />
          </div>
          <ArrowRight className="w-4 h-4 text-gray-300 mb-2.5 shrink-0" />
          <div className="flex-1">
            <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1 block">To</label>
            <input
              type="text"
              value={toPath}
              onChange={(e) => setToPath(e.target.value)}
              placeholder="/new-path"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-alloro-orange/20 focus:border-alloro-orange transition-colors"
            />
          </div>
          <div className="w-20">
            <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1 block">Type</label>
            <select
              value={redirectType}
              onChange={(e) => setRedirectType(parseInt(e.target.value, 10))}
              className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-alloro-orange/20 focus:border-alloro-orange"
            >
              <option value={301}>301</option>
              <option value={302}>302</option>
            </select>
          </div>
          <button
            onClick={handleCreate}
            disabled={!fromPath.trim() || !toPath.trim() || creating}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-alloro-orange text-white rounded-lg text-sm font-medium hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add
          </button>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : redirects.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <ExternalLink className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No redirects configured</p>
          </div>
        ) : (
          <div className="space-y-1">
            {redirects.map((r) => (
              <motion.div
                key={r.id}
                layout
                className="group flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-100 hover:bg-gray-50/50 transition-colors"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <code className="text-sm text-gray-700 truncate">{r.from_path}</code>
                  <ArrowRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                  <code className="text-sm text-alloro-orange truncate">{r.to_path}</code>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${
                    r.type === 301 ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600"
                  }`}>
                    {r.type}
                  </span>
                  {r.is_wildcard && (
                    <span className="text-[10px] font-medium bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                      wildcard
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(r.id)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                >
                  {deletingId === r.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
