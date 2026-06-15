import { useState, useEffect, useRef } from "react";
import { ChevronLeft, Loader2, MapPin, Check, X } from "lucide-react";
import { GoogleConnectButton } from "../GoogleConnectButton";
import { logger } from "../../lib/logger";
import { getErrorMessage } from "../../lib/errorMessage";

interface GBPSelection {
  accountId: string;
  locationId: string;
  displayName: string;
}

interface Step2GbpConnectProps {
  hasGoogleConnection: boolean;
  selectedGbpLocations: GBPSelection[];
  onGbpSelect: (locations: GBPSelection[]) => Promise<void>;
  fetchAvailableGBP: () => Promise<any[]>;
  onGoogleConnected: () => void;
  autoOpenGbp?: boolean;
  onAutoOpenGbpHandled?: () => void;
  onNext: () => void;
  onBack: () => void;
  isCompleting?: boolean;
}

export const Step2DomainInfo: React.FC<Step2GbpConnectProps> = ({
  hasGoogleConnection,
  selectedGbpLocations,
  onGbpSelect,
  fetchAvailableGBP,
  onGoogleConnected,
  autoOpenGbp,
  onAutoOpenGbpHandled,
  onNext,
  onBack,
  isCompleting,
}) => {
  // GBP modal state
  const [gbpModalOpen, setGbpModalOpen] = useState(false);
  const [gbpLocations, setGbpLocations] = useState<any[]>([]);
  const [gbpLoading, setGbpLoading] = useState(false);
  const [gbpSaving, setGbpSaving] = useState(false);
  const [gbpError, setGbpError] = useState<string | null>(null);
  const [gbpSelectedIds, setGbpSelectedIds] = useState<Set<string>>(new Set());

  const gbpRef = useRef<HTMLDivElement>(null);

  // Auto-open GBP modal after Google OAuth succeeds
  useEffect(() => {
    if (autoOpenGbp && hasGoogleConnection) {
      handleOpenGbpModal();
      if (onAutoOpenGbpHandled) {
        onAutoOpenGbpHandled();
      }
    }
  }, [autoOpenGbp, hasGoogleConnection]);

  // Click outside handler for GBP popup
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (gbpRef.current && !gbpRef.current.contains(e.target as Node)) {
        setGbpModalOpen(false);
        setGbpError(null);
      }
    };
    if (gbpModalOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [gbpModalOpen]);

  // Sync selected IDs when popup opens
  useEffect(() => {
    if (gbpModalOpen) {
      const ids = new Set(
        selectedGbpLocations.map(
          (loc) => `accounts/${loc.accountId}/locations/${loc.locationId}`
        )
      );
      setGbpSelectedIds(ids);
    }
  }, [gbpModalOpen, selectedGbpLocations]);

  const handleOpenGbpModal = async () => {
    setGbpModalOpen(true);
    setGbpLoading(true);
    setGbpError(null);

    try {
      const locations = await fetchAvailableGBP();
      setGbpLocations(locations);
    } catch (err: unknown) {
      logger.error("[Onboarding] Failed to fetch GBP locations:", err);
      setGbpError(getErrorMessage(err) || "Failed to load GBP locations");
      setGbpLocations([]);
    } finally {
      setGbpLoading(false);
    }
  };

  const toggleGbpLocation = (id: string) => {
    setGbpSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleGbpConfirm = async () => {
    setGbpSaving(true);
    try {
      const selected = gbpLocations.filter((loc) => gbpSelectedIds.has(loc.id));
      const selections: GBPSelection[] = selected.map((item) => ({
        accountId: item.accountId,
        locationId: item.locationId,
        displayName: item.name,
      }));

      await onGbpSelect(selections);
      setGbpModalOpen(false);
    } catch (err: unknown) {
      logger.error("[Onboarding] Failed to save GBP selection:", err);
      setGbpError(getErrorMessage(err) || "Failed to save selection");
    } finally {
      setGbpSaving(false);
    }
  };

  const hasGbpSelected = selectedGbpLocations.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold font-heading text-alloro-navy mb-2 tracking-tight">
          Connect Google Business Profile
        </h2>
        <p className="text-slate-500 text-sm">
          {hasGoogleConnection
            ? "Select your GBP locations to get started"
            : "Connect your Google account to link your business profile"}
        </p>
      </div>

      {/* Content */}
      <div className="space-y-4">
        {!hasGoogleConnection ? (
          // Google Connect section
          <div className="space-y-4">
            <div className="p-6 rounded-xl border border-slate-200 bg-slate-50/50 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-white border border-slate-200 flex items-center justify-center">
                <svg className="w-7 h-7" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-alloro-navy">
                  Link your Google Business Profile
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  This allows Alloro to access your GBP data for insights and recommendations
                </p>
              </div>
              <GoogleConnectButton
                variant="outline"
                size="md"
                className="w-full"
                onSuccess={onGoogleConnected}
              />
            </div>
          </div>
        ) : (
          // GBP Location Selector
          <div className="space-y-3" ref={gbpRef}>
            <button
              type="button"
              onClick={handleOpenGbpModal}
              className={`w-full px-4 py-3 rounded-xl border transition-all flex items-center justify-center gap-2 font-medium ${
                hasGbpSelected
                  ? "bg-alloro-orange text-white border-alloro-orange hover:bg-alloro-orange/90"
                  : "bg-white border-slate-300 text-alloro-navy hover:border-alloro-orange/50 hover:bg-alloro-orange/5"
              }`}
            >
              {hasGbpSelected ? (
                <>
                  <Check className="w-4 h-4" />
                  {selectedGbpLocations.length} location{selectedGbpLocations.length !== 1 ? "s" : ""} selected
                </>
              ) : (
                <>
                  <MapPin className="w-4 h-4" />
                  Select GBP Locations
                </>
              )}
            </button>

            {/* Inline GBP Selector — flows in document so card expands naturally */}
            {gbpModalOpen && (
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <span className="text-sm font-semibold text-alloro-navy">Select GBP Locations</span>
                  <button
                    type="button"
                    onClick={() => {
                      setGbpModalOpen(false);
                      setGbpError(null);
                    }}
                    className="text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Content */}
                <div className="max-h-56 overflow-y-auto">
                  {gbpLoading ? (
                    <div className="flex items-center justify-center gap-2 py-8">
                      <Loader2 className="w-5 h-5 text-alloro-orange animate-spin" />
                      <span className="text-sm text-slate-500">Loading locations...</span>
                    </div>
                  ) : gbpError ? (
                    <div className="px-4 py-6 text-center">
                      <p className="text-sm text-red-600 mb-2">{gbpError}</p>
                      <button
                        type="button"
                        onClick={handleOpenGbpModal}
                        className="text-sm text-alloro-orange hover:underline font-medium"
                      >
                        Try again
                      </button>
                    </div>
                  ) : gbpLocations.length === 0 ? (
                    <div className="px-4 py-6 text-center">
                      <p className="text-sm text-slate-500">No GBP locations found for your account.</p>
                      <p className="text-xs text-slate-400 mt-1">You can set this up later in Settings.</p>
                    </div>
                  ) : (
                    gbpLocations.map((loc) => {
                      const isSelected = gbpSelectedIds.has(loc.id);
                      return (
                        <button
                          key={loc.id}
                          type="button"
                          onClick={() => toggleGbpLocation(loc.id)}
                          disabled={gbpSaving}
                          className={`w-full px-4 py-3 text-left flex items-center gap-3 transition-colors border-b border-slate-50 last:border-b-0 ${
                            isSelected
                              ? "bg-alloro-orange/5"
                              : "hover:bg-slate-50"
                          } ${gbpSaving ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                          <div
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                              isSelected
                                ? "bg-alloro-orange border-alloro-orange"
                                : "border-slate-300"
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-alloro-navy truncate">{loc.name}</p>
                            {loc.address && (
                              <p className="text-xs text-slate-400 truncate">{loc.address}</p>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                {/* Footer */}
                {!gbpLoading && !gbpError && gbpLocations.length > 0 && (
                  <div className="px-4 py-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={handleGbpConfirm}
                      disabled={gbpSaving || gbpSelectedIds.size === 0}
                      className={`w-full px-4 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                        gbpSelectedIds.size > 0 && !gbpSaving
                          ? "bg-alloro-orange text-white hover:bg-alloro-orange/90"
                          : "bg-slate-100 text-slate-400 cursor-not-allowed"
                      }`}
                    >
                      {gbpSaving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          Confirm {gbpSelectedIds.size > 0 ? `(${gbpSelectedIds.size})` : ""}
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {hasGbpSelected && (
              <p className="text-xs text-slate-500 text-center">
                {selectedGbpLocations.map((l) => l.displayName).join(", ")}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4">
        <button
          onClick={onBack}
          disabled={isCompleting}
          className="px-5 py-3 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-alloro-orange/30 transition-all font-medium flex items-center gap-2"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={onNext}
          disabled={isCompleting}
          className={`
            flex-1 px-6 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2
            ${
              !isCompleting
                ? "bg-gradient-to-r from-alloro-orange to-[#c45a47] text-white hover:shadow-lg hover:shadow-alloro-orange/30 hover:-translate-y-0.5"
                : "bg-slate-100 text-slate-400 cursor-not-allowed"
            }
          `}
        >
          {isCompleting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Finishing...
            </>
          ) : (
            "Continue"
          )}
        </button>
      </div>

      {/* Skip option */}
      {!hasGoogleConnection && !isCompleting && (
        <div className="text-center">
          <button
            onClick={onNext}
            className="text-sm text-alloro-orange hover:text-alloro-orange/80 transition-colors"
          >
            Skip for now — I'll connect later
          </button>
        </div>
      )}
    </div>
  );
};
