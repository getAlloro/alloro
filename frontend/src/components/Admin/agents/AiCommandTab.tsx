/**
 * AI Command Tab
 *
 * Batch AI analysis + review UI for website content.
 * Persists batches across refresh. Shows batch history.
 * States: History → Input → Analyzing → Results (approve/reject/execute).
 */

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import {
  Sparkles,
  Loader2,
  Check,
  X,
  CheckCircle,
  Zap,
  FileText,
  Layout,
  Newspaper,
  Trash2,
  ArrowLeft,
  Pencil,
} from "lucide-react";
import {
  createAiCommandBatch,
  fetchAiCommandBatch,
  fetchAiCommandRecommendations,
  updateAiCommandRecommendation,
  bulkUpdateAiCommandRecommendations,
  executeAiCommandBatch,
  listAiCommandBatches,
  deleteAiCommandBatch,
  renameAiCommandBatch,
} from "../../../api/websites";
import type {
  AiCommandBatch,
  AiCommandRecommendation,
  AiCommandTargets,
  WebsitePage,
} from "../../../api/websites";
import { toast } from "react-hot-toast";
import { adminFetch } from "../../../api";
import { logger } from "../../../lib/logger";
import type { AiCommandTabProps, PostItem, TargetMode, ViewState } from "./aiCommandTab.types";
import { parseStats, subGroupKey } from "./aiCommandTab.utils";
import { BatchTypeBadge } from "./AiCommandTab/BatchTypeBadge";
import { StatusPill } from "./AiCommandTab/StatusPill";
import { TargetSection } from "./AiCommandTab/TargetSection";
import { SelectChip } from "./AiCommandTab/SelectChip";
import { StatBadge } from "./AiCommandTab/StatBadge";
import { RecommendationList } from "./AiCommandTab/RecommendationList";

export default function AiCommandTab({ projectId, pages = [], onExecutionComplete }: AiCommandTabProps) {
  const [viewState, setViewState] = useState<ViewState>("history");
  const [prompt, setPrompt] = useState("");

  // Target selection
  const [pagesMode, setPagesMode] = useState<TargetMode>("all");
  const [postsMode, setPostsMode] = useState<TargetMode>("all");
  const [layoutsMode, setLayoutsMode] = useState<TargetMode>("all");
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(new Set());
  const [selectedLayouts, setSelectedLayouts] = useState<Set<string>>(new Set(["wrapper", "header", "footer"]));

  // Posts fetched internally
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [postsLoaded, setPostsLoaded] = useState(false);

  // Batch state
  const [batches, setBatches] = useState<AiCommandBatch[]>([]);
  const [batchesLoaded, setBatchesLoaded] = useState(false);
  const [batch, setBatch] = useState<AiCommandBatch | null>(null);
  const [recommendations, setRecommendations] = useState<AiCommandRecommendation[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingRecId, setLoadingRecId] = useState<string | null>(null);
  const [deletingBatchId, setDeletingBatchId] = useState<string | null>(null);

  // Load batches on mount
  useEffect(() => {
    if (batchesLoaded) return;
    (async () => {
      try {
        const res = await listAiCommandBatches(projectId);
        setBatches(res.data || []);
      } catch { /* ignore */ }
      setBatchesLoaded(true);
    })();
  }, [projectId, batchesLoaded]);

  // Fetch posts on mount
  useEffect(() => {
    if (postsLoaded) return;
    (async () => {
      try {
        const response = await adminFetch(`/api/admin/websites/${projectId}/posts`);
        if (response.ok) {
          const data = await response.json();
          setPosts(data.data || []);
        }
      } catch { /* ignore */ }
      setPostsLoaded(true);
    })();
  }, [projectId, postsLoaded]);

  // Unique pages by path
  const uniquePages = (() => {
    const seen = new Map<string, WebsitePage>();
    for (const p of pages) {
      const existing = seen.get(p.path);
      if (!existing || (p.status === "draft" && existing.status !== "draft")) {
        seen.set(p.path, p);
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.path.localeCompare(b.path));
  })();

  const buildTargets = (): AiCommandTargets => {
    const t: AiCommandTargets = {};
    if (pagesMode === "all") t.pages = "all";
    else if (pagesMode === "specific" && selectedPageIds.size > 0) t.pages = Array.from(selectedPageIds);
    if (postsMode === "all") t.posts = "all";
    else if (postsMode === "specific" && selectedPostIds.size > 0) t.posts = Array.from(selectedPostIds);
    if (layoutsMode === "all") t.layouts = "all";
    else if (layoutsMode === "specific" && selectedLayouts.size > 0) t.layouts = Array.from(selectedLayouts);
    return t;
  };

  const hasAnyTarget = () => {
    return (pagesMode === "all") || (pagesMode === "specific" && selectedPageIds.size > 0) ||
           (postsMode === "all") || (postsMode === "specific" && selectedPostIds.size > 0) ||
           (layoutsMode === "all") || (layoutsMode === "specific" && selectedLayouts.size > 0);
  };

  // Poll batch status — interval-based with cleanup
  useEffect(() => {
    if (!batch || (viewState !== "analyzing" && viewState !== "executing")) return;

    let active = true;
    const pollInterval = viewState === "executing" ? 1500 : 2500;

    const tick = async () => {
      if (!active) return;
      try {
        const res = await fetchAiCommandBatch(projectId, batch.id);
        if (!active) return;
        setBatch(res.data);

        if (viewState === "analyzing" && (res.data.status === "ready" || res.data.status === "failed")) {
          if (res.data.status === "ready") {
            const recsRes = await fetchAiCommandRecommendations(projectId, batch.id);
            if (active) {
              setRecommendations(recsRes.data);
              setExpandedGroups(new Set(recsRes.data.map((r) => subGroupKey(r))));
            }
          }
          if (active) { setViewState("results"); refreshBatchList(); }
          return; // Stop polling
        }

        if (viewState === "executing") {
          const recsRes = await fetchAiCommandRecommendations(projectId, batch.id);
          if (active) setRecommendations(recsRes.data);

          if (res.data.status === "completed" || res.data.status === "failed") {
            if (active) { setViewState("completed"); refreshBatchList(); onExecutionComplete?.(); }
            return; // Stop polling
          }
        }
      } catch { /* retry next tick */ }
    };

    tick(); // Initial fetch
    const id = setInterval(tick, pollInterval);
    return () => { active = false; clearInterval(id); };
  }, [batch?.id, viewState, projectId]);

  const refreshBatchList = async () => {
    try {
      const res = await listAiCommandBatches(projectId);
      setBatches(res.data || []);
    } catch { /* ignore */ }
  };

  // Open an existing batch
  const openBatch = useCallback(async (b: AiCommandBatch) => {
    setBatch(b);
    if (b.status === "analyzing") {
      setViewState("analyzing");
      return;
    }
    if (b.status === "executing") {
      setViewState("executing");
      return;
    }
    try {
      const recsRes = await fetchAiCommandRecommendations(projectId, b.id);
      setRecommendations(recsRes.data);
      // Only expand groups that have pending items
      const pending = recsRes.data.filter((r) => r.status === "pending");
      setExpandedGroups(new Set(pending.map((r) => subGroupKey(r))));
    } catch {
      toast.error("Failed to load recommendations");
    }
    setViewState(b.status === "completed" ? "completed" : "results");
  }, [projectId]);

  const handleSubmit = useCallback(async () => {
    if (!prompt.trim() || isSubmitting || !hasAnyTarget()) return;
    setIsSubmitting(true);
    try {
      const res = await createAiCommandBatch(projectId, { prompt: prompt.trim(), targets: buildTargets() });
      setBatch(res.data);
      setViewState("analyzing");
      refreshBatchList();
    } catch (err) {
      toast.error("Failed to start analysis");
      logger.error(err);
    } finally {
      setIsSubmitting(false);
    }
  }, [prompt, projectId, isSubmitting, pagesMode, postsMode, layoutsMode, selectedPageIds, selectedPostIds, selectedLayouts]);

  const handleApproveReject = useCallback(
    async (recId: string, status: "approved" | "rejected", referenceData?: { reference_url?: string; reference_content?: string }) => {
      setLoadingRecId(recId);
      try {
        await updateAiCommandRecommendation(projectId, batch!.id, recId, status, referenceData);
        setRecommendations((prev) =>
          prev.map((r) => (r.id === recId ? { ...r, status } : r)),
        );
        const batchRes = await fetchAiCommandBatch(projectId, batch!.id);
        setBatch(batchRes.data);

        // Auto-collapse group if all items in it are now approved/rejected
        const rec = recommendations.find((r) => r.id === recId);
        if (rec) {
          const groupRecs = recommendations.filter((r) => subGroupKey(r) === subGroupKey(rec));
          const updatedGroupRecs = groupRecs.map((r) => r.id === recId ? { ...r, status } : r);
          const allActioned = updatedGroupRecs.every((r) => r.status === "approved" || r.status === "rejected");
          if (allActioned) {
            setExpandedGroups((prev) => {
              const next = new Set(prev);
              next.delete(subGroupKey(rec));
              return next;
            });
          }
        }
      } catch {
        toast.error("Failed to update recommendation");
      } finally {
        setLoadingRecId(null);
      }
    },
    [projectId, batch, recommendations],
  );

  const NEEDS_INPUT_TYPES = new Set(["create_page", "create_post"]);
  const needsInputCheck = (rec: AiCommandRecommendation) => {
    if (!NEEDS_INPUT_TYPES.has(rec.target_type)) return false;
    const meta = rec.target_meta as Record<string, unknown>;
    return !meta?.reference_url && !meta?.reference_content;
  };
  const needsUrlCheck = (rec: AiCommandRecommendation) => {
    if (rec.target_type !== "update_menu") return false;
    const meta = rec.target_meta as Record<string, unknown>;
    return meta?.url === "NEEDS_INPUT";
  };

  const handleBulkAction = useCallback(
    async (status: "approved" | "rejected") => {
      if (!batch) return;

      // Block approve if items need user input
      if (status === "approved") {
        const pendingRecs = recommendations.filter((r) => r.status === "pending");
        const needInput = pendingRecs.filter((r) => needsInputCheck(r) || needsUrlCheck(r));
        if (needInput.length > 0) {
          toast.error(
            `${needInput.length} item${needInput.length > 1 ? "s" : ""} need${needInput.length === 1 ? "s" : ""} your input before approval (reference URLs, external links). Handle those individually first.`,
            { duration: 5000 }
          );
          // Expand groups containing items that need input
          const groups = new Set(needInput.map((r) => subGroupKey(r)));
          setExpandedGroups((prev) => new Set([...prev, ...groups]));
          return;
        }
      }

      try {
        await bulkUpdateAiCommandRecommendations(projectId, batch.id, status);
        const [batchRes, recsRes] = await Promise.all([
          fetchAiCommandBatch(projectId, batch.id),
          fetchAiCommandRecommendations(projectId, batch.id),
        ]);
        setBatch(batchRes.data);
        setRecommendations(recsRes.data);
        setExpandedGroups(new Set());
      } catch {
        toast.error("Failed to bulk update");
      }
    },
    [projectId, batch, recommendations],
  );

  const handleExecute = useCallback(async () => {
    if (!batch) return;
    try {
      await executeAiCommandBatch(projectId, batch.id);
      setBatch((prev) => prev ? { ...prev, status: "executing" } : prev);
      setViewState("executing");
    } catch {
      toast.error("Failed to start execution");
    }
  }, [projectId, batch]);

  const handleDeleteBatch = useCallback(async (batchId: string) => {
    setDeletingBatchId(batchId);
    try {
      await deleteAiCommandBatch(projectId, batchId);
      setBatches((prev) => prev.filter((b) => b.id !== batchId));
      if (batch?.id === batchId) {
        setBatch(null);
        setRecommendations([]);
        setViewState("history");
      }
    } catch {
      toast.error("Failed to delete batch");
    } finally {
      setDeletingBatchId(null);
    }
  }, [projectId, batch]);

  const goToInput = () => {
    setViewState("input");
    setPrompt("");
    setPendingToolType(null);
  };

  const [pendingToolType, setPendingToolType] = useState<"ui_checker" | "link_checker" | null>(null);

  const handleQuickAnalysis = (type: "ui_checker" | "link_checker") => {
    setPendingToolType(type);
    setViewState("input"); // Reuse input view for target selection
  };

  const handleToolSubmit = useCallback(async () => {
    if (!pendingToolType || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await createAiCommandBatch(projectId, {
        batch_type: pendingToolType,
        targets: buildTargets(),
      });
      setBatch(res.data);
      setViewState("analyzing");
      setPendingToolType(null);
      refreshBatchList();
    } catch (err) {
      toast.error(`Failed to start ${pendingToolType === "ui_checker" ? "UI Check" : "Link Check"}`);
      logger.error(err);
    } finally {
      setIsSubmitting(false);
    }
  }, [pendingToolType, projectId, isSubmitting, pagesMode, postsMode, layoutsMode, selectedPageIds, selectedPostIds, selectedLayouts]);

  const goToHistory = () => {
    setViewState("history");
    setBatch(null);
    setRecommendations([]);
    setExpandedGroups(new Set());
    setPendingToolType(null);
    refreshBatchList();
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const stats = parseStats(batch?.stats ?? null);
  const approvedCount = stats.approved || 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {viewState !== "history" && (
            <button onClick={goToHistory} className="text-gray-400 hover:text-gray-600 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <Sparkles className="w-5 h-5 text-alloro-orange" />
          <h3 className="text-lg font-semibold text-gray-900">AI Command</h3>
          {batch && (
            <StatusPill status={batch.status} />
          )}
        </div>
        {viewState === "history" && (
          <div className="flex gap-1.5">
            <button
              onClick={goToInput}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-alloro-orange text-white rounded-lg hover:brightness-110 transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" /> AI Editor
            </button>
            <button
              onClick={() => handleQuickAnalysis("ui_checker")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Layout className="w-3.5 h-3.5" /> UI Check
            </button>
            <button
              onClick={() => handleQuickAnalysis("link_checker")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" /> Link Check
            </button>
          </div>
        )}
      </div>

      <div className="p-5">
        <AnimatePresence mode="wait">
          {/* ---- HISTORY STATE ---- */}
          {viewState === "history" && (
            <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
              {!batchesLoaded ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : batches.length === 0 ? (
                <div className="text-center py-12">
                  <Sparkles className="w-8 h-8 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm text-gray-500 mb-1">No analyses yet</p>
                  <p className="text-xs text-gray-400">Create a new analysis to get started</p>
                </div>
              ) : (
                batches.map((b) => {
                  const s = parseStats(b.stats);
                  return (
                    <div
                      key={b.id}
                      className="group flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50/50 transition-all cursor-pointer"
                      onClick={() => openBatch(b)}
                    >
                      <div className="flex-1 min-w-0 mr-3">
                        <div className="flex items-center gap-2 mb-1">
                          <BatchTypeBadge targets={b.targets} />
                          <StatusPill status={b.status} />
                          <span className="text-[11px] text-gray-400">
                            {new Date(b.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 truncate">{b.summary || b.prompt.slice(0, 100) || "Untitled"}</p>
                        {s.total > 0 && (
                          <div className="flex gap-1.5 mt-1.5">
                            {s.pending > 0 && <span className="text-[10px] text-gray-400">{s.pending} pending</span>}
                            {s.approved > 0 && <span className="text-[10px] text-green-600">{s.approved} approved</span>}
                            {s.rejected > 0 && <span className="text-[10px] text-red-400">{s.rejected} rejected</span>}
                            {s.executed > 0 && <span className="text-[10px] text-alloro-orange">{s.executed} executed</span>}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const newName = window.prompt("Rename batch:", b.summary || "");
                            if (newName !== null && newName.trim()) {
                              renameAiCommandBatch(projectId, b.id, newName.trim()).then(() => refreshBatchList());
                            }
                          }}
                          className="p-1.5 rounded-md text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-all"
                          title="Rename"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteBatch(b.id); }}
                          className="p-1.5 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                          title="Delete batch"
                        >
                          {deletingBatchId === b.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </motion.div>
          )}

          {/* ---- INPUT STATE ---- */}
          {viewState === "input" && (
            <motion.div key="input" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-5">
              {/* Tool type header */}
              {pendingToolType && (
                <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                  {pendingToolType === "ui_checker" ? <Layout className="w-4 h-4 text-purple-500" /> : <FileText className="w-4 h-4 text-blue-500" />}
                  <span className="text-sm font-medium text-gray-700">
                    {pendingToolType === "ui_checker" ? "UI Check" : "Link Check"} — select targets
                  </span>
                </div>
              )}

              {/* Prompt textarea — only for AI Editor */}
              {!pendingToolType && (
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Paste a QA checklist, describe changes, or give a simple instruction..."
                  className="w-full min-h-[180px] p-4 border border-gray-200 rounded-lg text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-alloro-orange/20 focus:border-alloro-orange transition-colors"
                />
              )}

              {/* Target selection — shared by all tools */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Targets</p>
                <TargetSection icon={<FileText className="w-3.5 h-3.5" />} label="Pages" mode={pagesMode} onModeChange={setPagesMode}>
                  {pagesMode === "specific" && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-gray-100">
                      {uniquePages.map((page) => (
                        <SelectChip key={page.id} label={page.path === "/" ? "Home (/)" : page.path} selected={selectedPageIds.has(page.id)}
                          onClick={() => setSelectedPageIds((prev) => { const n = new Set(prev); n.has(page.id) ? n.delete(page.id) : n.add(page.id); return n; })} />
                      ))}
                    </div>
                  )}
                </TargetSection>
                {/* Posts — only for AI Editor and Link Checker (not UI Checker since posts have their own templates) */}
                {pendingToolType !== "ui_checker" && (
                  <TargetSection icon={<Newspaper className="w-3.5 h-3.5" />} label="Posts" mode={postsMode} onModeChange={setPostsMode}>
                    {postsMode === "specific" && (
                      <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-gray-100">
                        {posts.length > 0 ? posts.map((post) => (
                          <SelectChip key={post.id} label={post.title} selected={selectedPostIds.has(post.id)}
                            onClick={() => setSelectedPostIds((prev) => { const n = new Set(prev); n.has(post.id) ? n.delete(post.id) : n.add(post.id); return n; })} />
                        )) : <span className="text-xs text-gray-400 italic">No posts found</span>}
                      </div>
                    )}
                  </TargetSection>
                )}
                <TargetSection icon={<Layout className="w-3.5 h-3.5" />} label="Layouts" mode={layoutsMode} onModeChange={setLayoutsMode}>
                  {layoutsMode === "specific" && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-gray-100">
                      {(["wrapper", "header", "footer"] as const).map((field) => (
                        <SelectChip key={field} label={field.charAt(0).toUpperCase() + field.slice(1)} selected={selectedLayouts.has(field)}
                          onClick={() => setSelectedLayouts((prev) => { const n = new Set(prev); n.has(field) ? n.delete(field) : n.add(field); return n; })} />
                      ))}
                    </div>
                  )}
                </TargetSection>
              </div>
              <div className="flex justify-end">
                {pendingToolType ? (
                  <button onClick={handleToolSubmit} disabled={isSubmitting || !hasAnyTarget()}
                    className={`inline-flex items-center gap-2 px-5 py-2.5 text-white rounded-lg text-sm font-medium hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all ${
                      pendingToolType === "ui_checker" ? "bg-purple-500" : "bg-blue-500"
                    }`}>
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : pendingToolType === "ui_checker" ? <Layout className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                    {pendingToolType === "ui_checker" ? "Run UI Check" : "Run Link Check"}
                  </button>
                ) : (
                  <button onClick={handleSubmit} disabled={!prompt.trim() || isSubmitting || !hasAnyTarget()}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-alloro-orange text-white rounded-lg text-sm font-medium hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Analyze
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {/* ---- ANALYZING STATE ---- */}
          {viewState === "analyzing" && (
            <motion.div key="analyzing" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-sm text-gray-800 font-medium mb-1">Analyzing your content...</p>
                <p className="text-xs text-gray-500 truncate">{batch?.prompt.slice(0, 120)}...</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center text-sm text-gray-600">
                  <Loader2 className="w-4 h-4 animate-spin text-alloro-orange mr-2" />
                  {stats.total > 0 ? `Found ${stats.total} recommendation(s) so far...` : "Scanning targets..."}
                </div>
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <motion.div className="h-full bg-alloro-orange rounded-full" animate={{ width: ["0%", "60%", "80%", "90%"] }} transition={{ duration: 30, ease: "easeOut" }} />
                </div>
              </div>
            </motion.div>
          )}

          {/* ---- EXECUTING STATE ---- */}
          {viewState === "executing" && (() => {
            const done = (stats.executed || 0) + (stats.failed || 0);
            const totalToProcess = done + (stats.approved || 0);
            const pct = totalToProcess > 0 ? Math.round((done / totalToProcess) * 100) : 0;
            return (
            <motion.div key="executing" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
              <div className="bg-alloro-orange/5 border border-alloro-orange/20 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Loader2 className="w-4 h-4 animate-spin text-alloro-orange" />
                  <p className="text-sm text-gray-800 font-medium">Executing approved changes...</p>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  {stats.executed || 0} completed{stats.failed > 0 ? `, ${stats.failed} failed` : ""} — {stats.approved || 0} remaining of {totalToProcess} total
                </p>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500 flex">
                    {(stats.executed || 0) > 0 && (
                      <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${totalToProcess > 0 ? ((stats.executed || 0) / totalToProcess) * 100 : 0}%` }} />
                    )}
                    {(stats.failed || 0) > 0 && (
                      <div className="h-full bg-red-500 transition-all duration-500" style={{ width: `${totalToProcess > 0 ? ((stats.failed || 0) / totalToProcess) * 100 : 0}%` }} />
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-2 text-[10px]">
                  {(stats.executed || 0) > 0 && <span className="flex items-center gap-1 text-green-600"><span className="w-2 h-2 rounded-full bg-green-500" />{stats.executed} done</span>}
                  {(stats.failed || 0) > 0 && <span className="flex items-center gap-1 text-red-500"><span className="w-2 h-2 rounded-full bg-red-500" />{stats.failed} failed</span>}
                  {(stats.approved || 0) > 0 && <span className="flex items-center gap-1 text-gray-400"><span className="w-2 h-2 rounded-full bg-gray-300" />{stats.approved} queued</span>}
                  <span className="ml-auto text-gray-400 font-mono">{pct}%</span>
                </div>
              </div>
              <RecommendationList recommendations={recommendations} expandedGroups={expandedGroups} toggleGroup={toggleGroup} onApproveReject={handleApproveReject} readonly loadingRecId={null} />
            </motion.div>
            );
          })()}

          {/* ---- RESULTS / COMPLETED STATE ---- */}
          {(viewState === "results" || viewState === "completed") && (
            <motion.div key="results" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
              <div className={`rounded-lg p-4 border ${viewState === "completed" ? "bg-green-50/60 border-green-200" : "bg-gray-50 border-gray-200"}`}>
                <div className="text-sm text-gray-800 prose prose-sm max-w-none prose-headings:text-sm prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1 prose-p:my-1 prose-ul:my-1 prose-li:my-0">
                  <ReactMarkdown>{batch?.summary || "Analysis complete."}</ReactMarkdown>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {stats.total > 0 && <StatBadge label="Total" count={stats.total} color="gray" />}
                  {stats.pending > 0 && <StatBadge label="Pending" count={stats.pending} color="slate" />}
                  {stats.approved > 0 && <StatBadge label="Approved" count={stats.approved} color="green" />}
                  {stats.rejected > 0 && <StatBadge label="Rejected" count={stats.rejected} color="red" />}
                  {stats.executed > 0 && <StatBadge label="Executed" count={stats.executed} color="alloro" />}
                  {stats.failed > 0 && <StatBadge label="Failed" count={stats.failed} color="red" />}
                </div>
              </div>

              {viewState === "results" && stats.total > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <button onClick={() => handleBulkAction("approved")} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors">
                      <Check className="w-3.5 h-3.5" /> Approve All
                    </button>
                    <button onClick={() => handleBulkAction("rejected")} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors">
                      <X className="w-3.5 h-3.5" /> Reject All
                    </button>
                  </div>
                  <button onClick={handleExecute} disabled={approvedCount === 0}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-alloro-orange text-white rounded-lg text-sm font-medium hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                    <Zap className="w-4 h-4" />
                    Execute {approvedCount} Change{approvedCount !== 1 ? "s" : ""}
                  </button>
                </div>
              )}

              {viewState === "completed" && (
                <div className="flex justify-end">
                  <button onClick={goToHistory} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Back to History
                  </button>
                </div>
              )}

              {recommendations.length > 0 ? (
                <RecommendationList recommendations={recommendations} expandedGroups={expandedGroups} toggleGroup={toggleGroup}
                  onApproveReject={handleApproveReject} readonly={viewState === "completed"} loadingRecId={loadingRecId} />
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
                  <p className="text-sm">No changes recommended. Content looks good.</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
