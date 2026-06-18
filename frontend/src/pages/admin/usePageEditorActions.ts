import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  fetchPage,
  createDraftFromPage,
  updatePageSections,
  publishPage,
  editPageComponent,
  fetchPageVersions,
  fetchPageVersionContent,
  restorePageVersionIntoDraft,
} from "../../api/websites";
import type { PageVersion } from "../../components/PageEditor/VersionHistoryTab";
import {
  diffSections,
  injectDiffOutlines,
} from "../../utils/sectionDiff";
import { runPublishLint } from "../../utils/publishLint";
import type { MediaItem } from "../../api/websiteMedia";
import type {
  WebsitePage,
  ApiError,
} from "../../api/websites";
import type { Section } from "../../api/templates";
import { renderPage, normalizeSections } from "../../utils/templateRenderer";
import { replaceComponentInDom, validateHtml, extractSectionsFromDom } from "../../utils/htmlReplacer";
import type { DirectEditorOperation } from "../../utils/editorDirectOperations";
import { applyDirectEditorOperation } from "../../utils/editorDirectOperations";
import type { ChatMessage } from "../../components/PageEditor/ChatPanel";
import { showSuccessToast } from "../../lib/toast";
import { logger } from "../../lib/logger";
import {
  injectRegenerateOverlays,
  chatMapToObject,
  CODE_EDIT_UNDO_COALESCE_MS,
} from "./pageEditor.utils";
import type { QuickActionType } from "../../hooks/useIframeSelector";
import type { EditorView, usePageEditor } from "./usePageEditor";

export function usePageEditorActions(editor: ReturnType<typeof usePageEditor>) {
  const {
    projectId, draftPageId, navigate, iframeRef, page, setPage, project,
    setDraftPageId, setSections, setHtmlContent, undoStack, setUndoStack,
    redoStack, setRedoStack, isDirty, setIsDirty, previewVersionSections,
    setPreviewVersion, setPreviewVersionHtml, setPreviewVersionSections,
    setShowLeaveModal, setShowConflictModal, pendingSaveNoteRef,
    setPublishLintWarnings, setShowFindReplace, setIsEditing, isSaving,
    setIsSaving, isPublishing, setIsPublishing, setShowPublishModal,
    setShowSuccessAlert, setSuccessMessage, setEditError, setActiveView,
    setLastDebugInfo, chatMap, setChatMap, deferredEditRef, deferredTargetRef,
    pendingSidebarAction, setPendingSidebarAction, selectedInfo, setSelectedInfo,
    clearSelection, setupListeners, flushCanvasTextEdit, regeneratingSectionNames,
    htmlContent, chatMapRef, sectionsRef, liveTextRef, htmlStaleRef,
    textUndoCoalesceRef, clearBackup, pushUndoSnapshot, undoRef, redoRef,
    saveRef, sections,
  } = editor;

  // --- Handle edit send ---
  const handleSendEdit = useCallback(
    async (instruction: string, attachedMedia?: MediaItem[]) => {
      // Block editing header/footer elements (they live on the project, not the page).
      // Check structurally: if the element is inside a data-alloro-section marker, it's page content.
      if (selectedInfo) {
        const doc = iframeRef.current?.contentDocument;
        const el = doc?.querySelector(`.${CSS.escape(selectedInfo.alloroClass)}`);
        if (el && !el.closest("[data-alloro-section]")) {
          setEditError("Header/footer components can't be edited here. Use the Layout Editor from the project page.");
          return;
        }
      }

      if (!projectId || !draftPageId || !selectedInfo) return;

      setIsEditing(true);
      setEditError(null);

      const alloroClass = selectedInfo.alloroClass;

      // Build enriched instruction with attached media context
      let enrichedInstruction = instruction;
      if (attachedMedia && attachedMedia.length > 0) {
        enrichedInstruction += "\n\n## Use the images below:\n";
        attachedMedia.forEach((media, index) => {
          const altText = media.alt_text ? ` (${media.alt_text})` : "";
          enrichedInstruction += `Image ${index + 1}${altText}: ${media.s3_url}\n`;
        });
      }

      const userMessage: ChatMessage = {
        role: "user",
        content: instruction, // Show user's original text only
        timestamp: Date.now(),
      };

      setChatMap((prev) => {
        const next = new Map(prev);
        const messages = next.get(alloroClass) || [];
        next.set(alloroClass, [...messages, userMessage]);
        return next;
      });

      try {
        const existingMessages = chatMap.get(alloroClass) || [];
        const chatHistory = existingMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const result = await editPageComponent(projectId, draftPageId, {
          alloroClass,
          currentHtml: selectedInfo.outerHtml,
          instruction: enrichedInstruction, // Send enriched instruction to API
          chatHistory,
        });

        // Capture debug info from LLM response
        setLastDebugInfo(result.debug ?? null);

        // Handle rejection — LLM flagged the instruction as not allowed
        if (result.rejected) {
          const rejectionMessage: ChatMessage = {
            role: "assistant",
            content: result.message || "This edit is not allowed.",
            timestamp: Date.now(),
            isError: true,
          };

          setChatMap((prev) => {
            const next = new Map(prev);
            const messages = next.get(alloroClass) || [];
            next.set(alloroClass, [...messages, rejectionMessage]);
            return next;
          });
          return;
        }

        const validation = validateHtml(result.editedHtml!);
        if (!validation.valid) {
          throw new Error(
            `Invalid HTML from edit: ${validation.error}`
          );
        }

        pushUndoSnapshot(structuredClone(sectionsRef.current));

        const iframe = iframeRef.current;
        if (iframe?.contentDocument) {
          // Capture scroll position before mutation
          const scrollY = iframe.contentWindow?.scrollY || 0;
          const scrollX = iframe.contentWindow?.scrollX || 0;

          replaceComponentInDom(
            iframe.contentDocument,
            alloroClass,
            result.editedHtml!
          );
          // Don't setHtmlContent here - it causes iframe srcDoc to reload and flicker
          // The DOM is already mutated in place, which is what the user sees

          // Extract updated sections from the mutated DOM
          // Use sectionsRef.current (not closure `sections`) to avoid stale data
          const updatedSections = extractSectionsFromDom(iframe.contentDocument, sectionsRef.current);
          setSections(updatedSections);
          htmlStaleRef.current = true;

          setIsDirty(true);
          setupListeners();

          // Restore scroll position
          iframe.contentWindow?.scrollTo(scrollX, scrollY);

          // Refresh selectedInfo with the fresh outerHTML from the mutated DOM
          const freshEl = iframe.contentDocument.querySelector(`.${CSS.escape(alloroClass)}`);
          if (freshEl && selectedInfo) {
            setSelectedInfo({
              ...selectedInfo,
              outerHtml: freshEl.outerHTML,
              isHidden: freshEl.getAttribute("data-alloro-hidden") === "true",
            });
          }
        }

        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: result.message || "Edit applied.",
          timestamp: Date.now(),
        };

        setChatMap((prev) => {
          const next = new Map(prev);
          const messages = next.get(alloroClass) || [];
          next.set(alloroClass, [...messages, assistantMessage]);
          return next;
        });
      } catch (err) {
        logger.error("Edit failed:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Edit failed";
        setEditError(errorMessage);

        const errorChatMessage: ChatMessage = {
          role: "assistant",
          content: `Error: ${errorMessage}`,
          timestamp: Date.now(),
          isError: true,
        };

        setChatMap((prev) => {
          const next = new Map(prev);
          const messages = next.get(alloroClass) || [];
          next.set(alloroClass, [...messages, errorChatMessage]);
          return next;
        });
      } finally {
        setIsEditing(false);
      }
    },
    [
      projectId,
      draftPageId,
      selectedInfo,
      setSelectedInfo,
      chatMap,
      pushUndoSnapshot,
      setupListeners,
    ]
  );

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
        setEditError("Header/footer components can't be edited here. Use the Layout Editor from the project page.");
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
        const updatedSections = extractSectionsFromDom(doc, sectionsRef.current);

        // Consecutive text applies on the same element coalesce into one
        // undo entry (the debounced sidebar flushes mid-sentence); redo
        // still clears — the content changed either way.
        const now = Date.now();
        const coalesceText =
          operation.type === "replace-text" &&
          textUndoCoalesceRef.current?.cls === opInfo.alloroClass &&
          now - textUndoCoalesceRef.current.at < CODE_EDIT_UNDO_COALESCE_MS;
        textUndoCoalesceRef.current =
          operation.type === "replace-text"
            ? { cls: opInfo.alloroClass, at: now }
            : null;

        if (coalesceText) {
          setRedoStack([]);
        } else {
          pushUndoSnapshot(previousSections);
        }
        setSections(updatedSections);
        // Keep the ref in lockstep so a synchronous flush-then-save reads the
        // just-applied content (Save while an inline edit is mid-flight).
        sectionsRef.current = updatedSections;
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
    [selectedInfo, pushUndoSnapshot, setupListeners, setSelectedInfo, clearSelection],
  );

  // Process deferred quick-action edits from iframe input panel
  useEffect(() => {
    if (deferredEditRef.current && pendingSidebarAction === ("__deferred__" as QuickActionType)) {
      const operation = deferredEditRef.current;
      const targetCls = deferredTargetRef.current;
      deferredEditRef.current = null;
      deferredTargetRef.current = undefined;
      setPendingSidebarAction(null);
      handleApplyDirectEdit(operation, targetCls);
    }
  }, [pendingSidebarAction, handleApplyDirectEdit]);

  // --- Undo / Redo ---
  const rebuildPreviewHtml = useCallback(
    (nextSections: Section[]) => {
      const assembled = renderPage(
        project?.wrapper || "{{slot}}",
        project?.header || "",
        project?.footer || "",
        nextSections,
        undefined,
        undefined,
        undefined,
        projectId
      );
      htmlStaleRef.current = false;
      setHtmlContent(assembled);
    },
    [project, projectId]
  );

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;

    const previousSections = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, structuredClone(sectionsRef.current)]);
    setSections(previousSections);
    rebuildPreviewHtml(previousSections);
    setIsDirty(true);
    clearSelection();
  }, [undoStack, rebuildPreviewHtml, clearSelection]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;

    const nextSections = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, structuredClone(sectionsRef.current)]);
    setSections(nextSections);
    rebuildPreviewHtml(nextSections);
    setIsDirty(true);
    clearSelection();
  }, [redoStack, rebuildPreviewHtml, clearSelection]);

  undoRef.current = handleUndo;
  redoRef.current = handleRedo;

  // --- Toggle hidden ---
  const handleToggleHidden = useCallback(() => {
    handleApplyDirectEdit({ type: "toggle-hidden" });
  }, [handleApplyDirectEdit]);

  // --- Live text preview: mirror sidebar typing into the iframe element ---
  // Visual only — sections update on Apply; an abandoned preview reverts.
  const handleLiveTextRevert = useCallback(() => {
    const ref = liveTextRef.current;
    if (!ref) return;
    const doc = iframeRef.current?.contentDocument;
    const el = doc?.querySelector(
      `.${CSS.escape(ref.alloroClass)}`
    ) as HTMLElement | null;
    if (el) el.innerHTML = ref.html;
    liveTextRef.current = null;
  }, []);

  const handleLiveTextPreview = useCallback(
    (value: string) => {
      if (!selectedInfo) return;
      const doc = iframeRef.current?.contentDocument;
      const el = doc?.querySelector(
        `.${CSS.escape(selectedInfo.alloroClass)}`
      ) as HTMLElement | null;
      if (!el) return;
      // Holding a preview for a different element — revert it before starting.
      if (liveTextRef.current && liveTextRef.current.alloroClass !== selectedInfo.alloroClass) {
        handleLiveTextRevert();
      }
      if (!liveTextRef.current) {
        liveTextRef.current = { alloroClass: selectedInfo.alloroClass, html: el.innerHTML };
      }
      el.textContent = value;
    },
    [selectedInfo, handleLiveTextRevert]
  );

  // --- Manual save (explicit only — snapshots a restorable version) ---
  const performSave = useCallback(
    async (note?: string | null, force = false) => {
      if (!projectId || !draftPageId || isSaving) return;

      // Flush any in-progress inline edit into sections first, so a Save click
      // mid-typing persists the typed change instead of the pre-edit content.
      const flushed = flushCanvasTextEdit();
      if (flushed) handleApplyDirectEdit(flushed.operation, flushed.targetAlloroClass);

      try {
        setIsSaving(true);
        const res = await updatePageSections(
          projectId,
          draftPageId,
          sectionsRef.current,
          chatMapToObject(chatMapRef.current),
          {
            revisionNote: note ?? null,
            expectedUpdatedAt: page?.updated_at ?? null,
            force,
          }
        );
        setPage((prev) =>
          prev
            ? { ...prev, updated_at: res.data.updated_at, version: res.data.version }
            : prev
        );
        setIsDirty(false);
        clearBackup();
        setEditError(null);
        showSuccessToast("Changes saved", "A restorable version was recorded");
      } catch (err) {
        if ((err as ApiError).code === "STALE_WRITE") {
          pendingSaveNoteRef.current = note ?? null;
          setShowConflictModal(true);
          return;
        }
        logger.error("Save failed:", err);
        setEditError(err instanceof Error ? err.message : "Failed to save");
      } finally {
        setIsSaving(false);
      }
    },
    [projectId, draftPageId, isSaving, page?.updated_at, clearBackup, flushCanvasTextEdit, handleApplyDirectEdit]
  );

  const handleSave = useCallback(() => performSave(), [performSave]);
  const handleSaveWithNote = useCallback(
    (note: string) => performSave(note || null),
    [performSave]
  );
  const handleForceSave = useCallback(() => {
    setShowConflictModal(false);
    performSave(pendingSaveNoteRef.current, true);
  }, [performSave]);

  saveRef.current = handleSave;

  // --- Publish ---
  const handlePublish = useCallback(() => {
    if (!projectId || !draftPageId || isPublishing) return;
    // Advisory pre-publish lint — never blocks, chips render in the modal.
    const knownPaths = (project?.pages || []).map((p: WebsitePage) => p.path);
    setPublishLintWarnings([]);
    runPublishLint(htmlContent, knownPaths)
      .then(setPublishLintWarnings)
      .catch(() => setPublishLintWarnings([]));
    setShowPublishModal(true);
  }, [projectId, draftPageId, isPublishing, project, htmlContent]);

  const handlePublishConfirmed = useCallback(async () => {
    if (!projectId || !draftPageId) return;

    // Flush any in-progress inline edit so Publish ships the typed change even
    // if the user never clicked away from the canvas first.
    const flushed = flushCanvasTextEdit();
    if (flushed) handleApplyDirectEdit(flushed.operation, flushed.targetAlloroClass);

    try {
      setIsPublishing(true);

      // `flushed` forces the pre-publish save when an inline edit was just
      // captured (the closure `isDirty` predates it).
      if (isDirty || flushed) {
        // The pre-publish save must honor the same optimistic-concurrency
        // guard as a normal Save — without it, Publish silently overwrites
        // concurrent edits and ships them live.
        try {
          const saveRes = await updatePageSections(
            projectId,
            draftPageId,
            sectionsRef.current,
            chatMapToObject(chatMapRef.current),
            { expectedUpdatedAt: page?.updated_at ?? null }
          );
          setPage((prev) =>
            prev ? { ...prev, updated_at: saveRes.data.updated_at } : prev
          );
          setIsDirty(false);
          clearBackup();
        } catch (saveErr) {
          if ((saveErr as ApiError).code === "STALE_WRITE") {
            setShowPublishModal(false);
            setShowConflictModal(true);
            return;
          }
          throw saveErr;
        }
      }

      await publishPage(projectId, draftPageId);

      // Stay in editor by creating a new draft from the published page
      const publishedPage = await fetchPage(projectId, draftPageId);
      const newDraft = await createDraftFromPage(projectId, publishedPage.data.id);

      // Update state to work with new draft
      setDraftPageId(newDraft.data.id);
      setPage(newDraft.data);
      setIsDirty(false);

      // Update URL to reflect the new draft page ID so refresh loads the correct page
      window.history.replaceState(null, "", `/admin/websites/${projectId}/pages/${newDraft.data.id}/edit`);

      // Adopt the fresh draft's sections, but DON'T rebuild htmlContent — the
      // canvas already shows exactly this content (we just published it), so a
      // srcDoc swap here only flashes/reloads the preview for no visual change.
      // htmlContent's freshness is unchanged by publish (same content), so the
      // existing htmlStaleRef value still holds — leave it as-is.
      const draftSections: Section[] = normalizeSections(newDraft.data.sections);
      setSections(draftSections);

      // Clear chat history, edit history, and the local backup for the fresh draft
      setChatMap(new Map());
      setUndoStack([]);
      setRedoStack([]);
      clearBackup();

      // Close modal and show success alert
      setShowPublishModal(false);
      setEditError(null);

      // Show success alert with version info
      setSuccessMessage(`Page published successfully! You are now working on version ${newDraft.data.version}.`);
      setShowSuccessAlert(true);
    } catch (err) {
      logger.error("Publish failed:", err);
      setEditError(
        err instanceof Error ? err.message : "Failed to publish"
      );
      setShowPublishModal(false);
    } finally {
      setIsPublishing(false);
    }
  }, [projectId, draftPageId, isDirty, page?.updated_at, clearBackup, flushCanvasTextEdit, handleApplyDirectEdit]);

  // --- View switching ---
  const handleViewChange = useCallback(
    (view: EditorView) => {
      // Clear selection when entering code or seo view
      if (view === "code" || view === "seo") {
        clearSelection();
      }

      // Leaving the visual view unmounts the iframe; if in-place edits made
      // htmlContent stale, the remount would show (and later persist) the
      // pre-edit markup.
      if (htmlStaleRef.current) rebuildPreviewHtml(sectionsRef.current);

      setActiveView(view);
    },
    [clearSelection, rebuildPreviewHtml]
  );

  // --- Handle sections change from SectionsEditor (code view) ---
  const lastCodeEditPushRef = useRef(0);
  const handleCodeSectionsChange = useCallback(
    (updated: Section[]) => {
      // Code edits fire per keystroke — coalesce undo snapshots per burst so
      // a typing session undoes as one step instead of fifty.
      const now = Date.now();
      if (now - lastCodeEditPushRef.current > CODE_EDIT_UNDO_COALESCE_MS) {
        pushUndoSnapshot(structuredClone(sectionsRef.current));
      }
      lastCodeEditPushRef.current = now;

      setSections(updated);
      setIsDirty(true);
      rebuildPreviewHtml(updated);
    },
    [pushUndoSnapshot, rebuildPreviewHtml]
  );

  // --- Version history: preview / restore / exit ---
  const fetchAdminVersions = useCallback(
    async (pid: string) => {
      if (!projectId) return [];
      const res = await fetchPageVersions(projectId, pid);
      return res.data.versions;
    },
    [projectId]
  );

  const handlePreviewVersion = useCallback(
    async (version: PageVersion) => {
      if (!projectId || !draftPageId || !project) return;
      try {
        const res = await fetchPageVersionContent(
          projectId,
          draftPageId,
          version.id
        );
        const versionSections = normalizeSections(res.data.sections);
        const changedNames = diffSections(sectionsRef.current, versionSections)
          .filter((entry) => entry.status !== "removed")
          .map((entry) => entry.name);
        const assembled = renderPage(
          project.wrapper || "{{slot}}",
          project.header || "",
          project.footer || "",
          versionSections,
          undefined,
          undefined,
          undefined,
          projectId
        );
        setPreviewVersionHtml(injectDiffOutlines(assembled, changedNames));
        setPreviewVersionSections(versionSections);
        setPreviewVersion(version);
        clearSelection();
      } catch (err) {
        setEditError(
          err instanceof Error ? err.message : "Failed to load version preview"
        );
      }
    },
    [projectId, draftPageId, project, clearSelection]
  );

  const handleExitPreview = useCallback(() => {
    // The iframe srcDoc swaps back from the version preview — rebuild from
    // sections first when in-place edits made htmlContent stale, or the
    // editor visually reverts those edits (and the next extraction would
    // persist the reversion).
    if (htmlStaleRef.current) rebuildPreviewHtml(sectionsRef.current);
    setPreviewVersion(null);
    setPreviewVersionHtml("");
    setPreviewVersionSections(null);
  }, [rebuildPreviewHtml]);

  // Per-section diff between the previewed version and the current draft
  const previewDiff = useMemo(
    () =>
      previewVersionSections
        ? diffSections(sections, previewVersionSections)
        : null,
    [sections, previewVersionSections]
  );

  // Restore a single section from the previewed version into the draft
  const handleRestoreSection = useCallback(
    (name: string) => {
      if (!previewVersionSections) return;
      const versionSection = previewVersionSections.find(
        (s) => s.name === name
      );
      if (!versionSection) return;

      pushUndoSnapshot(structuredClone(sectionsRef.current));
      const current = sectionsRef.current;
      const exists = current.some((s) => s.name === name);
      const updated = exists
        ? current.map((s) =>
            s.name === name ? { ...s, content: versionSection.content } : s
          )
        : [...current, structuredClone(versionSection)];
      setSections(updated);
      rebuildPreviewHtml(updated);
      setIsDirty(true);
      showSuccessToast("Section restored", `"${name}" updated in the draft`);
    },
    [previewVersionSections, pushUndoSnapshot, rebuildPreviewHtml]
  );

  const handleRestoreVersion = useCallback(
    async (versionId: string) => {
      if (!projectId || !draftPageId) return;
      let restoredDraft;
      try {
        const res = await restorePageVersionIntoDraft(
          projectId,
          draftPageId,
          versionId
        );
        restoredDraft = res.data;
      } catch (err) {
        // ApiError is a type alias (Error & {code,status}), not a class, so it
        // can't be used with instanceof — an ApiError IS an Error instance.
        const message = err instanceof Error ? err.message : null;
        setEditError(
          message
            ? `Restore failed: ${message}`
            : "Restore failed — the draft was left unchanged."
        );
        return;
      }

      // The restore replaced the draft server-side (its prior state was
      // snapshotted there) — reset local editing state to the restored draft.
      setPage(restoredDraft);
      setDraftPageId(restoredDraft.id);
      const restoredSections = normalizeSections(restoredDraft.sections);
      setSections(restoredSections);
      rebuildPreviewHtml(restoredSections);
      setUndoStack([]);
      setRedoStack([]);
      setIsDirty(false);
      setPreviewVersion(null);
      setPreviewVersionHtml("");
      setPreviewVersionSections(null);
      clearBackup();
      clearSelection();
      showSuccessToast("Version restored", "Now editing the restored draft");
    },
    [projectId, draftPageId, rebuildPreviewHtml, clearBackup, clearSelection]
  );

  // --- Site-wide find & replace ---
  // It writes to drafts server-side, so unsaved local edits must land first.
  const handleOpenFindReplace = useCallback(() => {
    if (isDirty) {
      setEditError(
        "Save your changes before running Find & Replace — it updates drafts on the server."
      );
      return;
    }
    setShowFindReplace(true);
  }, [isDirty]);

  const handleFindReplaceApplied = useCallback(
    async (summary: { pagesChanged: number; replacements: number; pageIds: string[] }) => {
      // If the open draft was among the changed pages, reload it.
      if (!projectId || !draftPageId || !summary.pageIds.includes(draftPageId))
        return;
      try {
        const freshPage = await fetchPage(projectId, draftPageId);
        setPage(freshPage.data);
        const freshSections = normalizeSections(freshPage.data.sections);
        setSections(freshSections);
        rebuildPreviewHtml(freshSections);
        setUndoStack([]);
        setRedoStack([]);
        setIsDirty(false);
        clearSelection();
      } catch (err) {
        logger.error("Failed to reload page after find & replace:", err);
      }
    },
    [projectId, draftPageId, rebuildPreviewHtml, clearSelection]
  );

  // --- Back navigation with unsaved-changes guard ---
  const handleBackClick = useCallback(() => {
    if (isDirty) {
      setShowLeaveModal(true);
      return;
    }
    navigate(`/admin/websites/${projectId}`);
  }, [isDirty, navigate, projectId]);

  // --- Current chat messages for selected element ---
  const currentChatMessages = selectedInfo
    ? chatMap.get(selectedInfo.alloroClass) || []
    : [];

  // --- Preview HTML with per-section regenerate overlays applied ---
  // Derived so either a change to htmlContent (new generation arrived) or a
  // change to regeneratingSectionNames (user kicked off / we cleared a
  // rebuild) re-runs the overlay injection.
  const previewHtml = useMemo(
    () => injectRegenerateOverlays(htmlContent, regeneratingSectionNames),
    [htmlContent, regeneratingSectionNames],
  );

  return {
    handleSendEdit, handleApplyDirectEdit, rebuildPreviewHtml, handleUndo,
    handleRedo, handleToggleHidden, handleLiveTextRevert, handleLiveTextPreview,
    handleSave, handleSaveWithNote, handleForceSave, handlePublish,
    handlePublishConfirmed, handleViewChange, handleCodeSectionsChange,
    fetchAdminVersions, handlePreviewVersion, handleExitPreview, previewDiff,
    handleRestoreSection, handleRestoreVersion, handleOpenFindReplace,
    handleFindReplaceApplied, handleBackClick, currentChatMessages, previewHtml,
  };
}
