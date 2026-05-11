import { useState, useCallback, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, Loader2, ChevronDown, ExternalLink, AlertTriangle } from "lucide-react";
import { toast } from "react-hot-toast";
import { ActionButton } from "../../ui/DesignSystem";
import {
  fetchGscConnections,
  fetchGscSites,
  createGscIntegration,
  getReconnectUrl,
  type GscConnection,
  type GscSite,
} from "../../../api/integrations";

interface Props {
  projectId: string;
  onConnected: () => void;
}

const POPUP_WIDTH = 500;
const POPUP_HEIGHT = 600;

export default function GscConnectPanel({ projectId, onConnected }: Props) {
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<GscConnection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<number | null>(null);
  const [sites, setSites] = useState<GscSite[]>([]);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [selectedSiteUrl, setSelectedSiteUrl] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const popupRef = useRef<Window | null>(null);

  const loadConnections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchGscConnections(projectId);
      setConnections(res.data || []);
    } catch {
      toast.error("Failed to load Google connections");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  const handleSelectConnection = async (connId: number) => {
    setSelectedConnectionId(connId);
    setSelectedSiteUrl(null);
    setSites([]);
    setSitesLoading(true);
    try {
      const res = await fetchGscSites(projectId, connId);
      setSites(res.data || []);
      if ((res.data || []).length === 0) {
        toast.error("No sites found in this account's Search Console");
      }
    } catch {
      toast.error("Failed to load Search Console sites");
    } finally {
      setSitesLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!selectedConnectionId || !selectedSiteUrl) return;
    setCreating(true);
    try {
      await createGscIntegration(projectId, {
        connectionId: selectedConnectionId,
        siteUrl: selectedSiteUrl,
      });
      toast.success("Search Console connected");
      onConnected();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setCreating(false);
    }
  };

  const handleConnectAccount = async () => {
    setOauthLoading(true);
    try {
      const data = await getReconnectUrl("gsc");
      if (!data.success || !data.authUrl) {
        toast.error("Failed to generate authorization URL");
        setOauthLoading(false);
        return;
      }

      const left = window.screenX + (window.outerWidth - POPUP_WIDTH) / 2;
      const top = window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2;
      const features = `left=${left},top=${top},width=${POPUP_WIDTH},height=${POPUP_HEIGHT},resizable=yes,scrollbars=yes`;

      popupRef.current = window.open(data.authUrl, "gsc_oauth", features);

      if (!popupRef.current) {
        toast.error("Popup blocked — please allow popups for this site");
        setOauthLoading(false);
        return;
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
          setOauthLoading(false);
          window.removeEventListener("message", handleMessage);
          toast.success("Google account connected");
          loadConnections();
        } else if (event.data.type === "GOOGLE_OAUTH_ERROR") {
          try { popupRef.current?.close(); } catch { /* COOP */ }
          popupRef.current = null;
          setOauthLoading(false);
          window.removeEventListener("message", handleMessage);
          toast.error("Authorization failed");
        }
      };

      window.addEventListener("message", handleMessage);

      const checkClosed = () => {
        try {
          if (popupRef.current?.closed) {
            setOauthLoading(false);
            window.removeEventListener("message", handleMessage);
            return;
          }
        } catch { /* COOP */ }
        setTimeout(checkClosed, 1000);
      };
      checkClosed();
    } catch {
      toast.error("Failed to start authorization");
      setOauthLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
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
            account that has Search Console access to get started.
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
          {/* Connection picker */}
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
                    {c.email}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Site picker */}
          {selectedConnectionId && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Search Console Site
              </label>
              {sitesLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading sites...
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
                        {s.siteUrl}
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

          {/* Connect button */}
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

          {/* Add another account option */}
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
