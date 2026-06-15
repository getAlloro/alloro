import type { Dispatch, RefObject, SetStateAction } from "react";
import type { NavigateFunction } from "react-router-dom";
import type { Section } from "../../../api/templates";
import type { WebsitePage } from "../../../api/websites";
import { fetchPage } from "../../../api/websites";
import type { PublishLintWarning } from "../../../utils/publishLint";
import PublishConfirmModal from "../../../components/PageEditor/PublishConfirmModal";
import FindReplaceModal from "../../../components/Admin/find-replace/FindReplaceModal";
import { ConfirmModal } from "../../../components/settings/ConfirmModal";
import { AlertModal } from "../../../components/ui/AlertModal";
import RegenerateComponentModal from "../../../components/Admin/page-pipeline/RegenerateComponentModal";

export function PageEditorModals({
  projectId,
  draftPageId,
  navigate,
  sectionsRef,
  regenerateSnapshotsRef,
  sections,
  showLeaveModal,
  setShowLeaveModal,
  showPublishModal,
  setShowPublishModal,
  publishLintWarnings,
  isPublishing,
  handlePublishConfirmed,
  showConflictModal,
  setShowConflictModal,
  handleForceSave,
  recoveryPrompt,
  setRecoveryPrompt,
  pushUndoSnapshot,
  setSections,
  rebuildPreviewHtml,
  setIsDirty,
  showSuccessAlert,
  setShowSuccessAlert,
  successMessage,
  showFindReplace,
  setShowFindReplace,
  handleFindReplaceApplied,
  regenerateModalOpen,
  setRegenerateModalOpen,
  setRegeneratingSectionNames,
  setPage,
}: {
  projectId: string | undefined;
  draftPageId: string | null;
  navigate: NavigateFunction;
  sectionsRef: RefObject<Section[]>;
  regenerateSnapshotsRef: RefObject<Map<string, string>>;
  sections: Section[];
  showLeaveModal: boolean;
  setShowLeaveModal: Dispatch<SetStateAction<boolean>>;
  showPublishModal: boolean;
  setShowPublishModal: Dispatch<SetStateAction<boolean>>;
  publishLintWarnings: PublishLintWarning[];
  isPublishing: boolean;
  handlePublishConfirmed: () => void;
  showConflictModal: boolean;
  setShowConflictModal: Dispatch<SetStateAction<boolean>>;
  handleForceSave: () => void;
  recoveryPrompt: Section[] | null;
  setRecoveryPrompt: Dispatch<SetStateAction<Section[] | null>>;
  pushUndoSnapshot: (previousSections: Section[]) => void;
  setSections: Dispatch<SetStateAction<Section[]>>;
  rebuildPreviewHtml: (nextSections: Section[]) => void;
  setIsDirty: Dispatch<SetStateAction<boolean>>;
  showSuccessAlert: boolean;
  setShowSuccessAlert: Dispatch<SetStateAction<boolean>>;
  successMessage: string;
  showFindReplace: boolean;
  setShowFindReplace: Dispatch<SetStateAction<boolean>>;
  handleFindReplaceApplied: (summary: {
    pagesChanged: number;
    replacements: number;
    pageIds: string[];
  }) => void;
  regenerateModalOpen: boolean;
  setRegenerateModalOpen: Dispatch<SetStateAction<boolean>>;
  setRegeneratingSectionNames: Dispatch<SetStateAction<Set<string>>>;
  setPage: Dispatch<SetStateAction<WebsitePage | null>>;
}) {
  return (
    <>
      {/* Leave-without-saving Confirmation Modal */}
      <ConfirmModal
        isOpen={showLeaveModal}
        onClose={() => setShowLeaveModal(false)}
        onConfirm={() => {
          setShowLeaveModal(false);
          navigate(`/admin/websites/${projectId}`);
        }}
        title="Leave Editor?"
        message="You have unsaved changes. If you leave now they will be lost."
        confirmText="Leave"
        cancelText="Keep Editing"
        type="warning"
      />

      {/* Publish Confirmation Modal (with advisory lint chips) */}
      <PublishConfirmModal
        isOpen={showPublishModal}
        warnings={publishLintWarnings}
        isLoading={isPublishing}
        onClose={() => setShowPublishModal(false)}
        onConfirm={handlePublishConfirmed}
      />

      {/* Save Conflict Modal (409 STALE_WRITE) */}
      <ConfirmModal
        isOpen={showConflictModal}
        onClose={() => setShowConflictModal(false)}
        onConfirm={handleForceSave}
        title="Page Changed Elsewhere"
        message="This page was saved by someone else after you loaded it. Saving anyway overwrites their version (it stays in History). Keep editing to review first — your work is also backed up locally."
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
            pushUndoSnapshot(structuredClone(sectionsRef.current));
            setSections(recoveryPrompt);
            rebuildPreviewHtml(recoveryPrompt);
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

      {/* Success Alert Modal */}
      <AlertModal
        isOpen={showSuccessAlert}
        onClose={() => setShowSuccessAlert(false)}
        title="Published Successfully"
        message={successMessage}
        type="success"
        buttonText="Continue Editing"
        autoDismiss={true}
      />

      {/* Site-wide Find & Replace Modal */}
      {projectId && (
        <FindReplaceModal
          projectId={projectId}
          isOpen={showFindReplace}
          onClose={() => setShowFindReplace(false)}
          onApplied={handleFindReplaceApplied}
        />
      )}

      {/* Regenerate Component Modal */}
      {regenerateModalOpen && projectId && draftPageId && (
        <RegenerateComponentModal
          projectId={projectId}
          pageId={draftPageId}
          sectionNames={sections.map((s) => s.name)}
          onWillRegenerate={(sectionName) => {
            // Snapshot + flag BEFORE the API fires so the poll loop can't
            // observe gen=generating with an empty regeneratingSectionNames
            // set (which would briefly mount ProgressivePagePreview and
            // flash "Loading preview…").
            const target = sectionsRef.current.find((s) => s.name === sectionName);
            if (target) {
              regenerateSnapshotsRef.current.set(sectionName, target.content || "");
            }
            setRegeneratingSectionNames((prev) => {
              const next = new Set(prev);
              next.add(sectionName);
              return next;
            });
          }}
          onRegenerated={async (sectionName) => {
            setRegenerateModalOpen(false);
            // Re-fetch page to trigger the live-preview effect
            // (page.generation_status === "generating"). By now the "will"
            // hook above has already set the flags, so the render path
            // stays on the existing iframe + in-place pulse overlay.
            const freshPage = await fetchPage(projectId, draftPageId);
            setPage(freshPage.data);
            // Suppress the next unused-var warning; sectionName is handled
            // by onWillRegenerate but we keep the param for API stability.
            void sectionName;
          }}
          onClose={() => setRegenerateModalOpen(false)}
        />
      )}
    </>
  );
}
