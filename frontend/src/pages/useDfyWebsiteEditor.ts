import { useCallback, useEffect } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { toast } from "react-hot-toast";
import { apiGet, apiPost, apiPatch } from "../api";
import {
  renderPage as assemblePageHtml,
  normalizeSections,
} from "../utils/templateRenderer";
import {
  prepareHtmlForPreview,
  useIframeSelector,
} from "../hooks/useIframeSelector";
import type { QuickActionType } from "../hooks/useIframeSelector";
import { extractSectionsFromDom } from "../utils/htmlReplacer";
import {
  applyDirectEditorOperation,
  type DirectEditorOperation,
} from "../utils/editorDirectOperations";
import { useLocalDraftBackup } from "../hooks/useLocalDraftBackup";
import type { ChatMessage } from "../components/PageEditor/ChatPanel";
import type { PageVersion } from "../components/PageEditor/VersionHistoryTab";
import type { Section } from "../api/templates";
import { logger } from "../lib/logger";
import type { Page, Project, SectionHistoryEntry } from "./dfyWebsite.types";
import { TEXT_UNDO_COALESCE_MS } from "./dfyWebsite.utils";

type Selector = ReturnType<typeof useIframeSelector>;

export interface UseDfyWebsiteEditorParams {
  project: Project | null;
  selectedPage: Page | null;
  setSelectedPage: Dispatch<SetStateAction<Page | null>>;
  setPages: Dispatch<SetStateAction<Page[]>>;
  sections: Section[];
  setSections: Dispatch<SetStateAction<Section[]>>;
  sectionsRef: RefObject<Section[]>;
  undoStack: SectionHistoryEntry[];
  setUndoStack: Dispatch<SetStateAction<SectionHistoryEntry[]>>;
  redoStack: SectionHistoryEntry[];
  setRedoStack: Dispatch<SetStateAction<SectionHistoryEntry[]>>;
  isSaving: boolean;
  setIsSaving: Dispatch<SetStateAction<boolean>>;
  setIsDirty: Dispatch<SetStateAction<boolean>>;
  setHtmlContent: Dispatch<SetStateAction<string>>;
  setShowConflictModal: Dispatch<SetStateAction<boolean>>;
  chatMap: Map<string, ChatMessage[]>;
  setEditError: Dispatch<SetStateAction<string | null>>;
  setPreviewVersion: Dispatch<SetStateAction<PageVersion | null>>;
  setPreviewHtmlContent: Dispatch<SetStateAction<string>>;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  htmlStaleRef: RefObject<boolean>;
  liveTextRef: RefObject<{ alloroClass: string; html: string } | null>;
  textUndoCoalesceRef: RefObject<{ cls: string; at: number } | null>;
  deferredEditRef: RefObject<DirectEditorOperation | null>;
  deferredTargetRef: RefObject<string | undefined>;
  pendingSidebarAction: QuickActionType | null;
  setPendingSidebarAction: Dispatch<SetStateAction<QuickActionType | null>>;
  clearBackup: ReturnType<typeof useLocalDraftBackup>["clearBackup"];
  fetchWebsite: () => Promise<void>;
  selectedInfo: Selector["selectedInfo"];
  setSelectedInfo: Selector["setSelectedInfo"];
  clearSelection: Selector["clearSelection"];
  setupListeners: Selector["setupListeners"];
  flushCanvasTextEdit: Selector["flushCanvasTextEdit"];
}

export function useDfyWebsiteEditor({
  project,
  selectedPage,
  setSelectedPage,
  setPages,
  sections,
  setSections,
  sectionsRef,
  undoStack,
  setUndoStack,
  redoStack,
  setRedoStack,
  isSaving,
  setIsSaving,
  setIsDirty,
  setHtmlContent,
  setShowConflictModal,
  chatMap,
  setEditError,
  setPreviewVersion,
  setPreviewHtmlContent,
  iframeRef,
  htmlStaleRef,
  liveTextRef,
  textUndoCoalesceRef,
  deferredEditRef,
  deferredTargetRef,
  pendingSidebarAction,
  setPendingSidebarAction,
  clearBackup,
  fetchWebsite,
  selectedInfo,
  setSelectedInfo,
  clearSelection,
  setupListeners,
  flushCanvasTextEdit,
}: UseDfyWebsiteEditorParams) {
  const handleApplyDirectEdit = useCallback(
    (operation: DirectEditorOperation, overrideAlloroClass?: string) => {
      // When a commit is pinned to a specific element (committing element A
      // while B is now selected), operate on A and DON'T write the selection
      // back — otherwise we'd clobber B's caret/selection.
      const isOverride =
        !!overrideAlloroClass && overrideAlloroClass !== selectedInfo?.alloroClass;
      if (!selectedInfo) return;
      const opInfo = isOverride
        ? { ...selectedInfo, alloroClass: overrideAlloroClass! }
        : selectedInfo;

      const iframe = iframeRef.current;
      const doc = iframe?.contentDocument;
      if (!doc) return;

      const targetElement = doc.querySelector(
        `.${CSS.escape(opInfo.alloroClass)}`,
      );
      if (targetElement && !targetElement.closest("[data-alloro-section]")) {
        setEditError("Header/footer components can't be edited from the page editor.");
        return;
      }

      try {
        setEditError(null);
        const scrollY = iframe.contentWindow?.scrollY || 0;
        const scrollX = iframe.contentWindow?.scrollX || 0;
        const previousSections = structuredClone(sectionsRef.current);

        const result = applyDirectEditorOperation(doc, opInfo, operation);
        if (!result.changed) {
          if (!isOverride) setSelectedInfo(result.selectedInfo);
          return;
        }
        const updatedSections = extractSectionsFromDom(
          doc,
          sectionsRef.current,
        );

        const changedSectionName =
          targetElement
            ?.closest("[data-alloro-section]")
            ?.getAttribute("data-alloro-section") || undefined;
        const changedSectionNames = changedSectionName
          ? [changedSectionName]
          : undefined;

        // Consecutive text applies on the same element coalesce into one
        // undo entry (the debounced sidebar flushes mid-sentence); redo
        // still clears — the content changed either way.
        const now = Date.now();
        const coalesceText =
          operation.type === "replace-text" &&
          textUndoCoalesceRef.current?.cls === opInfo.alloroClass &&
          now - textUndoCoalesceRef.current.at < TEXT_UNDO_COALESCE_MS;
        textUndoCoalesceRef.current =
          operation.type === "replace-text"
            ? { cls: opInfo.alloroClass, at: now }
            : null;

        if (!coalesceText) {
          setUndoStack((prev) => [
            ...prev,
            {
              sections: previousSections,
              changedSectionNames,
            },
          ]);
        }
        setRedoStack([]);
        setSections(updatedSections);
        // Keep the ref in lockstep so a synchronous flush-then-save (Save while
        // an inline edit is mid-flight) reads the just-applied content rather
        // than the stale render-time value.
        sectionsRef.current = updatedSections;
        // No rebuildHtml here — the operation already mutated the iframe DOM
        // in place; re-setting srcDoc reloads the preview on every font-size
        // step / color change and jumps the scroll. Mark htmlContent stale so
        // remount boundaries rebuild from sections.
        htmlStaleRef.current = true;
        liveTextRef.current = null;
        setIsDirty(true);
        setupListeners();
        iframe.contentWindow?.scrollTo(scrollX, scrollY);
        if (operation.type === "delete-element") clearSelection();
        else if (!isOverride) setSelectedInfo(result.selectedInfo);
      } catch (err) {
        setEditError(err instanceof Error ? err.message : "Direct edit failed");
      }
    },
    [selectedInfo, setupListeners, setSelectedInfo, clearSelection],
  );

  // --- Live text preview: mirror sidebar typing into the iframe element ---
  // Visual only — sections update on Apply; an abandoned preview reverts.
  const handleLiveTextRevert = useCallback(() => {
    const ref = liveTextRef.current;
    if (!ref) return;
    const doc = iframeRef.current?.contentDocument;
    const el = doc?.querySelector(
      `.${CSS.escape(ref.alloroClass)}`,
    ) as HTMLElement | null;
    if (el) el.innerHTML = ref.html;
    liveTextRef.current = null;
  }, []);

  const handleLiveTextPreview = useCallback(
    (value: string) => {
      if (!selectedInfo) return;
      const doc = iframeRef.current?.contentDocument;
      const el = doc?.querySelector(
        `.${CSS.escape(selectedInfo.alloroClass)}`,
      ) as HTMLElement | null;
      if (!el) return;
      // Holding a preview for a different element — revert it before starting.
      if (
        liveTextRef.current &&
        liveTextRef.current.alloroClass !== selectedInfo.alloroClass
      ) {
        handleLiveTextRevert();
      }
      if (!liveTextRef.current) {
        liveTextRef.current = {
          alloroClass: selectedInfo.alloroClass,
          html: el.innerHTML,
        };
      }
      el.textContent = value;
    },
    [selectedInfo, handleLiveTextRevert],
  );

  // Process deferred quick-action edits from iframe input panel
  useEffect(() => {
    if (
      deferredEditRef.current &&
      pendingSidebarAction === ("__deferred__" as QuickActionType)
    ) {
      const operation = deferredEditRef.current;
      const targetCls = deferredTargetRef.current;
      deferredEditRef.current = null;
      deferredTargetRef.current = undefined;
      setPendingSidebarAction(null);
      handleApplyDirectEdit(operation, targetCls);
    }
  }, [pendingSidebarAction, handleApplyDirectEdit]);

  // --- Toggle hidden ---
  const handleToggleHidden = useCallback(() => {
    handleApplyDirectEdit({ type: "toggle-hidden" });
  }, [handleApplyDirectEdit]);

  const syncPreviewDomFromSections = useCallback(
    (nextSections: Section[], changedSectionNames?: string[]) => {
      if (!project) return;

      const buildFullHtml = () =>
        assemblePageHtml(
          project.wrapper || "{{slot}}",
          project.header || "",
          project.footer || "",
          nextSections,
          undefined,
          undefined,
          undefined,
          project.id,
        );

      const iframe = iframeRef.current;
      const doc = iframe?.contentDocument;
      if (!iframe?.contentWindow || !doc?.body || !changedSectionNames?.length) {
        setHtmlContent(buildFullHtml());
        return;
      }

      try {
        const scrollY = iframe.contentWindow.scrollY || 0;
        const scrollX = iframe.contentWindow.scrollX || 0;
        let patched = false;

        for (const sectionName of changedSectionNames) {
          const nextSection = nextSections.find(
            (section) => section.name === sectionName,
          );
          const liveSection = doc.querySelector(
            `[data-alloro-section="${CSS.escape(sectionName)}"]`,
          );
          if (!nextSection || !liveSection) continue;

          const sectionHtml = assemblePageHtml(
            "{{slot}}",
            "",
            "",
            [nextSection],
          );
          const nextDoc = new DOMParser().parseFromString(
            prepareHtmlForPreview(sectionHtml),
            "text/html",
          );
          const nextSectionEl = nextDoc.querySelector(
            `[data-alloro-section="${CSS.escape(sectionName)}"]`,
          );
          if (!nextSectionEl) continue;

          liveSection.replaceWith(doc.importNode(nextSectionEl, true));
          patched = true;
        }

        if (!patched) {
          htmlStaleRef.current = false;
          setHtmlContent(buildFullHtml());
          return;
        }

        // Patched the live DOM in place — htmlContent is now behind it.
        htmlStaleRef.current = true;
        setupListeners();
        iframe.contentWindow.scrollTo(scrollX, scrollY);
      } catch (err) {
        logger.error("Failed to sync preview DOM:", err);
        htmlStaleRef.current = false;
        setHtmlContent(buildFullHtml());
      }
    },
    [project, setupListeners],
  );

  // --- Undo ---
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0 || !project) return;

    const previousEntry = undoStack[undoStack.length - 1];
    const previousSections = previousEntry.sections;
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [
      ...prev,
      {
        sections: structuredClone(sections),
        changedSectionNames: previousEntry.changedSectionNames,
      },
    ]);
    setSections(previousSections);
    setIsDirty(true);
    clearSelection();
    syncPreviewDomFromSections(previousSections, previousEntry.changedSectionNames);
  }, [undoStack, sections, project, clearSelection, syncPreviewDomFromSections]);

  // --- Redo ---
  const handleRedo = useCallback(() => {
    if (redoStack.length === 0 || !project) return;

    const nextEntry = redoStack[redoStack.length - 1];
    const nextSections = nextEntry.sections;
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [
      ...prev,
      {
        sections: structuredClone(sections),
        changedSectionNames: nextEntry.changedSectionNames,
      },
    ]);
    setSections(nextSections);
    setIsDirty(true);
    clearSelection();
    syncPreviewDomFromSections(nextSections, nextEntry.changedSectionNames);
  }, [redoStack, sections, project, clearSelection, syncPreviewDomFromSections]);

  // --- Save & Publish ---
  // Note: apiPatch swallows HTTP errors and returns the error body, so the
  // 409 STALE_WRITE conflict is detected on the returned object, not in catch.
  const performSave = useCallback(
    async (force = false) => {
      if (!selectedPage || !project || isSaving) return;
      // Flush any in-progress inline edit into sections FIRST, so a Save click
      // mid-typing persists the typed change instead of the pre-edit content
      // (the commit-on-blur is deferred and would otherwise lose the race).
      const flushed = flushCanvasTextEdit();
      if (flushed) handleApplyDirectEdit(flushed.operation, flushed.targetAlloroClass);
      const sectionsToSave = sectionsRef.current;
      setIsSaving(true);
      try {
        const res = await apiPatch({
          path: `/user/website/pages/${selectedPage.id}/save`,
          passedData: {
            sections: sectionsToSave,
            expected_updated_at: selectedPage.updated_at,
            force,
          },
        });
        if (res?.error === "STALE_WRITE") {
          setShowConflictModal(true);
          return;
        }
        if (!res?.success) {
          toast.error(res?.message || "Failed to save changes");
          return;
        }
        if (res?.data?.updated_at) {
          const savedAt = res.data.updated_at;
          setSelectedPage((prev) =>
            prev ? { ...prev, updated_at: savedAt, sections: sectionsToSave } : prev,
          );
          // Keep the pages list fresh too — reopening this page from the
          // Pages tab would otherwise regress expected_updated_at (spurious
          // 409 that trains "Save Anyway") and reload pre-save content.
          setPages((prev) =>
            prev.map((p) =>
              p.id === selectedPage.id
                ? { ...p, updated_at: savedAt, sections: sectionsToSave }
                : p,
            ),
          );
        }
        setIsDirty(false);
        clearBackup();
        toast.success("Changes saved & published");
      } catch {
        toast.error("Failed to save changes");
      } finally {
        setIsSaving(false);
      }
    },
    [selectedPage, project, isSaving, clearBackup, flushCanvasTextEdit, handleApplyDirectEdit],
  );

  const handleSave = useCallback(() => performSave(), [performSave]);
  const handleForceSave = useCallback(() => {
    setShowConflictModal(false);
    performSave(true);
  }, [performSave]);

  // --- Version preview ---
  const handlePreviewVersion = useCallback(
    async (version: PageVersion) => {
      if (!project || !selectedPage) return;
      try {
        const res = await apiGet({
          path: `/user/website/pages/${selectedPage.id}/versions/${version.id}`,
        });
        const versionData = res.data;
        const versionSections = normalizeSections(versionData.sections);
        const html = assemblePageHtml(
          project.wrapper || "{{slot}}",
          project.header || "",
          project.footer || "",
          versionSections,
          undefined,
          undefined,
          undefined,
          project.id,
        );
        setPreviewHtmlContent(html);
        setPreviewVersion(version);
        clearSelection();
      } catch {
        toast.error("Failed to load version preview");
      }
    },
    [project, selectedPage, clearSelection],
  );

  const handleExitPreview = useCallback(() => {
    setPreviewVersion(null);
    setPreviewHtmlContent("");
  }, []);

  const handleRestoreVersion = useCallback(
    async (versionId: string) => {
      if (!selectedPage) return;
      const res = await apiPost({
        path: `/user/website/pages/${selectedPage.id}/versions/${versionId}/restore`,
      });
      // apiPost swallows HTTP errors — a 403 READ_ONLY / 404 / 500 must not
      // toast "restored" and exit preview while the live site is unchanged.
      if (!res?.success) {
        toast.error(res?.message || "Failed to restore version");
        return;
      }
      setPreviewVersion(null);
      setPreviewHtmlContent("");
      toast.success("Version restored");
      await fetchWebsite();
    },
    [selectedPage],
  );

  // Current chat messages for selected element
  const currentChatMessages = selectedInfo
    ? chatMap.get(selectedInfo.alloroClass) || []
    : [];

  return {
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
    currentChatMessages,
  };
}
