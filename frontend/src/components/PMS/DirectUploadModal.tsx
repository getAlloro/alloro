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
} from "lucide-react";
import { uploadPMSData } from "../../api/pms";
import { logger } from "../../lib/logger";
import { usePmsCopy } from "./pmsCopy";

interface DirectUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  locationId?: number | null;
  onSuccess?: () => void;
}

type UploadStatus = "idle" | "success" | "error";

const ALORO_ORANGE = "#C9765E";

export const DirectUploadModal: React.FC<DirectUploadModalProps> = ({
  isOpen,
  onClose,
  clientId,
  locationId,
  onSuccess,
}) => {
  const copy = usePmsCopy();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [message, setMessage] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState(false);
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
        pmsType: "auto-detect",
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
      logger.error("DirectUploadModal: Upload error:", error);
      setUploadStatus("error");
      setMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const resetModal = () => {
    setFile(null);
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
            className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {copy.directUploadTitle}
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {copy.directUploadSubtitle}
                </p>
              </div>
              <button
                onClick={handleClose}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors ml-4"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              {uploadStatus === "idle" && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
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
                      animate={
                        isDragOver ? { scale: 1.1, y: -5 } : { scale: 1, y: 0 }
                      }
                      transition={{
                        type: "spring",
                        damping: 15,
                        stiffness: 300,
                      }}
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
                          if (fileInputRef.current)
                            fileInputRef.current.value = "";
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
                </motion.div>
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
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
