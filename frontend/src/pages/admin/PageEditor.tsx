import { AdminTopBar } from "../../components/Admin/shell/AdminTopBar";
import { LoadingIndicator } from "../../components/Admin/shell/LoadingIndicator";
import { SidebarProvider } from "../../components/Admin/shell/SidebarContext";
import EditorToolbar from "../../components/PageEditor/EditorToolbar";
import { EditorLoadingSkeleton } from "./PageEditor/EditorLoadingSkeleton";
import { EditorErrorState } from "./PageEditor/EditorErrorState";
import { PageEditorBody } from "./PageEditor/PageEditorBody";
import { VersionPreviewBanner } from "./PageEditor/VersionPreviewBanner";
import { EditorErrorBanner } from "./PageEditor/EditorErrorBanner";
import { PageEditorModals } from "./PageEditor/PageEditorModals";
import { usePageEditor } from "./usePageEditor";
import { usePageEditorActions } from "./usePageEditorActions";

function PageEditorInner() {
  const editor = usePageEditor();
  const actions = usePageEditorActions(editor);

  const {
    projectId,
    pageId,
    navigate,
    iframeRef,
    mediaApi,
    page,
    setPage,
    project,
    draftPageId,
    loading,
    error,
    sections,
    setSections,
    undoStack,
    redoStack,
    isDirty,
    setIsDirty,
    previewVersion,
    previewVersionHtml,
    showLeaveModal,
    setShowLeaveModal,
    showConflictModal,
    setShowConflictModal,
    recoveryPrompt,
    setRecoveryPrompt,
    publishLintWarnings,
    showFindReplace,
    setShowFindReplace,
    device,
    setDevice,
    observePreviewArea,
    deviceFrameStyle,
    deviceIframeStyle,
    isEditing,
    isSaving,
    isPublishing,
    showPublishModal,
    setShowPublishModal,
    showSuccessAlert,
    setShowSuccessAlert,
    successMessage,
    editError,
    setEditError,
    activeView,
    lastDebugInfo,
    systemPrompt,
    pendingSidebarAction,
    setPendingSidebarAction,
    selectedInfo,
    beginCanvasTextEditing,
    isCanvasTextEditing,
    regenerateModalOpen,
    setRegenerateModalOpen,
    regeneratingSectionNames,
    setRegeneratingSectionNames,
    regenerateSnapshotsRef,
    isLivePreview,
    sectionsRef,
    pushUndoSnapshot,
    handleIframeLoad,
  } = editor;

  const {
    handleSendEdit,
    handleApplyDirectEdit,
    rebuildPreviewHtml,
    handleUndo,
    handleRedo,
    handleToggleHidden,
    handleLiveTextRevert,
    handleLiveTextPreview,
    handleSave,
    handleSaveWithNote,
    handleForceSave,
    handlePublish,
    handlePublishConfirmed,
    handleViewChange,
    handleCodeSectionsChange,
    fetchAdminVersions,
    handlePreviewVersion,
    handleExitPreview,
    previewDiff,
    handleRestoreSection,
    handleRestoreVersion,
    handleOpenFindReplace,
    handleFindReplaceApplied,
    handleBackClick,
    currentChatMessages,
    previewHtml,
  } = actions;

  // --- Loading state ---
  if (loading) {
    return <EditorLoadingSkeleton />;
  }

  // --- Error state ---
  if (error || !page) {
    return (
      <EditorErrorState error={error} projectId={projectId} navigate={navigate} />
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Topbar loading indicator */}
      <LoadingIndicator />

      {/* Admin header */}
      <AdminTopBar />

      {/* Editor toolbar */}
      <EditorToolbar
        pagePath={page.path}
        pageVersion={page.version}
        pageStatus={page.status}
        device={device}
        onDeviceChange={setDevice}
        activeView={activeView}
        onViewChange={handleViewChange}
        onBack={handleBackClick}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSave={handleSave}
        onSaveWithNote={handleSaveWithNote}
        onPublish={handlePublish}
        onRegenerate={
          !isLivePreview && !loading && sections.length > 0 && activeView === "visual"
            ? () => {
                // Regen rebuilds the section from the SAVED draft server-side —
                // unsaved local edits to it would silently vanish in the swap.
                if (isDirty) {
                  setEditError(
                    "Save your changes before regenerating a section — regeneration works from the last saved draft."
                  );
                  return;
                }
                setRegenerateModalOpen(true);
              }
            : undefined
        }
        onFindReplace={
          page.page_type !== "artifact" && !isLivePreview
            ? handleOpenFindReplace
            : undefined
        }
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        isSaving={isSaving}
        isPublishing={isPublishing}
        isDirty={isDirty}
      />

      {/* Version preview banner */}
      {previewVersion && (
        <VersionPreviewBanner
          previewVersion={previewVersion}
          onRestoreVersion={handleRestoreVersion}
          onExitPreview={handleExitPreview}
        />
      )}

      {/* Error banner */}
      {editError && (
        <EditorErrorBanner
          editError={editError}
          onDismiss={() => setEditError(null)}
        />
      )}

      {/* Main content: iframe + editor sidebar */}
      <PageEditorBody
        page={page}
        project={project}
        projectId={projectId}
        pageId={pageId}
        draftPageId={draftPageId}
        sections={sections}
        activeView={activeView}
        device={device}
        isLivePreview={isLivePreview}
        regeneratingSectionNames={regeneratingSectionNames}
        previewVersion={previewVersion}
        previewVersionHtml={previewVersionHtml}
        previewHtml={previewHtml}
        deviceFrameStyle={deviceFrameStyle}
        deviceIframeStyle={deviceIframeStyle}
        observePreviewArea={observePreviewArea}
        iframeRef={iframeRef}
        mediaApi={mediaApi}
        selectedInfo={selectedInfo}
        isEditing={isEditing}
        isCanvasTextEditing={isCanvasTextEditing}
        currentChatMessages={currentChatMessages}
        lastDebugInfo={lastDebugInfo}
        systemPrompt={systemPrompt}
        pendingSidebarAction={pendingSidebarAction}
        previewDiff={previewDiff}
        setPage={setPage}
        handleCodeSectionsChange={handleCodeSectionsChange}
        handleSave={handleSave}
        handleIframeLoad={handleIframeLoad}
        beginCanvasTextEditing={beginCanvasTextEditing}
        handleApplyDirectEdit={handleApplyDirectEdit}
        handleSendEdit={handleSendEdit}
        handleToggleHidden={handleToggleHidden}
        setPendingSidebarAction={setPendingSidebarAction}
        handleLiveTextPreview={handleLiveTextPreview}
        handleLiveTextRevert={handleLiveTextRevert}
        fetchAdminVersions={fetchAdminVersions}
        handlePreviewVersion={handlePreviewVersion}
        handleRestoreVersion={handleRestoreVersion}
        handleRestoreSection={handleRestoreSection}
        handleExitPreview={handleExitPreview}
      />

      <PageEditorModals
        projectId={projectId}
        draftPageId={draftPageId}
        navigate={navigate}
        sectionsRef={sectionsRef}
        regenerateSnapshotsRef={regenerateSnapshotsRef}
        sections={sections}
        showLeaveModal={showLeaveModal}
        setShowLeaveModal={setShowLeaveModal}
        showPublishModal={showPublishModal}
        setShowPublishModal={setShowPublishModal}
        publishLintWarnings={publishLintWarnings}
        isPublishing={isPublishing}
        handlePublishConfirmed={handlePublishConfirmed}
        showConflictModal={showConflictModal}
        setShowConflictModal={setShowConflictModal}
        handleForceSave={handleForceSave}
        recoveryPrompt={recoveryPrompt}
        setRecoveryPrompt={setRecoveryPrompt}
        pushUndoSnapshot={pushUndoSnapshot}
        setSections={setSections}
        rebuildPreviewHtml={rebuildPreviewHtml}
        setIsDirty={setIsDirty}
        showSuccessAlert={showSuccessAlert}
        setShowSuccessAlert={setShowSuccessAlert}
        successMessage={successMessage}
        showFindReplace={showFindReplace}
        setShowFindReplace={setShowFindReplace}
        handleFindReplaceApplied={handleFindReplaceApplied}
        regenerateModalOpen={regenerateModalOpen}
        setRegenerateModalOpen={setRegenerateModalOpen}
        setRegeneratingSectionNames={setRegeneratingSectionNames}
        setPage={setPage}
      />
    </div>
  );
}

export default function PageEditor() {
  return (
    <SidebarProvider defaultCollapsed>
      <PageEditorInner />
    </SidebarProvider>
  );
}
