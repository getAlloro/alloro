import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Search, Loader2, ChevronDown, ExternalLink, AlertTriangle } from "lucide-react";
import { toast } from "react-hot-toast";
import { ActionButton } from "../../ui/DesignSystem";
import {
  useCreateGscIntegration,
  useGoogleReconnect,
  useGscConnections,
  useGscSites,
} from "../../../hooks/queries/useWebsiteIntegrations";

interface Props {
  projectId: string;
  onConnected: () => void;
}

const POPUP_WIDTH = 500;
const POPUP_HEIGHT = 600;

export default function GscConnectPanel({ projectId, onConnected }: Props) {
  const [selectedConnectionId, setSelectedConnectionId] = useState<number | null>(null);
  const [selectedSiteUrl, setSelectedSiteUrl] = useState<string | null>(null);
  const [oauthPending, setOauthPending] = useState(false);
  const popupRef = useRef<Window | null>(null);

  const connectionsQuery = useGscConnections(projectId);
  const sitesQuery = useGscSites(projectId, selectedConnectionId);
  const createMutation = useCreateGscIntegration(projectId);
  const reconnectMutation = useGoogleReconnect();

  const connections = connectionsQuery.data?.data ?? [];
  const selectedConnection = connections.find(
    (connection) => connection.id === selectedConnectionId,
  );
  const sites = sitesQuery.isPlaceholderData ? [] : sitesQuery.data?.data ?? [];
  const loading = connectionsQuery.isLoading && !connectionsQuery.data;
  const sitesLoading =
    !!selectedConnectionId && (sitesQuery.isLoading || sitesQuery.isFetching || sitesQuery.isPlaceholderData);
  const creating = createMutation.isPending;
  const oauthLoading = reconnectMutation.isPending || oauthPending;

  const handleSelectConnection = (connId: number) => {
    setSelectedConnectionId(connId);
    setSelectedSiteUrl(null);
  };

  const handleCreate = async () => {
    if (!selectedConnectionId || !selectedSiteUrl) return;

    try {
      const result = await createMutation.mutateAsync({
        connectionId: selectedConnectionId,
        siteUrl: selectedSiteUrl,
      });
      toast.success("Search Console connected");

      if (result.data.initialHarvest.warning) {
        toast.error(result.data.initialHarvest.warning);
      } else if (result.data.initialHarvest.queued) {
        toast.success(`Initial harvest queued for ${result.data.initialHarvest.harvestDate}`);
      }

      onConnected();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to connect");
    }
  };

  const handleConnectAccount = async () => {
    setOauthPending(true);

    try {
      const data = await reconnectMutation.mutateAsync("gsc");
      if (!data.success || !data.authUrl) {
        throw new Error(data.message || "Failed to generate authorization URL");
      }

      const left = window.screenX + (window.outerWidth - POPUP_WIDTH) / 2;
      const top = window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2;
      const features = `left=${left},top=${top},width=${POPUP_WIDTH},height=${POPUP_HEIGHT},resizable=yes,scrollbars=yes`;

      popupRef.current = window.open(data.authUrl, "gsc_oauth", features);

      if (!popupRef.current) {
        throw new Error("Popup blocked — please allow popups for this site");
      }

      const handleMessage = (event: MessageEvent) => {
        const allowedOrigins = [
          window.location.origin,
          "http://localhost:3000",
          "http://localhost:5173",
          "http://localhost:5174",
        ];
        if (!allowedOrigins.includes(event.origin)) return;

        if (event.data.type === "GOOGLE_OAUTH_SUCCESS") {
          try { popupRef.current?.close(); } catch { /* COOP */ }
          popupRef.current = null;
          setOauthPending(false);
          window.removeEventListener("message", handleMessage);
          toast.success("Google account connected");
          connectionsQuery.refetch();
        } else if (event.data.type === "GOOGLE_OAUTH_ERROR") {
          try { popupRef.current?.close(); } catch { /* COOP */ }
          popupRef.current = null;
          setOauthPending(false);
          window.removeEventListener("message", handleMessage);
          toast.error("Authorization failed");
        }
      };

      window.addEventListener("message", handleMessage);

      const checkClosed = () => {
        try {
          if (popupRef.current?.closed) {
            setOauthPending(false);
            window.removeEventListener("message", handleMessage);
            return;
          }
        } catch { /* COOP */ }
        setTimeout(checkClosed, 1000);
      };
      checkClosed();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start authorization");
      setOauthPending(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (connectionsQuery.isError) {
    return (
      <div className="p-8 max-w-lg mx-auto">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Failed to load Google connections</p>
            <p className="text-xs mt-1 leading-relaxed">
              {connectionsQuery.error instanceof Error
                ? connectionsQuery.error.message
                : "Please try again."}
            </p>
            <button
              type="button"
              onClick={() => connectionsQuery.refetch()}
              className="mt-3 text-xs font-semibold text-red-700 hover:text-red-900"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="p-8 flex flex-col items-center text-center max-w-lg mx-auto"
    >
      <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 mb-4">
        <Search className="w-7 h-7" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">
        Connect Google Search Console
      </h3>

      {connections.length === 0 ? (
        <>
          <p className="text-sm text-gray-500 mb-5 leading-relaxed">
            No Google accounts with Search Console access found. Connect a Google
            account from the admin org or the client org that has Search Console
            access to get started.
          </p>
          <ActionButton
            label={oauthLoading ? "Connecting..." : "Connect Google Account"}
            icon={oauthLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
            variant="primary"
            onClick={handleConnectAccount}
            disabled={oauthLoading}
          />
        </>
      ) : (
        <div className="w-full text-left space-y-4 mt-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Google Account
            </label>
            <div className="relative">
              <select
                value={selectedConnectionId ?? ""}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val) handleSelectConnection(val);
                }}
                className="w-full appearance-none bg-white border border-gray-200 rounded-xl px-4 py-2.5 pr-10 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
              >
                <option value="">Select an account...</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.email} — {c.sourceLabel}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
            {selectedConnection && (
              <p className="mt-2 text-xs text-gray-500">
                Future Search Console fetches for this website will use this{" "}
                {selectedConnection.sourceLabel.toLowerCase()}.
              </p>
            )}
          </div>

          {selectedConnectionId && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Search Console Site
              </label>
              {sitesLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading sites...
                </div>
              ) : sitesQuery.isError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-600" />
                  <span>Failed to load Search Console sites.</span>
                </div>
              ) : sites.length > 0 ? (
                <div className="relative">
                  <select
                    value={selectedSiteUrl ?? ""}
                    onChange={(e) => setSelectedSiteUrl(e.target.value || null)}
                    className="w-full appearance-none bg-white border border-gray-200 rounded-xl px-4 py-2.5 pr-10 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                  >
                    <option value="">Select a site...</option>
                    {sites.map((s) => (
                      <option key={s.siteUrl} value={s.siteUrl}>
                        {s.permissionLevel ? `${s.siteUrl} (${s.permissionLevel})` : s.siteUrl}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
                  <span>No sites found in this account's Search Console.</span>
                </div>
              )}
            </div>
          )}

          {selectedSiteUrl && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <ActionButton
                label={creating ? "Connecting..." : "Connect Site"}
                icon={creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                variant="primary"
                onClick={handleCreate}
                disabled={creating}
              />
            </motion.div>
          )}

          <div className="pt-2 border-t border-gray-100">
            <button
              onClick={handleConnectAccount}
              disabled={oauthLoading}
              className="text-xs text-gray-400 hover:text-emerald-600 transition-colors"
            >
              {oauthLoading ? "Connecting..." : "+ Connect a different Google account"}
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
