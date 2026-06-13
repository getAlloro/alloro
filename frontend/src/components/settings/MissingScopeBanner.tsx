import React, { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { ExternalLink, FileText, Loader2 } from "lucide-react";
import { GoogleAPITermsModal } from "./GoogleAPITermsModal";
import { apiGet } from "../../api";

interface MissingScopeBannerProps {
  missingCount: number;
  missingScopes: string[];
  onGrantAccess?: () => void;
}

// Popup dimensions and timeout
const POPUP_WIDTH = 500;
const POPUP_HEIGHT = 600;
const POPUP_TIMEOUT = 300000; // 5 minutes

export const MissingScopeBanner: React.FC<MissingScopeBannerProps> = ({
  missingCount,
  missingScopes,
  onGrantAccess,
}) => {
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const centerPopup = (width: number, height: number) => {
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    return `left=${left},top=${top},width=${width},height=${height}`;
  };

  const closePopup = useCallback(() => {
    try {
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }
    } catch {
      // COOP policy may block access
    }
    popupRef.current = null;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const handleGrantAccess = async () => {
    setIsLoading(true);

    try {
      // Request incremental authorization URL for all missing scopes
      const scopeParam = missingScopes.join(",");
      const response = await apiGet({
        path: `/auth/google/reconnect?scopes=${scopeParam}`,
      });

      if (!response.success || !response.authUrl) {
        throw new Error(
          response.message || "Failed to generate authorization URL",
        );
      }

      // Open popup with OAuth URL
      const popupFeatures = [
        centerPopup(POPUP_WIDTH, POPUP_HEIGHT),
        "resizable=yes",
        "scrollbars=yes",
        "status=no",
        "toolbar=no",
        "menubar=no",
        "location=no",
      ].join(",");

      popupRef.current = window.open(
        response.authUrl,
        "google_oauth_reconnect",
        popupFeatures,
      );

      if (!popupRef.current) {
        throw new Error(
          "Popup was blocked. Please allow popups for this site.",
        );
      }

      // Set timeout for popup
      timeoutRef.current = setTimeout(() => {
        closePopup();
        setIsLoading(false);
      }, POPUP_TIMEOUT);

      // Listen for messages from popup
      const handleMessage = (event: MessageEvent) => {
        // Accept from common origins
        const allowedOrigins = [
          window.location.origin,
          "http://localhost:3000",
          "http://localhost:5173",
          "http://localhost:5174",
        ];

        if (!allowedOrigins.includes(event.origin)) {
          return;
        }

        if (event.data.type === "GOOGLE_OAUTH_SUCCESS") {
          closePopup();
          setIsLoading(false);
          window.removeEventListener("message", handleMessage);

          // Notify parent to refresh scope status
          if (onGrantAccess) {
            onGrantAccess();
          } else {
            // Fallback: reload the page
            window.location.reload();
          }
        } else if (event.data.type === "GOOGLE_OAUTH_ERROR") {
          closePopup();
          setIsLoading(false);
          window.removeEventListener("message", handleMessage);
        }
      };

      window.addEventListener("message", handleMessage);

      // Monitor popup for closure
      const checkClosed = () => {
        try {
          if (popupRef.current?.closed) {
            setIsLoading(false);
            closePopup();
            window.removeEventListener("message", handleMessage);
            return;
          }
        } catch {
          // COOP policy may block access
        }
        setTimeout(checkClosed, 1000);
      };

      checkClosed();
    } catch {
      setIsLoading(false);
      closePopup();
    }
  };

  if (missingCount === 0) return null;

  const scopeNames = missingScopes.map((scope) => {
    switch (scope) {
      case "gbp":
        return "Business Profile";
      case "gsc":
        return "Search Console";
      default:
        return scope.toUpperCase();
    }
  });

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-red-50 to-amber-50 border-2 border-red-200 rounded-2xl p-5 mb-6"
      >
        <div className="space-y-5">
          {/* Message */}
          <div>
            <h3 className="font-display text-lg font-medium tracking-tight text-red-900">
              Missing {missingCount} Required API Access
              {missingCount > 1 ? "es" : ""}
            </h3>
            <p className="text-red-700 text-sm mt-1">
              Alloro needs access to <strong>{scopeNames.join(", ")}</strong>{" "}
              for our system to properly work with your practice. Without this
              access, some features will be unavailable.
            </p>
          </div>

          {/* Actions - below the message */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              onClick={handleGrantAccess}
              disabled={isLoading}
              className="flex items-center justify-center gap-2 px-4 py-2 text-[13px] font-bold text-white bg-alloro-orange hover:bg-alloro-orange/90 rounded-xl transition-all shadow-lg shadow-alloro-orange/20 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <ExternalLink size={16} />
                  Grant Alloro Missing Access
                </>
              )}
            </button>
            <button
              onClick={() => setShowTermsModal(true)}
              className="flex items-center justify-center gap-2 px-3.5 py-2 text-[13px] font-bold text-slate-600 hover:text-alloro-navy bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all whitespace-nowrap"
            >
              <FileText size={16} />
              Read our Google API Terms
            </button>
          </div>
        </div>
      </motion.div>

      <GoogleAPITermsModal
        isOpen={showTermsModal}
        onClose={() => setShowTermsModal(false)}
      />
    </>
  );
};
