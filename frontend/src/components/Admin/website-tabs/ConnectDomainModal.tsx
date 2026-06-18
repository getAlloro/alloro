import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
  Copy,
  Check,
  Unlink,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { getErrorMessage } from "../../../lib/errorMessage";

interface ConnectDomainModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  currentDomain: string | null;
  domainVerifiedAt: string | null;
  onDomainChange: () => void;
  /** Connect fn — admin uses fetch-based, user uses apiPost-based */
  onConnect: (domain: string) => Promise<{ server_ip: string }>;
  onVerify: () => Promise<{ verified: boolean; resolved_ips?: string[] }>;
  onDisconnect: () => Promise<void>;
}

export default function ConnectDomainModal({
  isOpen,
  onClose,
  currentDomain,
  domainVerifiedAt,
  onDomainChange,
  onConnect,
  onVerify,
  onDisconnect,
}: ConnectDomainModalProps) {
  const [domain, setDomain] = useState("");
  const [serverIp, setServerIp] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [verified, setVerified] = useState(!!domainVerifiedAt);
  const [copied, setCopied] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setVerified(!!domainVerifiedAt);
  }, [domainVerifiedAt]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleConnect = async () => {
    if (!domain.trim()) return;
    setConnecting(true);
    try {
      const result = await onConnect(domain.trim());
      setServerIp(result.server_ip);
      toast.success("Domain connected. Now update your DNS.");
      await onDomainChange();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || "Failed to connect domain");
    } finally {
      setConnecting(false);
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const result = await onVerify();
      if (result.verified) {
        setVerified(true);
        toast.success("Domain verified! SSL will be provisioned automatically.");
        if (intervalRef.current) clearInterval(intervalRef.current);
        onDomainChange();
      } else {
        toast.error("DNS not pointing to the correct IP yet. Try again in a few minutes.");
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || "Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  const handleAutoVerify = () => {
    handleVerify();
    intervalRef.current = setInterval(handleVerify, 15000);
  };

  const stopAutoVerify = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await onDisconnect();
      setDomain("");
      setServerIp("");
      setVerified(false);
      stopAutoVerify();
      toast.success("Domain disconnected");
      onDomainChange();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || "Failed to disconnect");
    } finally {
      setDisconnecting(false);
    }
  };

  const copyIp = () => {
    navigator.clipboard.writeText(serverIp);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-alloro-navy/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                  <Globe className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Custom Domain</h2>
                  <p className="text-sm text-gray-500">Connect your own domain to this site</p>
                </div>
              </div>
              <button
                onClick={() => { stopAutoVerify(); onClose(); }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5">
              {/* Already verified state */}
              {currentDomain && verified && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                    <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                    <div>
                      <p className="font-semibold text-green-800">{currentDomain}</p>
                      <p className="text-sm text-green-600">Domain verified and active</p>
                    </div>
                  </div>
                  <button
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
                  >
                    {disconnecting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Unlink className="w-4 h-4" />
                    )}
                    {disconnecting ? "Disconnecting..." : "Disconnect Domain"}
                  </button>
                </div>
              )}

              {/* Connected but not verified */}
              {currentDomain && !verified && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                    <div>
                      <p className="font-semibold text-amber-800">{currentDomain}</p>
                      <p className="text-sm text-amber-600">Pending DNS verification</p>
                    </div>
                  </div>

                  {serverIp && (
                    <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                      <p className="text-sm font-semibold text-gray-700">DNS Setup Instructions</p>
                      <p className="text-sm text-gray-600">
                        Go to your domain registrar and create an <strong>A record</strong> pointing to:
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono">
                          {serverIp}
                        </code>
                        <button
                          onClick={copyIp}
                          className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                          title="Copy IP"
                        >
                          {copied ? (
                            <Check className="w-4 h-4 text-green-600" />
                          ) : (
                            <Copy className="w-4 h-4 text-gray-500" />
                          )}
                        </button>
                      </div>
                      <div className="text-xs text-gray-500 space-y-1">
                        <p><strong>Type:</strong> A</p>
                        <p><strong>Name:</strong> @ (or your subdomain, e.g. www)</p>
                        <p><strong>Value:</strong> {serverIp}</p>
                        <p><strong>TTL:</strong> 3600 (or Auto)</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <button
                      onClick={intervalRef.current ? stopAutoVerify : handleAutoVerify}
                      disabled={verifying}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 disabled:opacity-50 transition-colors"
                    >
                      {verifying ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : intervalRef.current ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : null}
                      {verifying
                        ? "Checking..."
                        : intervalRef.current
                          ? "Checking... (click to stop)"
                          : "Verify DNS"}
                    </button>
                    <button
                      onClick={handleDisconnect}
                      disabled={disconnecting}
                      className="p-2.5 text-red-600 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50"
                      title="Disconnect"
                    >
                      {disconnecting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Unlink className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* No domain connected */}
              {!currentDomain && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Domain Name
                    </label>
                    <input
                      type="text"
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                      placeholder="www.example.com"
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                    />
                    <p className="text-xs text-gray-500 mt-1.5">
                      Enter the domain you want to connect (e.g. www.mywebsite.com)
                    </p>
                  </div>

                  <button
                    onClick={handleConnect}
                    disabled={!domain.trim() || connecting}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  >
                    {connecting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Globe className="w-4 h-4" />
                    )}
                    {connecting ? "Connecting..." : "Connect Domain"}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
