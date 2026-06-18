import { motion, AnimatePresence } from "framer-motion";
import {
  RotateCcw,
  Loader2,
} from "lucide-react";
import { apiPost, apiDelete } from "../api";
import ConnectDomainModal from "../components/Admin/website-tabs/ConnectDomainModal";
import FormSubmissionsTab from "../components/Admin/leadgen/FormSubmissionsTab";
import PostsTab from "../components/Admin/website-tabs/PostsTab";
import MenusTab from "../components/Admin/website-tabs/MenusTab";
import RecipientsConfig from "../components/Admin/leadgen/RecipientsConfig";
import { WebsiteOverview } from "../components/website/overview/WebsiteOverview";
import { KeywordsTab } from "../components/website/KeywordsTab";
import { WebsitePagesTab } from "../components/website/WebsitePagesTab";
import { WebsiteLoadingSkeleton } from "../components/website/WebsiteLoadingSkeleton";
import { prepareHtmlForPreview } from "../hooks/useIframeSelector";
import type { QuickActionType } from "../hooks/useIframeSelector";
import EditorSidebar from "../components/PageEditor/EditorSidebar";
import InlineEditorPopover from "../components/PageEditor/InlineEditorPopover";
import { ConfirmModal } from "../components/settings/ConfirmModal";
import {
  DESKTOP_SCALE,
  userFetchRecipients,
  userUpdateRecipients,
  userFetchSubmissions,
  userToggleRead,
  userDeleteSubmission,
  userMarkAllRead,
  userFetchFormCatalog,
  userUpdateFormRecipientRule,
  userUpdateFormPreferences,
  userFetchPosts,
  userCreatePost,
  userUpdatePost,
  userDeletePost,
  userDuplicatePost,
  userFetchPostTypes,
  userFetchCategories,
  userFetchTags,
  userCreateCategory,
  userCreateTag,
  userUpdatePostSeo,
  userFetchMenus,
  userFetchMenu,
  userCreateMenu,
  userUpdateMenu,
  userDeleteMenu,
  userCreateMenuItem,
  userUpdateMenuItem,
  userDeleteMenuItem,
  userReorderMenuItems,
  handleExportSubmissions,
} from "./dfyWebsite.utils";
import { PreparingState } from "./DFYWebsite/PreparingState";
import { ReadOnlyState } from "./DFYWebsite/ReadOnlyState";
import { EmptyState } from "./DFYWebsite/EmptyState";
import { EditorToolbar } from "./DFYWebsite/EditorToolbar";
import { DashboardHeader } from "./DFYWebsite/DashboardHeader";
import { useDfyWebsite } from "./useDfyWebsite";

export function DFYWebsite() {
  const {
    loading,
    status,
    project,
    pages,
    selectedPage,
    setSelectedPage,
    showDomainModal,
    setShowDomainModal,
    activeView,
    viewportMode,
    setViewportMode,
    previewVersion,
    setPreviewVersion,
    previewHtmlContent,
    setPreviewHtmlContent,
    resolvedHtmlContent,
    isEditing,
    editError,
    setEditError,
    undoStack,
    redoStack,
    isDirty,
    isResolving,
    isSaving,
    pendingSidebarAction,
    setPendingSidebarAction,
    showConflictModal,
    setShowConflictModal,
    recoveryPrompt,
    setRecoveryPrompt,
    setUndoStack,
    setRedoStack,
    setSections,
    sectionsRef,
    mediaApi,
    setWebsiteTab,
    iframeRef,
    rebuildHtml,
    selectedInfo,
    setIsDirty,
    fetchWebsite,
    handleIframeLoad,
    handleSendEdit,
    handleApplyDirectEdit,
    handleLiveTextRevert,
    handleLiveTextPreview,
    handleToggleHidden,
    handleUndo,
    handleRedo,
    handleSave,
    handleForceSave,
    handlePreviewVersion,
    handleExitPreview,
    handleRestoreVersion,
    beginCanvasTextEditing,
    isCanvasTextEditing,
    currentChatMessages,
  } = useDfyWebsite();

  // --- Loading skeleton (matches the view being loaded) ---
  if (loading) {
    return <WebsiteLoadingSkeleton editor={activeView === "editor"} />;
  }

  if (status === "PREPARING") {
    return <PreparingState />;
  }

  if (status === "READ_ONLY") {
    return <ReadOnlyState />;
  }

  // Empty state — project exists but no pages yet
  if (status === "READY" && pages.length === 0) {
    return <EmptyState />;
  }

  const liveUrl =
    project?.custom_domain && project?.domain_verified_at
      ? `https://${project.custom_domain}`
      : project
        ? `https://${project.hostname}.sites.getalloro.com`
        : null;

  // Shared dashboard header (intro heading + pill tabs + site actions). Rendered
  // INSIDE each non-editor view's scroll area so it scrolls instead of sticking.
  const dashboardHeader = (
    <DashboardHeader
      project={project}
      liveUrl={liveUrl}
      activeView={activeView}
      onConnectDomain={() => setShowDomainModal(true)}
      setWebsiteTab={setWebsiteTab}
    />
  );

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Editor toolbar — focused editing mode (reached from the Pages tab) */}
      {activeView === "editor" && (
        <EditorToolbar
          selectedPage={selectedPage}
          viewportMode={viewportMode}
          setViewportMode={setViewportMode}
          isDirty={isDirty}
          isSaving={isSaving}
          onSave={handleSave}
          setWebsiteTab={setWebsiteTab}
        />
      )}

      {/* Error banner */}
      {editError && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-center justify-between">
          <span className="text-xs text-red-600">{editError}</span>
          <button
            onClick={() => setEditError(null)}
            className="text-xs text-red-400 hover:text-red-600"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Content */}
      {activeView === "overview" ? (
        <div className="flex-1 overflow-y-auto bg-alloro-bg">
          {dashboardHeader}
          <WebsiteOverview
            pageCount={pages.length}
            templateId={project?.template_id ?? null}
            onOpenTab={(tab) => setWebsiteTab(tab)}
          />
        </div>
      ) : activeView === "pages" ? (
        <div className="flex-1 overflow-y-auto bg-alloro-bg">
          {dashboardHeader}
          <WebsitePagesTab
            pages={pages}
            onOpenPage={(pageId) => {
              const target = pages.find((p) => p.id === pageId);
              if (target) setSelectedPage(target);
              setPreviewVersion(null);
              setPreviewHtmlContent("");
              setWebsiteTab("editor");
            }}
          />
        </div>
      ) : activeView === "submissions" ? (
        <div className="flex-1 overflow-y-auto bg-alloro-bg" data-wizard-target="website-submissions">
          {dashboardHeader}
          <div className="mx-auto w-full max-w-[960px] px-4 py-6 sm:px-6 lg:px-8">
          {project && (
            <>
              <FormSubmissionsTab
                projectId={project.id}
                fetchSubmissionsFn={userFetchSubmissions}
                fetchFormCatalogFn={userFetchFormCatalog}
                fetchRecipientsFn={userFetchRecipients}
                updateFormRecipientRuleFn={userUpdateFormRecipientRule}
                updateFormPreferencesFn={userUpdateFormPreferences}
                markAllReadFn={userMarkAllRead}
                formCatalogQueryScope="client"
                toggleReadFn={userToggleRead}
                deleteSubmissionFn={userDeleteSubmission}
                onExport={handleExportSubmissions}
                settingsContent={
                  <div className="space-y-5">
                    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                      <h3 className="mb-3 text-sm font-semibold text-gray-900">
                        Default Recipients
                      </h3>
                      <RecipientsConfig
                        projectId={project.id}
                        fetchRecipientsFn={userFetchRecipients}
	                        updateRecipientsFn={userUpdateRecipients}
	                      />
	                    </div>
	                  </div>
	                }
	              />
            </>
          )}
          </div>
        </div>
      ) : activeView === "posts" ? (
        <div className="flex-1 overflow-y-auto bg-alloro-bg">
          {dashboardHeader}
          <div className="mx-auto w-full max-w-[960px] px-4 py-6 sm:px-6 lg:px-8">
          {project && project.template_id && (
            <PostsTab
              projectId={project.id}
              templateId={project.template_id}
              organizationId={project.organization_id || undefined}
              borderless
              surface="client"
              fetchPostsFn={userFetchPosts}
              createPostFn={userCreatePost}
              updatePostFn={userUpdatePost}
              deletePostFn={userDeletePost}
              duplicatePostFn={userDuplicatePost}
              fetchPostTypesFn={userFetchPostTypes}
              fetchCategoriesFn={userFetchCategories}
              fetchTagsFn={userFetchTags}
              createCategoryFn={userCreateCategory}
              createTagFn={userCreateTag}
              updatePostSeoFn={userUpdatePostSeo}
            />
          )}
          </div>
        </div>
      ) : activeView === "menus" ? (
        <div className="flex-1 overflow-y-auto bg-alloro-bg">
          {dashboardHeader}
          <div className="mx-auto w-full max-w-[960px] px-4 py-6 sm:px-6 lg:px-8">
          {project && (
            <MenusTab
              projectId={project.id}
              templateId={project.template_id}
              borderless
              fetchMenusFn={userFetchMenus}
              fetchMenuFn={userFetchMenu}
              createMenuFn={userCreateMenu}
              updateMenuFn={userUpdateMenu}
              deleteMenuFn={userDeleteMenu}
              createMenuItemFn={userCreateMenuItem}
              updateMenuItemFn={userUpdateMenuItem}
              deleteMenuItemFn={userDeleteMenuItem}
              reorderMenuItemsFn={userReorderMenuItems}
              fetchPostsFn={userFetchPosts}
              fetchPostTypesFn={userFetchPostTypes}
            />
          )}
          </div>
        </div>
      ) : activeView === "keywords" ? (
        <div className="flex-1 overflow-y-auto bg-alloro-bg">
          {dashboardHeader}
          <KeywordsTab />
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 overflow-hidden" data-wizard-target="website-editor">
          {/* Preview */}
          <div className="flex-1 flex flex-col relative">
            <div className="flex-1 overflow-hidden bg-gray-100 relative">
              {/* Loading overlay for page switching / shortcode resolution */}
              {isResolving && (
                <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-20 flex items-center justify-center">
                  <div className="flex items-center gap-2 bg-white rounded-xl shadow-lg px-4 py-3">
                    <Loader2 className="w-4 h-4 text-alloro-orange animate-spin" />
                    <span className="text-sm text-gray-600">Loading preview...</span>
                  </div>
                </div>
              )}
              {viewportMode === "desktop" ? (
                <>
                  <iframe
                    ref={iframeRef}
                    srcDoc={prepareHtmlForPreview(
                      previewVersion ? previewHtmlContent : resolvedHtmlContent,
                    )}
                    style={{
                      width: `${Math.round(100 / DESKTOP_SCALE)}%`,
                      height: `${Math.round(100 / DESKTOP_SCALE)}%`,
                      transform: `scale(${DESKTOP_SCALE})`,
                      transformOrigin: "top left",
                    }}
                    className="border-0"
                    title="Page Preview"
                    sandbox="allow-same-origin allow-scripts"
                    onLoad={previewVersion ? undefined : handleIframeLoad}
                  />
                  <div
                    className="absolute left-0 top-0 pointer-events-none"
                    style={{
                      width: `${Math.round(100 / DESKTOP_SCALE)}%`,
                      height: `${Math.round(100 / DESKTOP_SCALE)}%`,
                      transform: `scale(${DESKTOP_SCALE})`,
                      transformOrigin: "top left",
                    }}
                  >
                    <InlineEditorPopover
                      selectedInfo={previewVersion ? null : selectedInfo}
                      mediaApi={mediaApi}
                      isEditing={isEditing}
                      isCanvasTextEditing={isCanvasTextEditing}
                      onStartCanvasTextEdit={beginCanvasTextEditing}
                      onApplyDirectEdit={handleApplyDirectEdit}
                    />
                  </div>
                </>
              ) : (
                <div className="flex justify-center h-full py-4">
                  <div className="relative w-[375px] h-full bg-white rounded-2xl shadow-xl border border-gray-300 overflow-hidden">
                    <iframe
                      ref={iframeRef}
                      srcDoc={prepareHtmlForPreview(
                        previewVersion ? previewHtmlContent : resolvedHtmlContent,
                      )}
                      className="w-full h-full border-0"
                      title="Page Preview"
                      sandbox="allow-same-origin allow-scripts"
                      onLoad={previewVersion ? undefined : handleIframeLoad}
                    />
                    <div className="absolute inset-0 pointer-events-none">
                      <InlineEditorPopover
                        selectedInfo={previewVersion ? null : selectedInfo}
                        mediaApi={mediaApi}
                        isEditing={isEditing}
                        isCanvasTextEditing={isCanvasTextEditing}
                        onStartCanvasTextEdit={beginCanvasTextEditing}
                        onApplyDirectEdit={handleApplyDirectEdit}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Version preview overlay */}
            <AnimatePresence>
              {previewVersion && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.2 }}
                  className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white border border-gray-200 rounded-xl shadow-xl px-5 py-3 flex items-center gap-4 z-10"
                >
                  <div className="text-sm">
                    <p className="text-gray-700 font-medium">
                      Previewing v{previewVersion.version}
                    </p>
                    <p className="text-xs text-gray-400">
                      Editing is disabled in preview mode
                    </p>
                  </div>
                  <button
                    onClick={() => handleRestoreVersion(previewVersion.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-alloro-orange text-white text-xs font-medium hover:bg-alloro-orange/90 transition-colors"
                  >
                    <RotateCcw size={12} />
                    Restore this version
                  </button>
                  <button
                    onClick={handleExitPreview}
                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    Exit
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {!previewVersion && (
              <button
                type="button"
                onClick={() =>
                  document.dispatchEvent(new CustomEvent("alloro:open-support"))
                }
                className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1.5 text-[10px] text-white backdrop-blur-sm transition-colors hover:bg-black/75"
              >
                Alloro editor is in beta — found a bug or need a change?{" "}
                <span className="font-semibold underline">Report it</span>
              </button>
            )}
          </div>

          {/* Editor Sidebar (no debug tab, with history tab) */}
          <EditorSidebar
            selectedInfo={previewVersion ? null : selectedInfo}
            chatMessages={currentChatMessages}
            onSendEdit={handleSendEdit}
            onApplyDirectEdit={handleApplyDirectEdit}
            onToggleHidden={handleToggleHidden}
            isEditing={isEditing}
            debugInfo={null}
            systemPrompt={null}
            mediaApi={mediaApi}
            showDebug={false}
            showHistory={true}
            historyPageId={selectedPage?.id || null}
            onPreviewVersion={handlePreviewVersion}
            onRestoreVersion={handleRestoreVersion}
            isPreviewingVersion={!!previewVersion}
            previewVersionId={previewVersion?.id || null}
            onExitPreview={handleExitPreview}
            externalAction={
              pendingSidebarAction !==
              ("__deferred__" as QuickActionType)
                ? pendingSidebarAction
                : null
            }
            onExternalActionHandled={() => setPendingSidebarAction(null)}
            primaryColor={project?.primary_color}
            accentColor={project?.accent_color}
            isCanvasTextEditing={isCanvasTextEditing}
            onLiveTextPreview={handleLiveTextPreview}
            onLiveTextRevert={handleLiveTextRevert}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
            onUndo={handleUndo}
            onRedo={handleRedo}
            editViewport={viewportMode}
          />
        </div>
      )}

      {/* Save Conflict Modal (409 STALE_WRITE) */}
      <ConfirmModal
        isOpen={showConflictModal}
        onClose={() => setShowConflictModal(false)}
        onConfirm={handleForceSave}
        title="Page Changed Elsewhere"
        message="This page was saved from somewhere else after you loaded it. Saving anyway overwrites that version (it stays in History). Keep editing to review first — your work is also backed up locally."
        confirmText="Save Anyway"
        cancelText="Keep Editing"
        type="warning"
      />

      {/* Crash Recovery Modal */}
      <ConfirmModal
        isOpen={recoveryPrompt !== null}
        onClose={() => setRecoveryPrompt(null)}
        onConfirm={() => {
          if (recoveryPrompt) {
            setUndoStack((prev) => [
              ...prev,
              { sections: structuredClone(sectionsRef.current) },
            ]);
            setRedoStack([]);
            setSections(recoveryPrompt);
            rebuildHtml(recoveryPrompt);
            setIsDirty(true);
          }
          setRecoveryPrompt(null);
        }}
        title="Recover Unsaved Changes?"
        message="We found unsaved edits from a previous session that are newer than the saved page. Recover them into the editor?"
        confirmText="Recover"
        cancelText="Not Now"
        type="info"
      />

      {/* Custom Domain Modal */}
      {project && (
        <ConnectDomainModal
          isOpen={showDomainModal}
          onClose={() => setShowDomainModal(false)}
          projectId={project.id}
          currentDomain={project.custom_domain}
          domainVerifiedAt={project.domain_verified_at}
          onDomainChange={fetchWebsite}
          onConnect={async (domain) => {
            const res = await apiPost({
              path: "/user/website/domain/connect",
              passedData: { domain },
            });
            return { server_ip: res.data.server_ip };
          }}
          onVerify={async () => {
            const res = await apiPost({
              path: "/user/website/domain/verify",
            });
            return res.data;
          }}
          onDisconnect={async () => {
            await apiDelete({ path: "/user/website/domain/disconnect" });
          }}
        />
      )}
    </div>
  );
}
