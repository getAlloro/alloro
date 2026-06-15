import { useEffect, useRef, useState } from "react";
import { X, Loader2, Search, Replace } from "lucide-react";
import {
  fetchWebsiteDetail,
  fetchPage,
  createDraftFromPage,
  updatePageSections,
  type WebsitePage,
  type ApiError,
} from "../../api/websites";
import {
  applyReplacements,
  countSectionMatches,
  matchKey,
  pickScanTargets,
  scanPageSections,
  type FindMatch,
} from "./findReplaceEngine";
import FindReplaceMatchList from "./FindReplaceMatchList";
import {
  FindReplaceSearchForm,
  FindReplaceResultSummary,
  type FindReplaceResult,
} from "./FindReplaceSteps";

export type FindReplaceModalProps = {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onApplied?: (summary: {
    pagesChanged: number;
    replacements: number;
    pageIds: string[];
  }) => void;
};

type Step = "search" | "review" | "apply" | "result";

export default function FindReplaceModal({
  projectId,
  isOpen,
  onClose,
  onApplied,
}: FindReplaceModalProps) {
  const [step, setStep] = useState<Step>("search");
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [noMatches, setNoMatches] = useState(false);
  const [matches, setMatches] = useState<FindMatch[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [applyProgress, setApplyProgress] = useState({ done: 0, total: 0 });
  const [summary, setSummary] = useState<FindReplaceResult | null>(null);
  const scannedPagesRef = useRef<Map<string, WebsitePage>>(new Map());
  const runIdRef = useRef(0);

  useEffect(() => {
    if (!isOpen) return;
    runIdRef.current += 1;
    setStep("search");
    setFindText("");
    setReplaceText("");
    setCaseSensitive(false);
    setIsScanning(false);
    setError(null);
    setNoMatches(false);
    setMatches([]);
    setSelectedKeys(new Set());
    setSummary(null);
    scannedPagesRef.current = new Map();
  }, [isOpen]);

  const canSearch = findText.length >= 2 && !isScanning;
  const isBusy = isScanning || step === "apply";

  const handleClose = () => {
    if (step === "apply") return;
    runIdRef.current += 1; // aborts an in-flight scan
    onClose();
  };

  const handleSearch = async () => {
    if (!canSearch) return;
    const runId = ++runIdRef.current;
    setIsScanning(true);
    setError(null);
    setNoMatches(false);
    try {
      const detail = await fetchWebsiteDetail(projectId);
      const targets = pickScanTargets(detail.data.pages ?? []);
      setScanProgress({ done: 0, total: targets.length });
      const found: FindMatch[] = [];
      const scanned = new Map<string, WebsitePage>();
      for (let i = 0; i < targets.length; i += 1) {
        if (runIdRef.current !== runId) return;
        setScanProgress({ done: i + 1, total: targets.length });
        const res = await fetchPage(projectId, targets[i].id);
        const page = res.data;
        scanned.set(page.id, page);
        found.push(
          ...scanPageSections(
            page.id,
            page.path,
            page.sections ?? [],
            findText,
            caseSensitive,
          ),
        );
      }
      if (runIdRef.current !== runId) return;
      scannedPagesRef.current = scanned;
      if (found.length === 0) {
        setNoMatches(true);
        return;
      }
      setMatches(found);
      setSelectedKeys(new Set(found.map((m) => matchKey(m))));
      setStep("review");
    } catch (err) {
      if (runIdRef.current === runId) {
        setError(err instanceof Error ? err.message : "Search failed");
      }
    } finally {
      if (runIdRef.current === runId) setIsScanning(false);
    }
  };

  const handleApply = async () => {
    const selected = matches.filter((m) => selectedKeys.has(matchKey(m)));
    const byPage = new Map<string, FindMatch[]>();
    selected.forEach((m) => {
      const list = byPage.get(m.pageId) ?? [];
      list.push(m);
      byPage.set(m.pageId, list);
    });
    const pageIds = Array.from(byPage.keys());
    setStep("apply");
    setApplyProgress({ done: 0, total: pageIds.length });

    const result: FindReplaceResult = {
      pagesChanged: 0,
      replacements: 0,
      pageIds: [],
      skipped: [],
    };
    for (let i = 0; i < pageIds.length; i += 1) {
      setApplyProgress({ done: i + 1, total: pageIds.length });
      const scannedPage = scannedPagesRef.current.get(pageIds[i]);
      const refs = byPage.get(pageIds[i]) ?? [];
      if (!scannedPage) continue;
      try {
        let targetPage = scannedPage;
        if (scannedPage.status === "published") {
          const draftRes = await createDraftFromPage(projectId, scannedPage.id);
          targetPage = draftRes.data;
          const scannedCounts = countSectionMatches(
            scannedPage.sections ?? [],
            findText,
            caseSensitive,
          );
          const draftCounts = countSectionMatches(
            targetPage.sections ?? [],
            findText,
            caseSensitive,
          );
          const identical =
            scannedCounts.length === draftCounts.length &&
            scannedCounts.every((count, idx) => count === draftCounts[idx]);
          if (!identical) {
            result.skipped.push({
              path: scannedPage.path,
              reason: "content changed, skipped",
            });
            continue;
          }
        }
        const applied = applyReplacements(
          targetPage.sections ?? [],
          refs,
          findText,
          replaceText,
          caseSensitive,
        );
        await updatePageSections(projectId, targetPage.id, applied.sections, undefined, {
          revisionNote: `Find & replace: "${findText}" → "${replaceText}"`,
          expectedUpdatedAt: targetPage.updated_at,
          force: false,
        });
        result.pagesChanged += 1;
        result.replacements += applied.replaced;
        result.pageIds.push(targetPage.id);
      } catch (err) {
        const apiErr = err as ApiError;
        result.skipped.push({
          path: scannedPage.path,
          reason:
            apiErr?.code === "STALE_WRITE"
              ? "page changed since scan, skipped"
              : `save failed (${apiErr?.message || "unknown error"}), skipped`,
        });
      }
    }
    setSummary(result);
    setStep("result");
    onApplied?.({
      pagesChanged: result.pagesChanged,
      replacements: result.replacements,
      pageIds: result.pageIds,
    });
  };

  const handleTogglePage = (pageId: string, selectAll: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      matches
        .filter((m) => m.pageId === pageId)
        .forEach((m) => (selectAll ? next.add(matchKey(m)) : next.delete(matchKey(m))));
      return next;
    });
  };

  const handleToggleMatch = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (!isOpen) return null;

  const scannedStatusByPageId: Record<string, string> = {};
  scannedPagesRef.current.forEach((page, pageId) => {
    scannedStatusByPageId[pageId] = page.status;
  });
  const allSelected = selectedKeys.size === matches.length && matches.length > 0;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={!isBusy ? handleClose : undefined}
      />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[85vh]">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
            <div className="flex items-center gap-2">
              <Replace className="h-4 w-4 text-alloro-orange" />
              <h2 className="text-base font-bold text-gray-900">Find &amp; Replace</h2>
            </div>
            <button
              onClick={handleClose}
              disabled={step === "apply"}
              aria-label="Close"
              className="rounded p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {step === "search" && (
              <FindReplaceSearchForm
                findText={findText}
                replaceText={replaceText}
                caseSensitive={caseSensitive}
                noMatches={noMatches}
                error={error}
                onFindTextChange={setFindText}
                onReplaceTextChange={setReplaceText}
                onCaseSensitiveChange={setCaseSensitive}
              />
            )}

            {step === "review" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() =>
                        setSelectedKeys(
                          allSelected
                            ? new Set()
                            : new Set(matches.map((m) => matchKey(m))),
                        )
                      }
                      className="h-3.5 w-3.5 rounded border-gray-300 text-alloro-orange focus:ring-alloro-orange/40"
                      aria-label="Select all matches"
                    />
                    <span className="text-xs font-medium text-gray-700">Select all</span>
                  </label>
                  <span className="text-xs text-gray-500">
                    {selectedKeys.size} of {matches.length} matches selected
                  </span>
                </div>
                <FindReplaceMatchList
                  matches={matches}
                  scannedStatusByPageId={scannedStatusByPageId}
                  selectedKeys={selectedKeys}
                  onToggleMatch={handleToggleMatch}
                  onTogglePage={handleTogglePage}
                />
              </div>
            )}

            {step === "apply" && (
              <div className="flex flex-col items-center justify-center gap-3 py-10">
                <Loader2 className="h-6 w-6 animate-spin text-alloro-orange" />
                <p className="text-sm text-gray-600">
                  Applying {applyProgress.done}/{applyProgress.total}…
                </p>
              </div>
            )}

            {step === "result" && summary && (
              <FindReplaceResultSummary summary={summary} />
            )}
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
            {step === "search" && (
              <>
                <button
                  onClick={handleClose}
                  disabled={isScanning}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSearch}
                  disabled={!canSearch}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-alloro-orange px-4 py-1.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
                >
                  {isScanning ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Scanning {scanProgress.done}/{scanProgress.total}…
                    </>
                  ) : (
                    <>
                      <Search className="h-3.5 w-3.5" />
                      Search
                    </>
                  )}
                </button>
              </>
            )}
            {step === "review" && (
              <>
                <button
                  onClick={() => setStep("search")}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
                >
                  Back
                </button>
                <button
                  onClick={handleApply}
                  disabled={selectedKeys.size === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-alloro-orange px-4 py-1.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
                >
                  <Replace className="h-3.5 w-3.5" />
                  Replace {selectedKeys.size} selected
                </button>
              </>
            )}
            {step === "result" && (
              <button
                onClick={handleClose}
                className="inline-flex items-center gap-1.5 rounded-lg bg-alloro-orange px-4 py-1.5 text-sm font-semibold text-white hover:bg-orange-600"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
