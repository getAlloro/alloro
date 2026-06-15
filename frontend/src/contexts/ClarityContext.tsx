import React, { useState, useEffect, type ReactNode } from "react";
import clarity from "../api/clarity";
import type {
  ClarityData,
  ClarityContextType,
  ClarityAIReadyData,
} from "../hooks/useClarity";
import { ClarityContext } from "./ClarityContext";
import { useLocationContext } from "./locationContext";
import { logger } from "../lib/logger";

interface ClarityProviderProps {
  children: ReactNode;
}

export const ClarityProvider: React.FC<ClarityProviderProps> = ({
  children,
}) => {
  const [clarityData, setClarityData] = useState<ClarityData>({
    sessions: { prevMonth: 0, currMonth: 0 },
    bounceRate: { prevMonth: 0, currMonth: 0 },
    deadClicks: { prevMonth: 0, currMonth: 0 },
    trendScore: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiDataLoading, setAiDataLoading] = useState(false);
  const [aiData, setAiData] = useState<ClarityAIReadyData | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Derive domain from selected location
  const { selectedLocation } = useLocationContext();
  const locationDomain = selectedLocation?.domain;

  const fetchAIReadyClarityData = async () => {
    if (!locationDomain) return;

    try {
      setAiDataLoading(true);
      setAiError(null);
      const result = await clarity.getAIReadyData(locationDomain);

      if (result.successful !== false) {
        setAiData(result as ClarityAIReadyData);
        logger.log("Clarity AI Ready Data:", result);
      } else {
        setAiError(
          result.errorMessage || "Failed to fetch Clarity AI-ready data"
        );
      }
    } catch (error) {
      setAiError("Failed to fetch AI-ready data");
      logger.error("Clarity AI Ready Data fetch error:", error);
    } finally {
      setAiDataLoading(false);
    }
  };

  const fetchClarityData = async () => {
    if (!locationDomain) return;

    try {
      setIsLoading(true);
      setError(null);
      const result = await clarity.getKeyData(locationDomain);

      if (result.successful !== false) {
        setClarityData({
          sessions: result.sessions || { prevMonth: 0, currMonth: 0 },
          bounceRate: result.bounceRate || { prevMonth: 0, currMonth: 0 },
          deadClicks: result.deadClicks || { prevMonth: 0, currMonth: 0 },
          trendScore: result.trendScore || 0,
        });
      } else {
        setError(result.errorMessage || "Failed to fetch Clarity data");
      }
    } catch (error) {
      setError("Failed to fetch Clarity data");
      logger.error("Clarity Data fetch error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-fetch Clarity data when selected location changes
  useEffect(() => {
    if (locationDomain) {
      fetchClarityData();
    }
  }, [locationDomain]);

  const contextValue: ClarityContextType = {
    clarityData,
    isLoading,
    error,
    aiDataLoading,
    aiData,
    aiError,
    fetchClarityData,
    fetchAIReadyClarityData,
  };

  return (
    <ClarityContext.Provider value={contextValue}>
      {children}
    </ClarityContext.Provider>
  );
};
