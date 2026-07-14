import React, { useState, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { showUploadToast } from "../../lib/toast";
import {
  X,
  Upload,
  FileText,
  CheckCircle,
  AlertCircle,
  Loader2,
  PenLine,
  ArrowLeft,
} from "lucide-react";
import { uploadPMSData } from "../../api/pms";
import { PMSManualEntryModal } from "./PMSManualEntryModal";
import { logger } from "../../lib/logger";
import { usePmsCopy } from "./pmsCopy";

interface PMSUploadWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  locationId?: number | null;
  onSuccess?: () => void;
}

type WizardStep = "gate" | "direct-upload" | "alternatives" | "template-upload";
type UploadStatus = "idle" | "success" | "error";

const ALORO_ORANGE = "#C9765E";

export const PMSUploadWizardModal: React.FC<PMSUploadWizardModalProps> = ({
  isOpen,
  onClose,
  clientId,
  locationId,
  onSuccess,
}) => {
  const copy = usePmsCopy();
  const [step, setStep] = useState<WizardStep>("gate");
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [message, setMessage] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processingStorageKey = useMemo(
    () => `pmsProcessing:${clientId || "artfulorthodontics.com"}`,
    [clientId],
  );

  const handleFileSelect = useCallback((selectedFile: File) => {
    setFile(selectedFile);
    setUploadStatus("idle");
    setMessage("");
  }, []);

  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = event.target.files?.[0];
      if (selectedFile) {
        handleFileSelect(selectedFile);
      }
    },
    [handleFileSelect],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragOver(false);
      const droppedFile = event.dataTransfer.files?.[0];
      if (droppedFile) {
        handleFileSelect(droppedFile);
      }
    },
    [handleFileSelect],
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragOver(true);
    },
    [],
  );

  const handleDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragOver(false);
    },
    [],
  );

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setUploadStatus("idle");

    try {
      const result = await uploadPMSData({
        domain: clientId,
        file,
        locationId,
      });

      if (result.success) {
        setUploadStatus("success");
        setMessage(copy.processingMessage);

        showUploadToast(
          copy.toastReceivedTitle,
          copy.processingInsightsMessage,
        );

        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(
              processingStorageKey,
              String(Date.now()),
            );
            const event = new CustomEvent("pms:job-uploaded", {
              detail: { clientId },
            });
            window.dispatchEvent(event);
          } catch (storageError) {
            logger.warn(
              "Unable to persist data processing flag:",
              storageError,
            );
          }
        }

        setTimeout(() => {
          onSuccess?.();
        }, 2000);
      } else {
        throw new Error(result.error || "Upload failed");
      }
    } catch (error) {
      logger.error("PMSUploadWizard: Upload error:", error);
      setUploadStatus("error");
      setMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const resetModal = () => {
    setStep("gate");
    setFile(null);
    setUploadStatus("idle");
    setMessage("");
    setIsDragOver(false);
    setShowManualEntry(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  const handleManualEntrySuccess = () => {
    onSuccess?.();
    handleClose();
  };

  // Show manual entry modal when selected
  if (showManualEntry) {
    return (
      <PMSManualEntryModal
        isOpen={isOpen}
        onClose={handleClose}
        clientId={clientId}
        locationId={locationId}
        onSuccess={handleManualEntrySuccess}
      />
    );
  }

  // Shared upload zone component
  const UploadZone = ({
    showBack = false,
    onBack,
  }: {
    showBack?: boolean;
    onBack?: () => void;
  }) => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      {showBack && (
        <motion.button
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={onBack}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </motion.button>
      )}

      {uploadStatus === "idle" && (
        <>
          <motion.div
            whileHover={{ scale: 1.01 }}
            className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all duration-300 cursor-pointer ${
              isDragOver
                ? "border-emerald-400 bg-emerald-50/50"
                : file
                  ? "border-emerald-300 bg-emerald-50/30"
                  : "border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-white"
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => !file && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileInputChange}
              className="hidden"
            />

            <motion.div
              animate={isDragOver ? { scale: 1.1, y: -5 } : { scale: 1, y: 0 }}
              transition={{ type: "spring", damping: 15, stiffness: 300 }}
              className={`w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center ${
                file
                  ? "bg-emerald-100"
                  : "bg-white shadow-sm border border-slate-100"
              }`}
            >
              <FileText
                className={`w-8 h-8 ${file ? "text-emerald-600" : "text-slate-400"}`}
              />
            </motion.div>

            <h4 className="font-semibold text-slate-900 mb-1">
              {file ? file.name : "Drop your file here"}
            </h4>
            <p className="text-slate-500 text-sm mb-4">
              {file ? "File ready to upload" : "or click to browse"}
            </p>

            {!file && (
              <p className="text-xs text-slate-400">
                Accepts .csv, .xls, and .xlsx files
              </p>
            )}
          </motion.div>

          {file && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3"
            >
              <button
                onClick={() => {
                  setFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="flex-1 px-4 py-3 text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={isUploading}
                className="flex-1 text-white px-4 py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all font-medium hover:brightness-110"
                style={{ backgroundColor: ALORO_ORANGE }}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Upload file
                  </>
                )}
              </button>
            </motion.div>
          )}
        </>
      )}

      {uploadStatus === "success" && (
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", damping: 15, stiffness: 300 }}
          className="text-center py-10"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: "spring", damping: 10 }}
            className="w-20 h-20 mx-auto mb-4 rounded-full bg-emerald-100 flex items-center justify-center"
          >
            <CheckCircle className="w-10 h-10 text-emerald-600" />
          </motion.div>
          <h4 className="text-xl font-bold text-slate-900 mb-2">
            Upload Successful!
          </h4>
          <p className="text-slate-600">{message}</p>
        </motion.div>
      )}

      {uploadStatus === "error" && (
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center py-10"
        >
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
            <AlertCircle className="w-10 h-10 text-red-600" />
          </div>
          <h4 className="text-xl font-bold text-slate-900 mb-2">
            Upload Failed
          </h4>
          <p className="text-red-600 mb-4">{message}</p>
          <button
            onClick={() => setUploadStatus("idle")}
            className="px-6 py-2 bg-slate-600 text-white rounded-xl hover:bg-slate-700 transition-colors font-medium"
          >
            Try Again
          </button>
        </motion.div>
      )}
    </motion.div>
  );

  // Example table component
  const ExampleTable = () => (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200">
        <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">
          {copy.sampleReportLabel}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50/50">
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-slate-600 uppercase tracking-wide">
                {copy.sampleHeaders.date}
              </th>
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-slate-600 uppercase tracking-wide">
                {copy.sampleHeaders.group}
              </th>
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-slate-600 uppercase tracking-wide">
                {copy.sampleHeaders.source}
              </th>
              <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-slate-600 uppercase tracking-wide">
                {copy.sampleHeaders.amount}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {copy.sampleRows.map((row, i) => (
              <tr key={i} className="hover:bg-slate-50/50">
                <td className="px-2 py-1.5 text-slate-600">{row.date}</td>
                <td className="px-2 py-1.5 text-slate-600">{row.group}</td>
                <td className="px-2 py-1.5 text-slate-900 font-medium">
                  {row.source}
                </td>
                <td className="px-2 py-1.5 text-right text-emerald-600 font-medium">
                  {row.amount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[90vh] overflow-hidden my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex-1"
              >
                <h2 className="text-xl font-bold text-slate-900">
                  {step === "gate" && `Upload ${copy.reportName}`}
                  {step === "direct-upload" && "Upload Your Report"}
                  {step === "alternatives" && "Alternative Options"}
                  {step === "template-upload" &&
                    copy.uploadCompletedTemplateTitle}
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {step === "gate" &&
                    `Check if your ${copy.systemName} can export the required data`}
                  {step === "direct-upload" &&
                    `Download the report from your ${copy.systemName} and upload it`}
                  {step === "alternatives" &&
                    "Choose how you'd like to provide your data"}
                  {step === "template-upload" &&
                    "Upload the filled-in template"}
                </p>
              </motion.div>
              <button
                onClick={handleClose}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors ml-4"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-100px)]">
              <AnimatePresence mode="wait">
                {/* Step 1: Gate Question */}
                {step === "gate" && (
                  <motion.div
                    key="gate"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-5"
                  >
                    <p className="text-slate-600">
                      Does your {copy.systemName} allow you to export a report
                      with these fields?
                    </p>

                    {/* Example Table */}
                    <ExampleTable />

                    {/* YES / NO Buttons - NO on left, YES on right */}
                    <div className="flex gap-3 pt-2">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setStep("alternatives")}
                        className="flex-1 py-4 px-6 rounded-xl font-semibold border-2 border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all"
                      >
                        No, I can't export this
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setStep("direct-upload")}
                        className="flex-1 py-4 px-6 rounded-xl font-semibold text-white transition-all hover:brightness-110 shadow-lg"
                        style={{
                          backgroundColor: ALORO_ORANGE,
                          boxShadow: `0 4px 14px ${ALORO_ORANGE}40`,
                        }}
                      >
                        Yes, I can export this
                      </motion.button>
                    </div>
                  </motion.div>
                )}

                {/* Step 2A: Direct Upload */}
                {step === "direct-upload" && (
                  <motion.div
                    key="direct-upload"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                  >
                    <UploadZone
                      showBack
                      onBack={() => {
                        setStep("gate");
                        setFile(null);
                        setUploadStatus("idle");
                      }}
                    />
                  </motion.div>
                )}

                {/* Step 2B: Alternative Options */}
                {step === "alternatives" && (
                  <motion.div
                    key="alternatives"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-4"
                  >
                    <motion.button
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      onClick={() => setStep("gate")}
                      className="flex items-center gap-2 text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Back
                    </motion.button>

                    {/* Option 1: CSV Template — hidden for now
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="bg-slate-50 rounded-2xl p-5 hover:bg-slate-100/80 transition-colors"
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-11 h-11 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                          <Download className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-slate-900 mb-1">
                            Use our template
                          </h3>
                          <p className="text-sm text-slate-500 mb-4">
                            Download our CSV template, fill it in with your data, then upload.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <a
                              href="/report_template.csv"
                              download="referral_report_template.csv"
                              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors text-sm font-medium"
                            >
                              <Download className="w-4 h-4" />
                              Download template
                            </a>
                            <button
                              onClick={() => setStep("template-upload")}
                              className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-200 bg-white text-slate-700 rounded-xl hover:bg-slate-50 transition-colors text-sm font-medium"
                            >
                              <Upload className="w-4 h-4" />
                              Upload filled template
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                    */}

                    {/* Option 2: Manual Entry */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="bg-slate-50 rounded-2xl p-5 hover:bg-slate-100/80 transition-colors"
                    >
                      <div className="flex items-start gap-4">
                        <div
                          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${ALORO_ORANGE}15` }}
                        >
                          <PenLine
                            className="w-5 h-5"
                            style={{ color: ALORO_ORANGE }}
                          />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-slate-900 mb-1">
                            Enter data manually
                          </h3>
                          <p className="text-sm text-slate-500 mb-4">
                            Type in your {copy.dataNameLower} directly in
                            Alloro.
                          </p>
                          <button
                            onClick={() => setShowManualEntry(true)}
                            className="inline-flex items-center gap-2 px-4 py-2.5 text-white rounded-xl transition-all text-sm font-medium hover:brightness-110"
                            style={{ backgroundColor: ALORO_ORANGE }}
                          >
                            <PenLine className="w-4 h-4" />
                            Enter manually
                          </button>
                        </div>
                      </div>
                    </motion.div>

                    {/* Option 3: Support — hidden for now
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="bg-slate-50 rounded-2xl p-5 hover:bg-slate-100/80 transition-colors"
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-11 h-11 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <HelpCircle className="w-5 h-5 text-blue-600" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-slate-900 mb-1">
                            Need help?
                          </h3>
                          <p className="text-sm text-slate-500 mb-4">
                            We can help you get the right report from your data source.
                          </p>
                          <a
                            href="mailto:support@getalloro.com"
                            className="inline-flex items-center gap-2 px-4 py-2.5 border border-blue-200 bg-white text-blue-700 rounded-xl hover:bg-blue-50 transition-colors text-sm font-medium"
                          >
                            <HelpCircle className="w-4 h-4" />
                            Contact support
                          </a>
                        </div>
                      </div>
                    </motion.div>
                    */}
                  </motion.div>
                )}

                {/* Template Upload Step */}
                {step === "template-upload" && (
                  <motion.div
                    key="template-upload"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                  >
                    <UploadZone
                      showBack
                      onBack={() => {
                        setStep("alternatives");
                        setFile(null);
                        setUploadStatus("idle");
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
