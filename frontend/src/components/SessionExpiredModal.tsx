import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LogOut } from "lucide-react";
import { queryClient } from "../lib/queryClient";
import {
  clearEmbeddedPilotSession,
  isEmbeddedPilotSession,
  PILOT_EMBED_EXPIRED_MESSAGE,
} from "../utils/embeddedPilotSession";

/**
 * SessionExpiredModal
 *
 * Listens for the "session:expired" custom event (dispatched by the axios
 * 403 interceptor in api/index.ts) and shows a non-dismissible modal
 * prompting the user to sign in again.
 *
 * Cleanup mirrors SessionProvider.disconnect() — clears all auth state,
 * query cache, cookies, and broadcasts logout to other tabs.
 */
export function SessionExpiredModal() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = () => setVisible(true);
    window.addEventListener("session:expired", handler);
    return () => window.removeEventListener("session:expired", handler);
  }, []);

  const handleSignIn = useCallback(() => {
    if (isEmbeddedPilotSession()) {
      clearEmbeddedPilotSession();
      window.parent.postMessage(
        { type: PILOT_EMBED_EXPIRED_MESSAGE },
        window.location.origin
      );
      setVisible(false);
      return;
    }

    // Clear auth tokens
    localStorage.removeItem("auth_token");
    localStorage.removeItem("token");
    localStorage.removeItem("user_role");
    localStorage.removeItem("onboardingCompleted");
    localStorage.removeItem("hasProperties");

    // Clear pilot session data
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("pilot_mode");
    sessionStorage.removeItem("user_role");

    // Clear TanStack Query cache
    queryClient.clear();

    // Clear cookie for cross-app auth sync
    const isProduction = window.location.hostname.includes("getalloro.com");
    const domain = isProduction ? "; domain=.getalloro.com" : "";
    document.cookie = `auth_token=; path=/; max-age=0${domain}`;

    // Broadcast logout to other tabs
    try {
      const channel = new BroadcastChannel("auth_channel");
      channel.postMessage({ type: "logout" });
      channel.close();
    } catch {
      // BroadcastChannel not supported
    }

    window.location.href = "/signin";
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop — no click dismiss */}
          <motion.div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#1a1a24]/80 p-6 shadow-[0_25px_60px_-12px_rgba(0,0,0,0.5)] backdrop-blur-2xl backdrop-saturate-[180%]"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          >
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-alloro-orange/15">
                <LogOut className="h-5 w-5 text-alloro-orange" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-[#eaeaea] leading-snug">
                  {isEmbeddedPilotSession() ? "Pilot Session Expired" : "Session Expired"}
                </h3>
                <p className="mt-2 text-sm text-[#6a6a75] leading-relaxed">
                  {isEmbeddedPilotSession()
                    ? "This pilot session has expired. Return to the organization Pilot tab to start a new one."
                    : "Your session has expired. Please sign in again to continue using Alloro."}
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end">
              <motion.button
                onClick={handleSignIn}
                className="rounded-xl border border-transparent bg-alloro-orange px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-alloro-orange/25 transition-colors hover:bg-alloro-orange/90 focus:outline-none focus:ring-2 focus:ring-alloro-orange focus:ring-offset-2 focus:ring-offset-[#1a1a24]"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {isEmbeddedPilotSession() ? "Close Pilot" : "Sign In"}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
