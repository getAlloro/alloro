import React, { useState, useEffect } from "react";
import {
  X,
  ExternalLink,
  Database,
  TrendingUp,
  Users,
  Search,
  Star,
} from "lucide-react";
import { logger } from "../lib/logger";

interface BaseIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  onSuccess?: () => void;
  ready?: boolean;
  session?: unknown;
}

// Mock data for demo purposes
const mockLocations = [
  {
    id: "location-1",
    displayName: "Hamilton Wise Dental - Main Office",
    accountName: "Hamilton Wise Dental Practice",
  },
  {
    id: "location-2",
    displayName: "Hamilton Wise Dental - Downtown",
    accountName: "Hamilton Wise Dental Practice",
  },
];

const mockMTDComparison = {
  current: {
    startDate: "2024-01-01",
    endDate: "2024-01-27",
    description: "Jan 1 - Jan 27, 2024",
  },
  previous: {
    startDate: "2023-12-01",
    endDate: "2023-12-27",
    description: "Dec 1 - Dec 27, 2023",
  },
};

// Google Business Profile Integration Modal
export const GBPIntegrationModal: React.FC<BaseIntegrationModalProps> = ({
  isOpen,
  onClose,
  clientId,
  onSuccess,
}) => {
  // Mock state for demo purposes
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locations] = useState(mockLocations);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [step, setStep] = useState<
    "connect" | "select-location" | "fetch-data" | "success"
  >("connect");
  const [mtdComparison] = useState(mockMTDComparison);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setStep("connect");
      setError(null);
      setSelectedLocations([]);
    }
  }, [isOpen]);

  // Auto-advance to location selection when connected (demo)
  useEffect(() => {
    if (isConnected && locations.length > 0 && step === "connect") {
      setStep("select-location");
    }
  }, [isConnected, locations, step]);

  const handleConnect = async () => {
    logger.log("GBP Modal: Starting demo connection with clientId:", clientId);
    setIsLoading(true);
    setError(null);

    try {
      // Simulate API call delay
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Demo: randomly succeed or fail
      if (Math.random() > 0.2) {
        setIsConnected(true);
        logger.log("🏢 GBP Modal: Demo connection successful");
      } else {
        throw new Error("Demo connection failed. Please try again.");
      }
    } catch (err) {
      logger.error("🏢 GBP Modal: Connection failed", err);
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLocationSelect = () => {
    logger.log("🏢 GBP Modal: Location select clicked", { selectedLocations });
    if (selectedLocations.length > 0) {
      setStep("fetch-data");
    }
  };

  const handleFetchData = async () => {
    logger.log("🏢 GBP Modal: Fetch data clicked", { selectedLocations });
    if (selectedLocations.length === 0) return;

    setIsLoading(true);
    try {
      // Simulate data fetching
      await new Promise((resolve) => setTimeout(resolve, 3000));

      logger.log("🏢 GBP Modal: Demo data fetch completed successfully");
      setStep("success");
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 2000);
    } catch (err) {
      logger.error("🏢 GBP Modal: Data fetch failed", err);
      setError("Failed to fetch data. Please try again.");
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
            Connect Google Business Profile
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
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Star className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Connect Your Google Business Profile
                </h3>
                <p className="text-gray-600 mb-6">
                  Track your local search performance, reviews, and customer
                  interactions.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Users className="w-5 h-5 text-green-600" />
                  <span className="text-sm text-gray-700">
                    Monitor customer calls and visits
                  </span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Star className="w-5 h-5 text-yellow-600" />
                  <span className="text-sm text-gray-700">
                    Track reviews and ratings
                  </span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Search className="w-5 h-5 text-blue-600" />
                  <span className="text-sm text-gray-700">
                    Analyze local search visibility
                  </span>
                </div>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-800">
                  <strong>Demo Mode:</strong> This is a demonstration of the
                  Google Business Profile integration flow.
                </p>
              </div>

              <button
                onClick={handleConnect}
                disabled={isLoading}
                className="w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <ExternalLink className="w-5 h-5" />
                )}
                {isLoading ? "Connecting..." : "Connect with Google (Demo)"}
              </button>
            </div>
          )}

          {step === "select-location" && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Select GBP Location(s)
                </h3>
                <p className="text-gray-600">
                  Found {locations.length} location(s). You can select one
                  location or multiple locations.
                </p>
              </div>

              <div className="space-y-4">
                <label className="block text-sm font-medium text-gray-700">
                  Available Locations
                </label>

                <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3">
                  {locations.map((location) => (
                    <label
                      key={location.id}
                      className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedLocations.includes(location.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedLocations([
                              ...selectedLocations,
                              location.id,
                            ]);
                          } else {
                            setSelectedLocations(
                              selectedLocations.filter(
                                (id) => id !== location.id
                              )
                            );
                          }
                        }}
                        className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">
                          {location.displayName}
                        </div>
                        <div className="text-sm text-gray-500">
                          {location.accountName}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>

                {selectedLocations.length > 0 && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-800">
                      <strong>
                        {selectedLocations.length} location(s) selected:
                      </strong>
                      {selectedLocations.length === 1
                        ? " Data will be fetched for this location."
                        : " Data will be aggregated across all selected locations for unified reporting."}
                    </p>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      setSelectedLocations(locations.map((l) => l.id))
                    }
                    className="flex-1 px-3 py-2 text-sm text-green-600 border border-green-300 rounded-lg hover:bg-green-50 transition-colors"
                  >
                    Select All
                  </button>
                  <button
                    onClick={() => setSelectedLocations([])}
                    className="flex-1 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <button
                onClick={handleLocationSelect}
                disabled={selectedLocations.length === 0}
                className="w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {selectedLocations.length === 1
                  ? `Continue with ${
                      locations.find((l) => l.id === selectedLocations[0])
                        ?.displayName || "selected location"
                    }`
                  : `Continue with ${selectedLocations.length} locations`}
              </button>
            </div>
          )}

          {step === "fetch-data" && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Fetch Month-to-Date Data
                </h3>
                <p className="text-gray-600">
                  Fetching and aggregating Month-to-Date data from{" "}
                  {selectedLocations.length} location(s).
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">Date Range</h4>
                <div className="text-sm text-blue-800">
                  <p>
                    <strong>Current Period:</strong>{" "}
                    {mtdComparison.current.description}
                  </p>
                  <p>
                    <strong>Comparison Period:</strong>{" "}
                    {mtdComparison.previous.description}
                  </p>
                  <p>
                    <strong>Locations:</strong> {selectedLocations.length}{" "}
                    selected
                    {selectedLocations.length === 1
                      ? " (single location data)"
                      : " (aggregated data)"}
                  </p>
                  <p className="text-xs mt-2 text-blue-600">
                    {selectedLocations.length === 1
                      ? "Data will be fetched specifically for your selected location."
                      : "Data from all selected locations will be aggregated for unified reporting."}
                  </p>
                </div>
              </div>

              <button
                onClick={handleFetchData}
                disabled={isLoading}
                className="w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Database className="w-5 h-5" />
                )}
                {isLoading ? "Fetching Data..." : "Fetch Data"}
              </button>
            </div>
          )}

          {step === "success" && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <TrendingUp className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">
                GBP Connected Successfully!
              </h3>
              <p className="text-gray-600">
                Your Google Business Profile data from{" "}
                {selectedLocations.length === 1
                  ? "your selected location is"
                  : `${selectedLocations.length} locations are`}{" "}
                now being integrated into your dashboard.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
