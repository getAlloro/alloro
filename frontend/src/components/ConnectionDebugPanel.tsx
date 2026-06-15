import React, { useState, useEffect } from "react";
import { Bug, CheckCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { logger } from "../lib/logger";

// TODO: Create src/utils/connectionTester.ts with ConnectionTester class
const ConnectionTester = {
  quickDiagnostic: async () => {
    // Placeholder implementation
    return ["No immediate issues detected"];
  },
  getInstance: () => ({
    runAllTests: async () => ({
      passed: 8,
      failed: 2,
      total: 10,
      results: [
        {
          name: "API Connection",
          success: true,
          message: "Successfully connected to API",
          duration: 150,
          data: { status: "ok" },
        },
        {
          name: "Database Connection",
          success: false,
          message: "Connection timeout",
          duration: 5000,
          data: { error: "timeout" },
        },
      ],
    }),
  }),
};

interface ConnectionDebugPanelProps {
  isVisible: boolean;
  onClose: () => void;
}

export const ConnectionDebugPanel: React.FC<ConnectionDebugPanelProps> = ({
  isVisible,
  onClose,
}) => {
  const [testResults, setTestResults] = useState<any>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [quickIssues, setQuickIssues] = useState<string[]>([]);

  useEffect(() => {
    if (isVisible) {
      runQuickDiagnostic();
    }
  }, [isVisible]);

  const runQuickDiagnostic = async () => {
    try {
      const issues = await ConnectionTester.quickDiagnostic();
      setQuickIssues(issues);
    } catch (error) {
      logger.error("Quick diagnostic failed:", error);
    }
  };

  const runFullTests = async () => {
    setIsRunning(true);
    try {
      const tester = ConnectionTester.getInstance();
      const results = await tester.runAllTests();
      setTestResults(results);
    } catch (error) {
      logger.error("Full tests failed:", error);
    } finally {
      setIsRunning(false);
    }
  };

  const getStatusIcon = (success: boolean) => {
    return success ? (
      <CheckCircle className="w-4 h-4 text-green-600" />
    ) : (
      <AlertTriangle className="w-4 h-4 text-red-600" />
    );
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Bug className="w-6 h-6 text-red-600" />
            <h2 className="text-xl font-bold text-gray-900">
              Connection Diagnostics
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Quick Issues */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Quick Diagnostic
            </h3>
            {quickIssues.length === 0 ? (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="w-5 h-5" />
                <span>No immediate issues detected</span>
              </div>
            ) : (
              <div className="space-y-2">
                {quickIssues.map((issue, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 text-red-600"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-sm">{issue}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Full Test Results */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900">
                Comprehensive Tests
              </h3>
              <button
                onClick={runFullTests}
                disabled={isRunning}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {isRunning ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Bug className="w-4 h-4" />
                )}
                {isRunning ? "Running Tests..." : "Run Full Tests"}
              </button>
            </div>

            {testResults && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {testResults.passed}
                    </div>
                    <div className="text-sm text-gray-600">Passed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">
                      {testResults.failed}
                    </div>
                    <div className="text-sm text-gray-600">Failed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {((testResults.passed / testResults.total) * 100).toFixed(
                        0
                      )}
                      %
                    </div>
                    <div className="text-sm text-gray-600">Success Rate</div>
                  </div>
                </div>

                <div className="space-y-2">
                  {testResults.results.map((result: any, index: number) => (
                    <div
                      key={index}
                      className={`p-4 rounded-lg border ${
                        result.success
                          ? "bg-green-50 border-green-200"
                          : "bg-red-50 border-red-200"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(result.success)}
                          <span className="font-medium">{result.name}</span>
                        </div>
                        <span className="text-xs text-gray-500">
                          {result.duration.toFixed(0)}ms
                        </span>
                      </div>
                      <p
                        className={`text-sm mt-1 ${
                          result.success ? "text-green-700" : "text-red-700"
                        }`}
                      >
                        {result.message}
                      </p>
                      {result.data && (
                        <details className="mt-2">
                          <summary className="text-xs cursor-pointer text-gray-600">
                            View Details
                          </summary>
                          <pre className="text-xs mt-1 p-2 bg-gray-100 rounded overflow-auto">
                            {JSON.stringify(result.data, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Manual Tests */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Manual Tests
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() =>
                  window.open(
                    "https://hamiltonwisedashboard.netlify.app/",
                    "_blank"
                  )
                }
                className="p-3 text-left border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <div className="font-medium">Test Live Site</div>
                <div className="text-sm text-gray-600">Open in new tab</div>
              </button>
              <button
                onClick={() => {
                  localStorage.clear();
                  sessionStorage.clear();
                  window.location.reload();
                }}
                className="p-3 text-left border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <div className="font-medium">Clear Storage & Reload</div>
                <div className="text-sm text-gray-600">Reset all data</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
