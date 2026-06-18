import type { RefObject } from "react";
import { Monitor, Smartphone, Search, Globe, Eye } from "lucide-react";
import { prepareHtmlForPreview } from "../../../hooks/useIframeSelector";
import { previewWithScrollbar } from "../templateDetail.utils";

export function PreviewPanel({
  previewMode,
  setPreviewMode,
  handlePreview,
  previewIframeRef,
  previewContent,
  handlePreviewIframeLoad,
  pageFavicon,
  pageTitle,
  pageUrl,
  pageDescription,
}: {
  previewMode: "desktop" | "mobile" | "seo";
  setPreviewMode: (mode: "desktop" | "mobile" | "seo") => void;
  handlePreview: () => void;
  previewIframeRef: RefObject<HTMLIFrameElement | null>;
  previewContent: string;
  handlePreviewIframeLoad: () => void;
  pageFavicon: string;
  pageTitle: string;
  pageUrl: string;
  pageDescription: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden flex flex-col" style={{ minHeight: 650 }}>
      <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
          </span>
          Live Preview
        </span>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-gray-200 bg-white p-0.5">
            <button
              onClick={() => setPreviewMode("desktop")}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition ${
                previewMode === "desktop"
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-400 hover:text-gray-600"
              }`}
              title="Desktop view"
            >
              <Monitor className="h-3 w-3" />
              <span>Desktop</span>
            </button>
            <button
              onClick={() => setPreviewMode("mobile")}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition ${
                previewMode === "mobile"
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-400 hover:text-gray-600"
              }`}
              title="Mobile view"
            >
              <Smartphone className="h-3 w-3" />
              <span>Mobile</span>
            </button>
            <button
              onClick={() => setPreviewMode("seo")}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition ${
                previewMode === "seo"
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-400 hover:text-gray-600"
              }`}
              title="SEO preview"
            >
              <Search className="h-3 w-3" />
              <span>SEO</span>
            </button>
          </div>
          <button
            onClick={handlePreview}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-50 hover:border-gray-300"
          >
            <Eye className="h-3 w-3" />
            Full Preview
          </button>
        </div>
      </div>
      <div
        className={`flex-1 overflow-hidden relative ${
          previewMode !== "desktop" ? "flex justify-center bg-gray-100" : ""
        }`}
        style={previewMode === "seo" ? { overflowY: "auto" } : undefined}
      >
        {previewMode === "desktop" ? (
          <div className="absolute inset-0 flex items-start justify-center p-4 overflow-hidden">
            <div className="w-full h-full flex flex-col">
              <div className="bg-gray-700 rounded-t-xl px-3 py-1.5 flex items-center gap-2 flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                </div>
                <div className="flex items-center gap-1.5 bg-gray-600 rounded-md px-2.5 py-1 max-w-[200px]">
                  {pageFavicon && (
                    <img src={pageFavicon} alt="" className="w-3 h-3 flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  )}
                  <span className="text-[10px] text-gray-200 truncate">
                    {pageTitle || "Untitled"}
                  </span>
                </div>
              </div>
              <div className="bg-gray-600 px-3 py-1 flex items-center gap-2 flex-shrink-0">
                <div className="flex-1 bg-gray-500 rounded-md px-2 py-0.5 flex items-center gap-1.5">
                  <Globe className="w-2.5 h-2.5 text-gray-300 flex-shrink-0" />
                  <span className="text-[10px] text-gray-300 truncate">
                    {pageUrl}
                  </span>
                </div>
              </div>
              <div className="flex-1 relative overflow-hidden bg-white border-x-2 border-gray-700">
                <iframe
                  ref={previewIframeRef}
                  srcDoc={previewWithScrollbar(prepareHtmlForPreview(previewContent))}
                  className="border-0 absolute top-0 left-0"
                  style={{
                    width: `${100 / 0.45}%`,
                    height: `${100 / 0.45}%`,
                    transform: "scale(0.45)",
                    transformOrigin: "top left",
                  }}
                  sandbox="allow-scripts allow-same-origin"
                  onLoad={handlePreviewIframeLoad}
                  title="Template Preview"
                />
              </div>
              <div className="bg-gray-700 rounded-b-xl h-2 flex-shrink-0" />
            </div>
          </div>
        ) : previewMode === "mobile" ? (
          <div className="flex items-start justify-center py-4">
            <div className="flex flex-col" style={{ width: 380 }}>
              <div className="bg-gray-800 rounded-t-[2rem] pt-2 px-6 flex-shrink-0">
                <div className="flex items-center justify-between text-[9px] text-gray-400 px-1 pb-1">
                  <span>9:41</span>
                  <div className="w-20 h-5 bg-gray-900 rounded-full mx-auto" />
                  <div className="flex items-center gap-1">
                    <span>5G</span>
                    <div className="w-4 h-2 border border-gray-400 rounded-sm">
                      <div className="w-2.5 h-full bg-gray-400 rounded-sm" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-800 px-3 py-1.5 flex items-center gap-2 flex-shrink-0">
                <div className="flex-1 bg-gray-700 rounded-full px-3 py-1 flex items-center gap-1.5">
                  <Globe className="w-2.5 h-2.5 text-gray-400 flex-shrink-0" />
                  <span className="text-[10px] text-gray-300 truncate">
                    {pageTitle || pageUrl}
                  </span>
                </div>
              </div>
              <div className="bg-white border-x-4 border-gray-800 h-full overflow-hidden" style={{ height: 560 }}>
                <iframe
                  ref={previewIframeRef}
                  srcDoc={previewWithScrollbar(prepareHtmlForPreview(previewContent))}
                  className="w-full h-full border-0"
                  sandbox="allow-scripts allow-same-origin"
                  onLoad={handlePreviewIframeLoad}
                  title="Template Preview (Mobile)"
                />
              </div>
              <div className="bg-gray-800 rounded-b-[2rem] px-6 py-2 flex items-center justify-center flex-shrink-0">
                <div className="w-28 h-1 bg-gray-600 rounded-full" />
              </div>
            </div>
          </div>
        ) : (
          /* SEO Preview */
          <div className="flex flex-col items-center py-6 px-4 w-full">
            <div className="w-full max-w-2xl space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-gray-200">
                <Search className="w-5 h-5 text-gray-400" />
                <span className="text-sm font-medium text-gray-500">
                  Google Search Preview
                </span>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Desktop Result
                </p>
                <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-1.5">
                  <div className="flex items-center gap-2">
                    {pageFavicon ? (
                      <img src={pageFavicon} alt="" className="w-7 h-7 rounded-full border border-gray-100 p-1" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                        <Globe className="w-3.5 h-3.5 text-gray-400" />
                      </div>
                    )}
                    <div className="flex flex-col">
                      <span className="text-sm text-gray-800">
                        {(() => {
                          try { return new URL(pageUrl).hostname; } catch { return "example.com"; }
                        })()}
                      </span>
                      <span className="text-xs text-gray-500 truncate max-w-md">
                        {pageUrl}
                      </span>
                    </div>
                  </div>
                  <h3 className="text-xl text-[#1a0dab] hover:underline cursor-pointer leading-snug">
                    {pageTitle || (
                      <span className="text-gray-300 italic">No &lt;title&gt; tag found</span>
                    )}
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed line-clamp-2">
                    {pageDescription || (
                      <span className="text-gray-300 italic">
                        No meta description found. Add a &lt;meta name="description" content="..."&gt; tag.
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex gap-4 px-1">
                  <span className={`text-[10px] font-medium ${
                    pageTitle.length === 0 ? "text-red-400" :
                    pageTitle.length > 60 ? "text-amber-500" : "text-green-500"
                  }`}>
                    Title: {pageTitle.length}/60 chars
                    {pageTitle.length === 0 && " — Missing!"}
                    {pageTitle.length > 60 && " — May be truncated"}
                  </span>
                  <span className={`text-[10px] font-medium ${
                    pageDescription.length === 0 ? "text-red-400" :
                    pageDescription.length > 160 ? "text-amber-500" : "text-green-500"
                  }`}>
                    Description: {pageDescription.length}/160 chars
                    {pageDescription.length === 0 && " — Missing!"}
                    {pageDescription.length > 160 && " — May be truncated"}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Mobile Result
                </p>
                <div className="bg-white rounded-xl border border-gray-200 p-4 max-w-sm space-y-1.5">
                  <div className="flex items-center gap-2">
                    {pageFavicon ? (
                      <img src={pageFavicon} alt="" className="w-6 h-6 rounded-full border border-gray-100 p-0.5" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
                        <Globe className="w-3 h-3 text-gray-400" />
                      </div>
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs text-gray-800 truncate">
                        {(() => {
                          try { return new URL(pageUrl).hostname; } catch { return "example.com"; }
                        })()}
                      </span>
                      <span className="text-[10px] text-gray-500 truncate">
                        {pageUrl}
                      </span>
                    </div>
                  </div>
                  <h3 className="text-base text-[#1a0dab] hover:underline cursor-pointer leading-snug line-clamp-2">
                    {pageTitle || (
                      <span className="text-gray-300 italic text-sm">No title</span>
                    )}
                  </h3>
                  <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">
                    {pageDescription || (
                      <span className="text-gray-300 italic">No description</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  SEO Checklist
                </p>
                <div className="space-y-2">
                  {[
                    {
                      ok: pageTitle.length > 0 && pageTitle.length <= 60,
                      warn: pageTitle.length > 60,
                      label: "Page title",
                      detail: pageTitle.length === 0
                        ? "Missing — add a <title> tag"
                        : pageTitle.length > 60
                        ? `${pageTitle.length} chars — recommended max is 60`
                        : `${pageTitle.length} chars — good length`,
                    },
                    {
                      ok: pageDescription.length > 0 && pageDescription.length <= 160,
                      warn: pageDescription.length > 160,
                      label: "Meta description",
                      detail: pageDescription.length === 0
                        ? 'Missing — add <meta name="description" content="...">'
                        : pageDescription.length > 160
                        ? `${pageDescription.length} chars — recommended max is 160`
                        : `${pageDescription.length} chars — good length`,
                    },
                    {
                      ok: pageUrl !== "https://example.com",
                      warn: false,
                      label: "Canonical URL",
                      detail: pageUrl === "https://example.com"
                        ? 'Not set — add <link rel="canonical" href="...">'
                        : pageUrl,
                    },
                    {
                      ok: pageFavicon.length > 0,
                      warn: false,
                      label: "Favicon",
                      detail: pageFavicon.length === 0
                        ? 'Missing — add <link rel="icon" href="...">'
                        : "Found",
                    },
                  ].map((item) => (
                    <div key={item.label} className="flex items-start gap-2.5">
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        item.ok ? "bg-green-100" : item.warn ? "bg-amber-100" : "bg-red-100"
                      }`}>
                        <span className={`text-[10px] font-bold ${
                          item.ok ? "text-green-600" : item.warn ? "text-amber-600" : "text-red-500"
                        }`}>
                          {item.ok ? "✓" : item.warn ? "!" : "✕"}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-gray-700">{item.label}</span>
                        <p className="text-[11px] text-gray-500">{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
