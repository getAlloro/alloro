import React, { useState, useEffect, type ReactNode } from "react";
import gbp from "../api/gbp";
import type {
  GBPData,
  GBPContextType,
  GBPAccount,
  GBPLocation,
  GBPAIReadyData,
} from "../hooks/useGBP";
import { GBPContext } from "./GBPContext";
import { useLocationContext } from "./locationContext";
import { logger } from "../lib/logger";
import { getErrorMessage } from "../lib/errorMessage";

interface GBPProviderProps {
  children: ReactNode;
}

export const GBPProvider: React.FC<GBPProviderProps> = ({ children }) => {
  const [gbpData, setGBPData] = useState<GBPData>({
    newReviews: { prevMonth: 0, currMonth: 0 },
    avgRating: { prevMonth: 0, currMonth: 0 },
    callClicks: { prevMonth: 0, currMonth: 0 },
    trendScore: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI Data State
  const [aiDataLoading, setAiDataLoading] = useState(false);
  const [aiData, setAiData] = useState<GBPAIReadyData | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Accounts state
  const [accounts, setAccounts] = useState<GBPAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  // Locations state
  const [locations, setLocations] = useState<GBPLocation[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsError, setLocationsError] = useState<string | null>(null);

  // Derive GBP credentials from the selected location's google properties
  const { selectedLocation } = useLocationContext();

  const fetchAIReadyData = async (
    accountId: string,
    locationId: string,
    startDate?: string,
    endDate?: string
  ) => {
    try {
      setAiDataLoading(true);
      setAiError(null);
      const result = await gbp.getAIReadyData(
        accountId,
        locationId,
        startDate,
        endDate
      );

      setAiData(result);
      logger.log("GBP AI Ready Data:", result);
    } catch (error) {
      setAiError(getErrorMessage(error) || "Failed to fetch GBP AI-ready data");
      logger.error("GBP AI Ready Data fetch error:", error);
    } finally {
      setAiDataLoading(false);
    }
  };

  const fetchGBPData = async (accountId: string, locationId: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await gbp.getKeyData(accountId, locationId);

      setGBPData({
        newReviews: result.newReviews || { prevMonth: 0, currMonth: 0 },
        avgRating: result.avgRating || { prevMonth: 0, currMonth: 0 },
        callClicks: result.callClicks || { prevMonth: 0, currMonth: 0 },
        trendScore: result.trendScore || 0,
      });
    } catch (error) {
      setError(getErrorMessage(error) || "Failed to fetch GBP data");
      logger.error("GBP Data fetch error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAccounts = async () => {
    try {
      setAccountsLoading(true);
      setAccountsError(null);
      const result = await gbp.getAccounts();

      setAccounts(result);
    } catch (error) {
      setAccountsError(
        getErrorMessage(error) || "Failed to fetch GBP accounts"
      );
      logger.error("GBP Accounts fetch error:", error);
    } finally {
      setAccountsLoading(false);
    }
  };

  const fetchLocations = async (accountName?: string) => {
    try {
      setLocationsLoading(true);
      setLocationsError(null);
      const result = await gbp.getLocations(accountName);

      setLocations(result);
    } catch (error) {
      setLocationsError(
        getErrorMessage(error) || "Failed to fetch GBP locations"
      );
      logger.error("GBP Locations fetch error:", error);
    } finally {
      setLocationsLoading(false);
    }
  };

  // Auto-fetch GBP data when selected location changes
  useEffect(() => {
    const gbpProp = selectedLocation?.googleProperties?.find(
      (p) => p.type === "gbp"
    );
    if (gbpProp?.account_id && gbpProp?.external_id) {
      fetchGBPData(gbpProp.account_id, gbpProp.external_id);
    }
  }, [selectedLocation]);

  const contextValue: GBPContextType = {
    gbpData,
    isLoading,
    error,
    aiDataLoading,
    aiData,
    aiError,
    accounts,
    accountsLoading,
    accountsError,
    locations,
    locationsLoading,
    locationsError,
    fetchGBPData,
    fetchAIReadyData,
    fetchAccounts,
    fetchLocations,
  };

  return (
    <GBPContext.Provider value={contextValue}>{children}</GBPContext.Provider>
  );
};
