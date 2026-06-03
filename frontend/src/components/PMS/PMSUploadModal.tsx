/**
 * @deprecated — Retired 2026-04-30. File upload functionality moved to
 * PMSManualEntryModal which supports multi-file drag-and-drop with column
 * mapping. This file is preserved for git history only.
 */
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
} from "lucide-react";
import { uploadPMSData } from "../../api/pms";
import { PMSManualEntryModal } from "./PMSManualEntryModal";

interface PMSUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  locationId?: number | null;
  onSuccess?: () => void;
}

type EntryMode = "upload" | "manual";

export const PMSUploadModal: React.FC<PMSUploadModalProps> = ({
  isOpen,
  onClose,
  clientId,
  locationId,
  onSuccess,
}) => {
  const [entryMode, setEntryMode] = useState<EntryMode>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [pmsType, setPmsType] = useState<string>("auto-detect");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingStorageKey = useMemo(
    () => `pmsProcessing:${clientId || "artfulorthodontics.com"}`,
    [clientId]
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
    [handleFileSelect]
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
    [handleFileSelect]
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragOver(true);
    },
    []
  );

  const handleDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragOver(false);
    },
    []
  );

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setUploadStatus("idle");

    try {
      console.log("PMSUploadModal: Uploading file:", file.name);

      const result = await uploadPMSData({
        domain: clientId,
        file,
        pmsType,
        locationId,
      });

      console.log("PMSUploadModal: Upload response:", result);

      if (result.success) {
        setUploadStatus("success");
        setMessage(
          "We're processing your PMS data now. We'll notify you once it's ready."
        );

        // Show glassmorphism toast notification
        showUploadToast(
          "PMS export received!",
          "We'll notify when ready for checking"
        );
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(
              processingStorageKey,
              String(Date.now())
            );
            const event = new CustomEvent("pms:job-uploaded", {
              detail: { clientId },
            });
            window.dispatchEvent(event);
          } catch (storageError) {
            console.warn(
              "Unable to persist PMS processing flag:",
              storageError
            );
          }
        }
        setTimeout(() => {
          onSuccess?.();
          // Don't auto-close, let user see the charts
        }, 2000);
      } else {
        throw new Error(result.error || "Upload failed");
      }
    } catch (error) {
      console.error("PMSUploadModal: Upload error:", error);
      setUploadStatus("error");
      setMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const resetModal = () => {
    setEntryMode("upload");
    setFile(null);
    setPmsType("auto-detect");
    setUploadStatus("idle");
    setMessage("");
    setIsDragOver(false);
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

  // If manual entry mode is selected, render the PMSManualEntryModal
  if (entryMode === "manual") {
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

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="bg-gray-50 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-white rounded-t-2xl">
              <motion.h2
                initial={{ y: -10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="text-2xl font-bold text-gray-900"
              >
                PMS Data Management
              </motion.h2>
              <motion.button
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                onClick={handleClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </motion.button>
            </div>

            <div className="p-6">
              {/* Upload Section */}
              {entryMode === "upload" && (
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="space-y-6"
                >
                  {/* File Upload Container */}
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      Upload PMS Export
                    </h3>

                    {uploadStatus === "idle" && (
                      <div className="space-y-4">
                        <motion.div
                          className={`border-2 border-dashed rounded-xl p-6 text-center transition-all duration-300 ${
                            isDragOver
                              ? "border-emerald-400 bg-emerald-50"
                              : file
                              ? "border-emerald-300 bg-emerald-50"
                              : "border-gray-300 hover:border-emerald-400 hover:bg-emerald-50"
                          }`}
                          onDrop={handleDrop}
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                        >
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv,.xlsx,.xls"
                            onChange={handleFileInputChange}
                            className="hidden"
                          />

                          <motion.div
                            animate={
                              isDragOver ? { scale: 1.05 } : { scale: 1 }
                            }
                            transition={{
                              type: "spring",
                              damping: 20,
                              stiffness: 400,
                            }}
                          >
                            <FileText
                              className={`w-12 h-12 mx-auto mb-3 ${
                                file ? "text-emerald-600" : "text-gray-400"
                              }`}
                            />
                          </motion.div>

                          <h4 className="font-semibold text-gray-900 mb-2">
                            {file ? file.name : "Drop your file here"}
                          </h4>
                          <p className="text-gray-600 mb-3 text-sm">
                            {file
                              ? "File ready to upload"
                              : "Drag and drop any CSV, Excel, or text file"}
                          </p>
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors text-sm"
                          >
                            {file ? "Choose Different File" : "Browse Files"}
                          </button>
                        </motion.div>

                        {/* PMS Type Dropdown */}
                        <motion.div
                          initial={{ y: 10, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          className="mt-4"
                        >
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            PMS Type
                          </label>
                          <select
                            value={pmsType}
                            onChange={(e) => setPmsType(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors bg-white text-gray-900"
                          >
                            <option value="auto-detect">Auto-detect</option>
                            <option value="gaidge">Gaidge</option>
                            <option value="tdo">TDO</option>
                            <option value="ortho2">Ortho2</option>
                            <option value="dentrix">Dentrix</option>
                          </select>
                          <p className="text-xs text-gray-500 mt-1">
                            Select the PMS system type or use auto-detect to let
                            the system determine it automatically.
                          </p>
                        </motion.div>

                        {file && (
                          <motion.div
                            initial={{ y: 10, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            className="flex gap-3"
                          >
                            <button
                              onClick={() => {
                                setFile(null);
                                if (fileInputRef.current)
                                  fileInputRef.current.value = "";
                              }}
                              className="flex-1 px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleUpload}
                              disabled={isUploading}
                              className="flex-1 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                            >
                              {isUploading ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Uploading...
                                </>
                              ) : (
                                <>
                                  <Upload className="w-4 h-4" />
                                  Upload Data
                                </>
                              )}
                            </button>
                          </motion.div>
                        )}
                      </div>
                    )}

                    {uploadStatus === "success" && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{
                          type: "spring",
                          damping: 15,
                          stiffness: 400,
                        }}
                        className="text-center py-6"
                      >
                        <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-3" />
                        <h4 className="text-xl font-bold text-gray-900 mb-2">
                          Upload Successful!
                        </h4>
                        <p className="text-gray-600">{message}</p>
                      </motion.div>
                    )}

                    {uploadStatus === "error" && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{
                          type: "spring",
                          damping: 15,
                          stiffness: 400,
                        }}
                        className="text-center py-6"
                      >
                        <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-3" />
                        <h4 className="text-xl font-bold text-gray-900 mb-2">
                          Upload Failed
                        </h4>
                        <p className="text-red-600 mb-4">{message}</p>
                        <button
                          onClick={() => setUploadStatus("idle")}
                          className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
                        >
                          Try Again
                        </button>
                      </motion.div>
                    )}
                  </div>

                  {/* OR Separator and Manual Entry Button */}
                  {uploadStatus === "idle" && (
                    <>
                      <div className="flex items-center gap-4">
                        <div className="flex-1 h-px bg-gray-300"></div>
                        <span className="text-gray-500 font-medium text-sm">
                          OR
                        </span>
                        <div className="flex-1 h-px bg-gray-300"></div>
                      </div>

                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setEntryMode("manual")}
                        className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold transition-colors shadow-lg shadow-orange-500/20"
                      >
                        <PenLine className="w-5 h-5" />
                        Manually Enter Referral Data
                      </motion.button>
                    </>
                  )}
                </motion.div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
