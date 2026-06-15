import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, AlertCircle, RefreshCw, FileText, Terminal, Mail, Globe, Code } from "lucide-react";
import {
  AdminPageHeader,
  TabBar,
  EmptyState,
  ActionButton,
} from "../../components/ui/DesignSystem";
import { useConfirm } from "../../components/ui/ConfirmModal";
import { fadeInUp } from "../../lib/animations";
import { adminFetch } from "../../api";

interface LogsData {
  logs: string[];
  total_lines: number;
  timestamp: string;
  log_type: string;
}

interface LogsResponse {
  success: boolean;
  data: LogsData;
  message?: string;
}

// Log type configuration
const LOG_TABS = [
  {
    id: "agent-run",
    label: "Agent Run",
    description: "AI agent execution logs",
    icon: <Terminal className="w-4 h-4" />,
  },
  {
    id: "email",
    label: "Email",
    description: "Email service logs",
    icon: <Mail className="w-4 h-4" />,
  },
  {
    id: "scraping-tool",
    label: "Scraping Tool",
    description: "Web scraping logs",
    icon: <Globe className="w-4 h-4" />,
  },
  {
    id: "website-scrape",
    label: "Website Scrape",
    description: "Website content scraping logs",
    icon: <Code className="w-4 h-4" />,
  },
] as const;

type LogType = (typeof LOG_TABS)[number]["id"];

/**
 * App Logs Page
 * Displays real-time application logs with auto-refresh
 * Fetches latest 500 lines every 2 seconds
 */
export default function AppLogs() {
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<LogType>("agent-run");
  const [logs, setLogs] = useState<string[]>([]);
  const [totalLines, setTotalLines] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  // Fetch logs for the active tab
  const fetchLogs = async () => {
    try {
      const response = await adminFetch(
        `/api/admin/app-logs?type=${activeTab}&lines=500`,
      );
      const data: LogsResponse = await response.json();

      if (data.success) {
        setLogs(data.data.logs);
        setTotalLines(data.data.total_lines);
        setError(null);
      } else {
        setError(data.message || "Failed to fetch logs");
      }
    } catch (err) {
      console.error("Failed to fetch logs:", err);
      setError("Failed to load logs. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Clear logs for the active tab
  const handleClearLogs = async () => {
    const tabLabel =
      LOG_TABS.find((t) => t.id === activeTab)?.label || activeTab;
    const ok = await confirm({ title: `Clear all ${tabLabel} logs?`, message: "This will permanently remove all log entries.", confirmLabel: "Clear", variant: "danger" });
    if (!ok) return;

    setClearing(true);
    try {
      const response = await adminFetch(`/api/admin/app-logs?type=${activeTab}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (data.success) {
        setLogs([]);
        setTotalLines(0);
        setError(null);
      } else {
        setError(data.message || "Failed to clear logs");
      }
    } catch (err) {
      console.error("Failed to clear logs:", err);
      setError("Failed to clear logs. Please try again.");
    } finally {
      setClearing(false);
    }
  };

  // Auto-scroll to bottom when new logs arrive
  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Fetch logs when tab changes
  useEffect(() => {
    setLoading(true);
    setLogs([]);
    fetchLogs();
  }, [activeTab]);

  // Auto-refresh every 2 seconds
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchLogs();
    }, 2000);

    return () => clearInterval(interval);
  }, [autoRefresh, activeTab]);

  // Auto-scroll when logs update
  useEffect(() => {
    if (logs.length > 0) {
      scrollToBottom();
    }
  }, [logs]);

  const activeTabInfo = LOG_TABS.find((t) => t.id === activeTab);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <AdminPageHeader
        icon={<FileText className="w-6 h-6" />}
        title="Application Logs"
        description="Monitor real-time system events and agent activities"
        actionButtons={
          <div className="flex items-center gap-2">
            {/* Auto-refresh toggle */}
            <motion.button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                autoRefresh
                  ? "bg-green-100 text-green-700 border border-green-200"
                  : "bg-gray-100 text-gray-600 border border-gray-200"
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <motion.div
                animate={autoRefresh ? { rotate: 360 } : { rotate: 0 }}
                transition={autoRefresh ? { duration: 1, repeat: Infinity, ease: "linear" } : {}}
              >
                <RefreshCw className="h-4 w-4" />
              </motion.div>
              {autoRefresh ? "Live" : "Paused"}
            </motion.button>

            {/* Manual refresh */}
            <ActionButton
              label="Refresh"
              icon={<RefreshCw className="w-4 h-4" />}
              onClick={fetchLogs}
              variant="secondary"
              disabled={autoRefresh}
            />

            {/* Clear logs */}
            <ActionButton
              label={clearing ? "Clearing..." : "Clear"}
              icon={<Trash2 className="w-4 h-4" />}
              onClick={handleClearLogs}
              variant="danger"
              disabled={clearing || logs.length === 0}
              loading={clearing}
            />
          </div>
        }
      />

      {/* Tabs */}
      <TabBar
        tabs={LOG_TABS.map(tab => ({
          id: tab.id,
          label: tab.label,
          icon: tab.icon,
        }))}
        activeTab={activeTab}
        onTabChange={(tabId) => setActiveTab(tabId as LogType)}
      />

      {/* Status Bar */}
      <motion.div
        className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl border border-gray-100"
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Source:</span>
            <span className="text-sm font-medium text-gray-800">
              {activeTabInfo?.description}
            </span>
          </div>
          <span className="text-gray-300">|</span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Lines:</span>
            <span className="text-sm font-medium text-gray-800">
              {logs.length} / {totalLines}
            </span>
          </div>
          {autoRefresh && (
            <>
              <span className="text-gray-300">|</span>
              <div className="flex items-center gap-2">
                <motion.span
                  className="w-2 h-2 rounded-full bg-green-500"
                  animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
                <span className="text-sm text-green-600 font-medium">
                  Live updating
                </span>
              </div>
            </>
          )}
        </div>
      </motion.div>

      {/* Error message */}
      <AnimatePresence>
        {error && (
          <motion.div
            className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-900">Error</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Logs container */}
      <motion.div
        className="rounded-2xl border border-gray-200 bg-gray-900 shadow-lg overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Terminal header */}
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-800 border-b border-gray-700">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500" />
            <span className="w-3 h-3 rounded-full bg-yellow-500" />
            <span className="w-3 h-3 rounded-full bg-green-500" />
          </div>
          <span className="text-xs text-gray-400 ml-2 font-mono">
            {activeTabInfo?.label}.log
          </span>
        </div>

        {/* Logs content */}
        <div
          ref={logsContainerRef}
          className="text-gray-100 font-mono text-xs p-4 overflow-auto"
          style={{ height: "500px" }}
        >
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <motion.div
                className="flex items-center gap-3 text-gray-400"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <RefreshCw className="w-5 h-5 animate-spin" />
                Loading logs...
              </motion.div>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <EmptyState
                icon={<Terminal className="w-8 h-8" />}
                title="No logs available"
                description={`No logs found for ${activeTabInfo?.label}`}
              />
            </div>
          ) : (
            <div className="space-y-0">
              {logs.map((line, index) => (
                <motion.div
                  key={index}
                  className={`flex hover:bg-gray-800/50 px-2 py-0.5 rounded transition-colors ${
                    line.includes("ERROR") || line.includes("Failed")
                      ? "border-l-2 border-red-500 bg-red-900/10"
                      : line.includes("SUCCESS") || line.includes("✓")
                      ? "border-l-2 border-green-500 bg-green-900/10"
                      : line.includes("WARNING")
                      ? "border-l-2 border-yellow-500 bg-yellow-900/10"
                      : "border-l-2 border-transparent"
                  }`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.1, delay: index * 0.001 }}
                >
                  <span className="text-gray-600 select-none w-12 text-right mr-4 shrink-0">
                    {index + 1}
                  </span>
                  <span
                    className={
                      line.includes("ERROR") || line.includes("Failed")
                        ? "text-red-400"
                        : line.includes("SUCCESS") || line.includes("✓")
                        ? "text-green-400"
                        : line.includes("WARNING")
                        ? "text-yellow-400"
                        : "text-gray-300"
                    }
                  >
                    {line}
                  </span>
                </motion.div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      </motion.div>

      {/* Legend */}
      <motion.div
        className="flex items-center gap-6 text-xs text-gray-500"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center gap-2">
          <span className="w-3 h-0.5 bg-red-500 rounded" />
          <span>Error</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-0.5 bg-yellow-500 rounded" />
          <span>Warning</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-0.5 bg-green-500 rounded" />
          <span>Success</span>
        </div>
      </motion.div>
    </div>
  );
}
