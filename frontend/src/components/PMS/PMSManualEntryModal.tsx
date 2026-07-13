/**
 * PMSManualEntryModal Component
 *
 * Allows users to manually enter PMS referral data without uploading a CSV file.
 * Opens with the previous month selected and no sources by default.
 * On submit, data goes directly to monthly agents (skipping admin/client approval).
 */

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Loader2, Plus, Save, Upload, X } from "lucide-react";

import { PasteConfirmDialog } from "./PasteConfirmDialog";
import { ColumnMappingDrawer } from "./ColumnMappingDrawer";
import { ALORO_ORANGE, formatMonthLabel } from "./pmsManualEntryModal.utils";
import { usePmsManualEntry } from "./usePmsManualEntry";
import { MonthConflictDialog } from "./PMSManualEntryModal/MonthConflictDialog";
import { MonthYearPickerModal } from "./PMSManualEntryModal/MonthYearPickerModal";
import { MonthTabs } from "./PMSManualEntryModal/MonthTabs";
import { MonthMismatchBanner } from "./PMSManualEntryModal/MonthMismatchBanner";
import { SelectedFilePanel } from "./PMSManualEntryModal/SelectedFilePanel";
import { SummaryCards } from "./PMSManualEntryModal/SummaryCards";
import { SourceRowItem } from "./PMSManualEntryModal/SourceRowItem";
import { EmptyStateActions } from "./PMSManualEntryModal/EmptyStateActions";
import { usePmsCopy } from "./pmsCopy";

interface PMSManualEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string; // domain
  locationId?: number | null;
  locationName?: string | null;
  targetMonth?: string | null;
  onSuccess?: () => void;
}

export const PMSManualEntryModal: React.FC<PMSManualEntryModalProps> = ({
  isOpen,
  onClose,
  clientId,
  locationId,
  locationName,
  targetMonth,
  onSuccess,
}) => {
  const copy = usePmsCopy();
  const {
    months,
    activeMonthId,
    setActiveMonthId,
    isSubmitting,
    submitStatus,
    error,
    showMonthPicker,
    setShowMonthPicker,
    pickerStep,
    setPickerStep,
    tempMonth,
    setTempMonth,
    confirmDeleteRowId,
    setConfirmDeleteRowId,
    confirmDeleteMonthId,
    setConfirmDeleteMonthId,
    pendingMonths,
    monthConflicts,
    isDragging,
    fileInputRef,
    droppedFileName,
    selectedUploadFile,
    monthMismatch,
    uploadPreview,
    isPreviewingUpload,
    mappingHeaders,
    mappingSampleRows,
    mappingAllRows,
    currentMapping,
    setCurrentMapping,
    mappingSource,
    isResolvingMapping,
    isReprocessing,
    drawerOpen,
    setDrawerOpen,
    confirmMerge,
    cancelMerge,
    isPasting,
    pastePhase,
    showPasteConfirm,
    pasteInfo,
    pastedRowsParsed,
    requiresSanitization,
    confirmPaste,
    cancelPaste,
    handlePasteEvent,
    handlePasteFromClipboard,
    handleReprocess,
    clearAllData,
    discardMismatchedUpload,
    reuploadCorrectedFile,
    handleFileInputChange,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    downloadTemplate,
    sortedMonths,
    activeMonth,
    rows,
    totals,
    addMonthBucket,
    deleteMonth,
    requestDeleteMonth,
    openMonthPicker,
    commitMonthChange,
    addRow,
    updateRow,
    handleTypeToggle,
    deleteRow,
    requestDeleteRow,
    incrementField,
    handleSubmit,
  } = usePmsManualEntry({
    isOpen,
    onClose,
    clientId,
    locationId,
    targetMonth,
    onSuccess,
  });

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: "spring", damping: 20, stiffness: 200 }}
          className="relative flex max-h-[90vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl my-auto"
          onClick={(e) => e.stopPropagation()}
          onPaste={handlePasteEvent}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {/* Drag overlay */}
          <AnimatePresence>
            {isDragging && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl"
                style={{
                  backgroundColor: "rgba(201,118,94,0.08)",
                  border: `2px dashed ${ALORO_ORANGE}`,
                }}
              >
                <div className="flex flex-col items-center gap-2">
                  <Upload size={32} style={{ color: ALORO_ORANGE }} />
                  <span
                    className="text-sm font-medium"
                    style={{ color: ALORO_ORANGE }}
                  >
                    Drop your CSV, XLS, or XLSX file here
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 bg-white">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {targetMonth
                  ? `${locationName ? `${locationName} — ` : ""}${formatMonthLabel(targetMonth)}`
                  : `${copy.manualEntryTitle}${locationName ? ` for ${locationName}` : ""}`}
              </h2>
              {!targetMonth && (
                <p className="text-xs text-gray-500 mt-1">
                  {copy.manualEntrySubtitle} for {clientId}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Mapping settings link — visible whenever a mapping has been
	                  resolved, even silently from org-cache, so users can audit
	                  what was applied. */}
              {currentMapping && !drawerOpen && (
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 hover:border-gray-300"
                  title="Review or edit the column mapping"
                >
                  Mapping settings
                </button>
              )}
              {isResolvingMapping && (
                <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Resolving mapping…
                </span>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-gray-200 p-2 text-gray-500 transition hover:border-gray-300 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="relative flex-1 overflow-y-auto px-6 py-6 bg-gray-50">
            {/* Re-processing overlay — visible feedback so the user can see
                the new mapping being applied to their data, not just a
                fleeting toast. Blocks pointer events on the months display
                so the user can't edit during a re-process. */}
            <AnimatePresence>
              {isReprocessing && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-white/85 backdrop-blur-sm pointer-events-auto"
                >
                  <Loader2
                    className="h-8 w-8 animate-spin"
                    style={{ color: ALORO_ORANGE }}
                  />
                  <p className="text-sm font-semibold text-gray-900">
                    Re-processing your data…
                  </p>
                  <p className="text-xs text-gray-500">
                    Applying your mapping to {mappingAllRows.length}{" "}
                    {mappingAllRows.length === 1 ? "row" : "rows"}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {submitStatus === "success" ? (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center justify-center py-16"
              >
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                  <Save className="w-8 h-8 text-emerald-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  Data Submitted Successfully!
                </h3>
                <p className="text-gray-600 text-center max-w-md">
                  We're processing your data now. Your insights and action items
                  will be ready shortly.
                </p>
              </motion.div>
            ) : (
              <div className="space-y-6">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xls,.xlsx"
                  onChange={handleFileInputChange}
                  className="hidden"
                />

                <MonthMismatchBanner
                  targetMonth={targetMonth}
                  monthMismatch={monthMismatch}
                  droppedFileName={droppedFileName}
                  reuploadCorrectedFile={reuploadCorrectedFile}
                  discardMismatchedUpload={discardMismatchedUpload}
                />

                <SelectedFilePanel
                  selectedUploadFile={selectedUploadFile}
                  isPreviewingUpload={isPreviewingUpload}
                  uploadPreview={uploadPreview}
                />

                {/* Month Tabs — hidden in month-selected mode: the month is
                    fixed, so the pill row would be a dead control. */}
                {!targetMonth && (
                  <MonthTabs
                    sortedMonths={sortedMonths}
                    months={months}
                    activeMonthId={activeMonthId}
                    targetMonth={targetMonth}
                    confirmDeleteMonthId={confirmDeleteMonthId}
                    setActiveMonthId={setActiveMonthId}
                    requestDeleteMonth={requestDeleteMonth}
                    deleteMonth={deleteMonth}
                    setConfirmDeleteMonthId={setConfirmDeleteMonthId}
                    addMonthBucket={addMonthBucket}
                  />
                )}

                {/* Summary Cards */}
                <SummaryCards
                  activeMonth={activeMonth}
                  targetMonth={targetMonth}
                  openMonthPicker={openMonthPicker}
                  totals={totals}
                />

                {/* Table Header — only meaningful once rows exist */}
                {rows.length > 0 && (
                  <div className="grid grid-cols-13 gap-4 px-2 text-[11px] font-bold text-gray-400 uppercase">
                    <div className="col-span-3">{copy.sourceFieldLabel}</div>
                    <div className="col-span-2">{copy.sourceTypeLabel}</div>
                    <div className="col-span-3">{copy.sourceCountLabel}</div>
                    <div className="col-span-4">{copy.moneyLabel}</div>
                    <div className="col-span-1" />
                  </div>
                )}

                {/* Data Rows */}
                <AnimatePresence>
                  {rows.length === 0 ? (
                    <EmptyStateActions
                      fileInputRef={fileInputRef}
                      downloadTemplate={downloadTemplate}
                      handlePasteFromClipboard={handlePasteFromClipboard}
                      isPasting={isPasting}
                      addRow={addRow}
                    />
                  ) : (
                    rows.map((row) => (
                      <SourceRowItem
                        key={row.id}
                        row={row}
                        confirmDeleteRowId={confirmDeleteRowId}
                        updateRow={updateRow}
                        handleTypeToggle={handleTypeToggle}
                        incrementField={incrementField}
                        requestDeleteRow={requestDeleteRow}
                        deleteRow={deleteRow}
                        setConfirmDeleteRowId={setConfirmDeleteRowId}
                      />
                    ))
                  )}
                </AnimatePresence>

                {/* Compact action row — the empty state renders the full
                    action-card grid instead; once rows exist the only
                    remaining inline action is adding another row. */}
                {rows.length > 0 && (
                  <div className="flex justify-end gap-3 px-2">
                    <button
                      onClick={addRow}
                      className="flex items-center gap-2 border rounded-full px-5 py-2 text-xs font-semibold transition-colors hover:bg-gray-50"
                      style={{ color: ALORO_ORANGE, borderColor: ALORO_ORANGE }}
                    >
                      <Plus size={16} />
                      <span>Add Row</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Paste / file-drop Confirm Dialog */}
          {showPasteConfirm && (
            <PasteConfirmDialog
              pasteInfo={pasteInfo}
              isPasting={isPasting}
              phase={pastePhase}
              rowsParsed={pastedRowsParsed}
              requiresSanitization={requiresSanitization}
              onConfirm={confirmPaste}
              onCancel={cancelPaste}
              droppedFileName={droppedFileName}
            />
          )}

          {/* Month-conflict merge dialog */}
          <MonthConflictDialog
            monthConflicts={monthConflicts}
            pendingMonths={pendingMonths}
            cancelMerge={cancelMerge}
            confirmMerge={confirmMerge}
          />

          {/* Month Picker Modal */}
          <MonthYearPickerModal
            showMonthPicker={showMonthPicker}
            activeMonth={activeMonth}
            setShowMonthPicker={setShowMonthPicker}
            pickerStep={pickerStep}
            setPickerStep={setPickerStep}
            tempMonth={tempMonth}
            setTempMonth={setTempMonth}
            commitMonthChange={commitMonthChange}
          />

          {/* Column-mapping side drawer (T18). Slides over the right edge
              of the modal whenever a non-org-cache mapping needs review, or
              when the user clicks "Mapping settings" in the header. */}
          {currentMapping && mappingSource && (
            <ColumnMappingDrawer
              isOpen={drawerOpen}
              headers={mappingHeaders}
              sampleRows={mappingSampleRows}
              mapping={currentMapping}
              source={mappingSource}
              isReprocessing={isReprocessing}
              onChange={setCurrentMapping}
              onReprocess={handleReprocess}
              onClose={() => setDrawerOpen(false)}
            />
          )}

          {/* Footer */}
          {submitStatus !== "success" && (
            <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 bg-white">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={clearAllData}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-full border px-5 py-2 text-sm font-medium transition hover:bg-orange-50 disabled:opacity-50"
                  style={{ borderColor: ALORO_ORANGE, color: ALORO_ORANGE }}
                >
                  <X className="h-3.5 w-3.5" />
                  Clear
                </button>
                {error && (
                  <span className="inline-flex items-center gap-1 text-xs text-red-600">
                    <AlertCircle className="h-4 w-4" />
                    {error}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-gray-200 px-6 py-2 text-sm font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting || isPreviewingUpload}
                  className="inline-flex items-center gap-2 rounded-full px-6 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ backgroundColor: ALORO_ORANGE }}
                >
                  {isSubmitting || isPreviewingUpload ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {isPreviewingUpload
                    ? "Previewing..."
                    : isSubmitting
                      ? "Submitting..."
                      : selectedUploadFile
                        ? "Upload File & Get Insights"
                        : "Submit & Get Insights"}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
