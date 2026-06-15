import React, { useState, useEffect } from "react";
import {
  X,
  Database,
  MousePointer,
  Eye,
  BarChart3,
  CheckCircle,
} from "lucide-react";
import { logger } from "../lib/logger";

interface BaseIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  onSuccess?: () => void;
  ready?: boolean;
  session?: any;
}

// Microsoft Clarity Integration Modal
export const ClarityIntegrationModal: React.FC<BaseIntegrationModalProps> = ({
  isOpen,
  onClose,
  clientId,
  onSuccess,
}) => {
  // Mock state for demo purposes
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiToken, setApiToken] = useState("");
  const [projectId, setProjectId] = useState("");
  const [step, setStep] = useState<"connect" | "success">("connect");

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setStep("connect");
      setApiToken("");
      setProjectId("");
      setError(null);
    }
  }, [isOpen]);

  const handleConnect = async () => {
    logger.log(
      "Clarity Modal: Starting demo connection with clientId:",
      clientId
    );
    setIsLoading(true);
    setError(null);

    try {
      if (!apiToken.trim()) {
        throw new Error("API token is required");
      }

      // Simulate API call delay
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Demo: randomly succeed or fail
      if (Math.random() > 0.2) {
        logger.log("🔍 Clarity Modal: Demo connection successful");
        setStep("success");
        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 2000);
      } else {
        throw new Error("Demo connection failed. Please try again.");
      }
    } catch (err) {
      logger.error("Clarity connection failed:", err);
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            Connect Microsoft Clarity
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {step === "connect" && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <MousePointer className="w-8 h-8 text-purple-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Connect Microsoft Clarity
                </h3>
                <p className="text-gray-600 mb-6">
                  Analyze user behavior with heatmaps and session recordings.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <MousePointer className="w-5 h-5 text-purple-600" />
                  <span className="text-sm text-gray-700">
                    Track user interactions and clicks
                  </span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Eye className="w-5 h-5 text-blue-600" />
                  <span className="text-sm text-gray-700">
                    View session recordings
                  </span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <BarChart3 className="w-5 h-5 text-orange-600" />
                  <span className="text-sm text-gray-700">
                    Generate heatmaps
                  </span>
                </div>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-800">
                  <strong>Demo Mode:</strong> This is a demonstration of the
                  Microsoft Clarity integration flow.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Clarity API Token
                </label>
                <input
                  type="password"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  placeholder="Enter your Clarity API token (demo)"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Find your API token in your Clarity dashboard under Settings →
                  API
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Project ID (Optional)
                </label>
                <input
                  type="text"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  placeholder="Enter your Clarity project ID (optional)"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Optional: Specify which Clarity project to connect
                </p>
              </div>

              <button
                onClick={handleConnect}
                disabled={isLoading || !apiToken.trim()}
                className="w-full bg-purple-600 text-white py-3 px-4 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Database className="w-5 h-5" />
                )}
                {isLoading ? "Connecting..." : "Connect Clarity (Demo)"}
              </button>
            </div>
          )}

          {step === "success" && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">
                Clarity Connected Successfully!
              </h3>
              <p className="text-gray-600">
                Your Microsoft Clarity integration is now active and will start
                collecting user experience data.
              </p>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2 text-green-800">
                  <CheckCircle className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    Connection established
                  </span>
                </div>
                <p className="text-xs text-green-700 mt-1">
                  User experience insights will appear in your dashboard within
                  24 hours
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
