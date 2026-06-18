import React, { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import googleAuth from "../api/google-auth";
import { logger } from "../lib/logger";
import { getErrorMessage } from "../lib/errorMessage";

// Popup dimensions and timeout
const POPUP_WIDTH = 500;
const POPUP_HEIGHT = 600;
const POPUP_TIMEOUT = 300000; // 5 minutes

interface GoogleConnectButtonProps {
  className?: string;
  variant?: "primary" | "outline" | "minimal";
  size?: "sm" | "md" | "lg";
  onSuccess?: () => void;
}

/**
 * Google Connect Button — initiates Google OAuth for GBP connection (NOT for login).
 * Uses popup pattern (window.open) so the user stays on the current page.
 * After successful OAuth, calls onSuccess so the parent can react (e.g. open GBP selector).
 */
export const GoogleConnectButton: React.FC<GoogleConnectButtonProps> = ({
  className = "",
  variant = "primary",
  size = "md",
  onSuccess,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const baseClasses =
    "flex items-center justify-center gap-3 font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2";

  const variantClasses = {
    primary: "bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 focus:ring-slate-300",
    outline:
      "border-2 border-gray-300 hover:border-blue-500 bg-white hover:bg-blue-50 text-gray-700 hover:text-blue-600 focus:ring-blue-500",
    minimal:
      "bg-transparent hover:bg-gray-100 text-gray-600 hover:text-blue-600 focus:ring-gray-500",
  };

  const sizeClasses = {
    sm: "px-3 py-2 text-sm",
    md: "px-4 py-3 text-base",
    lg: "px-6 py-4 text-lg",
  };

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

  const handleConnect = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setError(null);

    try {
      const { authUrl } = await googleAuth.getOAuthUrl();
      if (!authUrl) {
        setError("Failed to start Google connection");
        setIsLoading(false);
        return;
      }

      // Open OAuth in popup — user stays on current page
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
        authUrl,
        "google_oauth_connect",
        popupFeatures
      );

      if (!popupRef.current) {
        setError("Popup was blocked. Please allow popups for this site.");
        setIsLoading(false);
        return;
      }

      // Set timeout for popup
      timeoutRef.current = setTimeout(() => {
        closePopup();
        setIsLoading(false);
      }, POPUP_TIMEOUT);

      // Listen for success/error messages from popup
      const handleMessage = (event: MessageEvent) => {
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
          logger.log("[GoogleConnect] OAuth success");
          closePopup();
          setIsLoading(false);
          window.removeEventListener("message", handleMessage);

          if (onSuccess) {
            onSuccess();
          }
        } else if (event.data.type === "GOOGLE_OAUTH_ERROR") {
          logger.error("[GoogleConnect] OAuth error:", event.data.error);
          closePopup();
          setIsLoading(false);
          setError("Google connection failed. Please try again.");
          window.removeEventListener("message", handleMessage);
        }
      };

      window.addEventListener("message", handleMessage);

      // Monitor popup for manual closure
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
    } catch (err) {
      setError(getErrorMessage(err) || "Failed to connect. Please try again.");
      setIsLoading(false);
      closePopup();
    }
  };

  return (
    <div className="space-y-3">
      <button
        onClick={() => setShowConfirm(true)}
        disabled={isLoading}
        className={`${baseClasses} ${variantClasses[variant]} ${
          sizeClasses[size]
        } ${className} ${
          isLoading ? "opacity-50 cursor-not-allowed" : "hover:shadow-md"
        }`}
      >
        {isLoading ? (
          <>
            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            <span>Connecting...</span>
          </>
        ) : (
          <>
            <GoogleIcon className="w-5 h-5" />
            <span>Connect Google Account</span>
          </>
        )}
      </button>

      {/* Confirmation Dialog — portal to body so it covers the full screen */}
      {showConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full mx-4 p-6">
            <div className="flex items-center gap-3 mb-3">
              <GoogleIcon className="w-6 h-6" />
              <h3 className="text-lg font-bold text-alloro-navy">
                Connect Google Account
              </h3>
            </div>
            <p className="text-sm text-slate-500 mb-6">
              Are you sure you want to connect your Google Business Profile
              account? A popup will open for you to authorize access.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false);
                  handleConnect();
                }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-alloro-orange text-white font-medium hover:bg-alloro-orange/90 transition-colors"
              >
                Connect
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">
                Connection Failed
              </p>
              <p className="text-sm text-red-600 mt-1">{error}</p>
              <button
                onClick={() => setError(null)}
                className="text-sm text-red-700 hover:text-red-800 underline mt-2"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Google Icon Component
const GoogleIcon: React.FC<{ className?: string }> = ({
  className = "w-5 h-5",
}) => (
  <svg className={className} viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);
