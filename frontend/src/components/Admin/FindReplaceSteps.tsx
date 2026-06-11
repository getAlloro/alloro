import { CheckCircle, AlertCircle } from "lucide-react";

export type SkippedPage = { path: string; reason: string };

export type FindReplaceResult = {
  pagesChanged: number;
  replacements: number;
  pageIds: string[];
  skipped: SkippedPage[];
};

export type FindReplaceSearchFormProps = {
  findText: string;
  replaceText: string;
  caseSensitive: boolean;
  noMatches: boolean;
  error: string | null;
  onFindTextChange: (value: string) => void;
  onReplaceTextChange: (value: string) => void;
  onCaseSensitiveChange: (value: boolean) => void;
};

export function FindReplaceSearchForm({
  findText,
  replaceText,
  caseSensitive,
  noMatches,
  error,
  onFindTextChange,
  onReplaceTextChange,
  onCaseSensitiveChange,
}: FindReplaceSearchFormProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1" htmlFor="fr-find">
          Find
        </label>
        <input
          id="fr-find"
          type="text"
          value={findText}
          onChange={(e) => onFindTextChange(e.target.value)}
          placeholder="e.g., (555) 123-4567"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-alloro-orange/30"
        />
        <p className="text-[11px] text-gray-400 mt-1">
          Plain text only (no regex), minimum 2 characters. Matches within a
          single text run — text spanning multiple elements won't match. Also
          checks tel:/mailto: links.
        </p>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1" htmlFor="fr-replace">
          Replace with
        </label>
        <input
          id="fr-replace"
          type="text"
          value={replaceText}
          onChange={(e) => onReplaceTextChange(e.target.value)}
          placeholder="Leave empty to delete the matched text"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-alloro-orange/30"
        />
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={caseSensitive}
          onChange={(e) => onCaseSensitiveChange(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-gray-300 text-alloro-orange focus:ring-alloro-orange/40"
        />
        <span className="text-xs font-medium text-gray-700">Case sensitive</span>
      </label>
      {noMatches && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-600">
          No matches found across this site's pages.
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}

export type FindReplaceResultSummaryProps = {
  summary: FindReplaceResult;
};

export function FindReplaceResultSummary({ summary }: FindReplaceResultSummaryProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5">
        <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
        <p className="text-sm text-emerald-800">
          {summary.replacements}{" "}
          {summary.replacements === 1 ? "replacement" : "replacements"} across{" "}
          {summary.pagesChanged} {summary.pagesChanged === 1 ? "page" : "pages"}.
        </p>
      </div>
      {summary.skipped.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-xs font-semibold text-amber-800">Skipped pages</p>
          </div>
          <ul className="text-xs text-amber-800 space-y-0.5 pl-6 list-disc">
            {summary.skipped.map((s) => (
              <li key={s.path}>
                <span className="font-medium">{s.path}</span> — {s.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-gray-500">
        Changes were saved to drafts only — review and publish each page.
      </p>
    </div>
  );
}
