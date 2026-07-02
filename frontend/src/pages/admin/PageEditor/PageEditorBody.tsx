import type { CSSProperties, Dispatch, RefObject, SetStateAction } from "react";
import type { WebsitePage, WebsiteProjectWithPages, SeoData, EditDebugInfo } from "../../../api/websites";
import type { Section } from "../../../api/templates";
import type { MediaItem } from "../../../api/websiteMedia";
import type { MediaApi } from "../../../components/PageEditor/MediaBrowser";
import type { ChatMessage } from "../../../components/PageEditor/ChatPanel";
import type { SelectedInfo, QuickActionType } from "../../../hooks/useIframeSelector";
import { prepareHtmlForPreview } from "../../../hooks/useIframeSelector";
import type { DirectEditorOperation } from "../../../utils/editorDirectOperations";
import type { SectionDiffEntry } from "../../../utils/sectionDiff";
import type { PageVersion } from "../../../components/PageEditor/VersionHistoryTab";
import { AdminSidebar } from "../../../components/Admin/shell/AdminSidebar";
import EditorSidebar from "../../../components/PageEditor/EditorSidebar";
import InlineEditorPopover from "../../../components/PageEditor/InlineEditorPopover";
import SeoPanel from "../../../components/PageEditor/SeoPanel";
import SectionsEditor from "../../../components/Admin/page-pipeline/SectionsEditor";
import ProgressivePagePreview from "../../../components/Admin/page-pipeline/ProgressivePagePreview";
import { ArtifactEditorView } from "./ArtifactEditorView";

type EditorView = "visual" | "code" | "seo";

export function PageEditorBody({
  page,
  project,
  projectId,
  pageId,
  draftPageId,
  sections,
  activeView,
  device,
  isLivePreview,
  regeneratingSectionNames,
  previewVersion,
  previewVersionHtml,
  previewHtml,
  deviceFrameStyle,
  deviceIframeStyle,
  observePreviewArea,
  iframeRef,
  mediaApi,
  selectedInfo,
  isEditing,
  isCanvasTextEditing,
  currentChatMessages,
  lastDebugInfo,
  systemPrompt,
  pendingSidebarAction,
  previewDiff,
  setPage,
  handleCodeSectionsChange,
  handleSave,
  handleIframeLoad,
  beginCanvasTextEditing,
  handleApplyDirectEdit,
  handleSendEdit,
  handleToggleHidden,
  setPendingSidebarAction,
  handleLiveTextPreview,
  handleLiveTextRevert,
  fetchAdminVersions,
  handlePreviewVersion,
  handleRestoreVersion,
  handleRestoreSection,
  handleExitPreview,
}: {
  page: WebsitePage;
  project: WebsiteProjectWithPages | null;
  projectId: string | undefined;
  pageId: string | undefined;
  draftPageId: string | null;
  sections: Section[];
  activeView: EditorView;
  device: "desktop" | "mobile";
  isLivePreview: boolean;
  regeneratingSectionNames: Set<string>;
  previewVersion: PageVersion | null;
  previewVersionHtml: string;
  previewHtml: string;
  deviceFrameStyle: CSSProperties;
  deviceIframeStyle: CSSProperties;
  observePreviewArea: (el: HTMLDivElement | null) => void;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  mediaApi: MediaApi | undefined;
  selectedInfo: SelectedInfo | null;
  isEditing: boolean;
  isCanvasTextEditing: boolean;
  currentChatMessages: ChatMessage[];
  lastDebugInfo: EditDebugInfo | null;
  systemPrompt: string | null;
  pendingSidebarAction: QuickActionType | null;
  previewDiff: SectionDiffEntry[] | null;
  setPage: Dispatch<SetStateAction<WebsitePage | null>>;
  handleCodeSectionsChange: (updated: Section[]) => void;
  handleSave: () => void;
  handleIframeLoad: () => void;
  beginCanvasTextEditing: () => boolean;
  handleApplyDirectEdit: (operation: DirectEditorOperation, overrideAlloroClass?: string) => void;
  handleSendEdit: (instruction: string, attachedMedia?: MediaItem[]) => void;
  handleToggleHidden: () => void;
  setPendingSidebarAction: Dispatch<SetStateAction<QuickActionType | null>>;
  handleLiveTextPreview: (value: string) => void;
  handleLiveTextRevert: () => void;
  fetchAdminVersions: (pid: string) => Promise<PageVersion[]>;
  handlePreviewVersion: (version: PageVersion) => void;
  handleRestoreVersion: (versionId: string) => Promise<void>;
  handleRestoreSection: (name: string) => void;
  handleExitPreview: () => void;
}) {
  return (
    <div className="flex-1 flex overflow-hidden relative ml-[72px]">
      {/* Admin sidebar — fixed position, collapsed by default.
          Offset below both AdminTopBar (4rem) and EditorToolbar (~41px).
          ml-[72px] on parent reserves space for the collapsed sidebar. */}
      <AdminSidebar topOffset="calc(4rem + 41px)" />

      {/* Artifact page: show upload UI instead of editor */}
      {page.page_type === "artifact" ? (
        <ArtifactEditorView
          projectId={projectId!}
          page={page}
          onReplaced={(updated) => setPage(updated)}
        />
      ) : activeView === "seo" ? (
        <div className="flex-1 overflow-hidden">
          <SeoPanel
            projectId={projectId!}
            entityId={draftPageId!}
            entityType="page"
            seoData={page.seo_data}
            pagePath={page.path}
            pageContent={sections.map((s) => s.content || "").join("\n")}
            homepageContent=""
            headerHtml={project?.header || ""}
            footerHtml={project?.footer || ""}
            wrapperHtml={project?.wrapper || ""}
            onSeoDataChange={(data: SeoData) => {
              setPage((prev) => prev ? { ...prev, seo_data: data } : prev);
            }}
            organizationId={project?.organization?.id}
            currentVersion={page.version}
            // Primary host only: when a custom domain exists, a canonical
            // pointing at the internal generated hostname is a real defect
            // (it tells Google the page lives on the wrong host).
            siteHosts={
              project?.custom_domain
                ? [project.custom_domain]
                : [project?.generated_hostname ? `${project.generated_hostname}.sites.getalloro.com` : null]
            }
          />
        </div>
      ) : activeView === "code" ? (
        <>
          <div className="flex-1 overflow-hidden">
            <SectionsEditor
              sections={sections}
              onChange={handleCodeSectionsChange}
              onSave={handleSave}
            />
          </div>
          <div ref={observePreviewArea} className="flex-1 bg-gray-100 p-4 overflow-hidden flex items-start justify-center">
            <div
              className="relative h-full rounded-xl overflow-hidden shadow-lg border border-gray-200 transition-all duration-300 mx-auto bg-white"
              style={deviceFrameStyle}
            >
              <iframe
                srcDoc={prepareHtmlForPreview(previewHtml)}
                sandbox="allow-same-origin allow-scripts"
                className="border-0 bg-white"
                style={deviceIframeStyle}
              />
            </div>
          </div>
        </>
      ) : (
        <>
          <div ref={observePreviewArea} className="flex-1 bg-gray-100 p-4 overflow-hidden flex items-start justify-center">
            <div
              className="relative h-full rounded-xl overflow-hidden shadow-lg border border-gray-200 transition-all duration-300 mx-auto bg-white"
              style={deviceFrameStyle}
            >
              {isLivePreview && regeneratingSectionNames.size === 0 ? (
                <ProgressivePagePreview
                  projectId={projectId || ""}
                  pageId={pageId || ""}
                />
              ) : (
                <iframe
                  ref={iframeRef}
                  srcDoc={prepareHtmlForPreview(
                    previewVersion ? previewVersionHtml : previewHtml
                  )}
                  sandbox="allow-same-origin allow-scripts"
                  onLoad={previewVersion ? undefined : handleIframeLoad}
                  className="border-0 bg-white"
                  style={deviceIframeStyle}
                />
              )}
              {!isLivePreview && !previewVersion && (
                <div className="absolute inset-0 pointer-events-none">
                  <InlineEditorPopover
                    selectedInfo={selectedInfo}
                    mediaApi={mediaApi}
                    isEditing={isEditing}
                    isCanvasTextEditing={isCanvasTextEditing}
                    onStartCanvasTextEdit={beginCanvasTextEditing}
                    onApplyDirectEdit={handleApplyDirectEdit}
                  />
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Editor sidebar — shown only in visual view, hidden during live preview */}
      {activeView === "visual" && !isLivePreview && (
        <EditorSidebar
          selectedInfo={selectedInfo}
          chatMessages={currentChatMessages}
          onSendEdit={handleSendEdit}
          onApplyDirectEdit={handleApplyDirectEdit}
          onToggleHidden={handleToggleHidden}
          isEditing={isEditing}
          debugInfo={lastDebugInfo}
          systemPrompt={systemPrompt}
          mediaApi={mediaApi}
          externalAction={pendingSidebarAction !== ("__deferred__" as QuickActionType) ? pendingSidebarAction : null}
          onExternalActionHandled={() => setPendingSidebarAction(null)}
          isCanvasTextEditing={isCanvasTextEditing}
          onLiveTextPreview={handleLiveTextPreview}
          onLiveTextRevert={handleLiveTextRevert}
          primaryColor={project?.primary_color}
          accentColor={project?.accent_color}
          editViewport={device}
          showHistory={true}
          historyPageId={draftPageId}
          fetchVersions={fetchAdminVersions}
          allowRestorePublished={true}
          onPreviewVersion={handlePreviewVersion}
          onRestoreVersion={handleRestoreVersion}
          previewDiff={previewDiff}
          onRestoreSection={handleRestoreSection}
          isPreviewingVersion={!!previewVersion}
          previewVersionId={previewVersion?.id || null}
          onExitPreview={handleExitPreview}
        />
      )}
    </div>
  );
}
