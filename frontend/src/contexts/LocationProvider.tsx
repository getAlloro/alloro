import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { LocationContext, type TransitionOrigin } from "./locationContext";
import { getLocations, type Location } from "../api/locations";
import { useAuth } from "../hooks/useAuth";
import { logger } from "../lib/logger";

interface LocationProviderProps {
  children: ReactNode;
}

const STORAGE_KEY = "selectedLocationId";

export function LocationProvider({ children }: LocationProviderProps) {
  const { userProfile, onboardingCompleted } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocationState] = useState<Location | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionOrigin, setTransitionOrigin] = useState<TransitionOrigin | null>(null);
  const [transitionLocationName, setTransitionLocationName] = useState<string | null>(null);

  // Content-ready signaling: pages call signalContentReady() after their data loads.
  // The transition overlay waits for both the minimum hold time AND content readiness.
  // If no page registers as loading (contentLoadingRef stays false), the overlay
  // dismisses at the 1200ms minimum as before — backward compatible.
  const contentReadyRef = useRef(false);
  const contentLoadingRef = useRef(false);
  const minTimeElapsedRef = useRef(false);

  const loadLocations = useCallback(async () => {
    try {
      setIsLoading(true);
      const locs = await getLocations();
      setLocations(locs);

      // Restore previously selected location from localStorage
      const savedId = localStorage.getItem(STORAGE_KEY);
      const saved = savedId ? locs.find((l) => l.id === Number(savedId)) : null;

      // Default to primary location, then first location
      const primary = locs.find((l) => l.is_primary);
      setSelectedLocationState(saved || primary || locs[0] || null);
    } catch (error) {
      logger.error("[LocationProvider] Failed to load locations:", error);
      setLocations([]);
      setSelectedLocationState(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userProfile?.organizationId && onboardingCompleted) {
      loadLocations();
    } else {
      setIsLoading(false);
    }
  }, [userProfile?.organizationId, onboardingCompleted, loadLocations]);

  const dismissTransition = useCallback(() => {
    setIsTransitioning(false);
    setTransitionOrigin(null);
    setTransitionLocationName(null);
    contentReadyRef.current = false;
    contentLoadingRef.current = false;
    minTimeElapsedRef.current = false;
  }, []);

  const tryDismiss = useCallback(() => {
    if (!minTimeElapsedRef.current) return;
    // If a page registered as loading, wait for it to signal ready
    if (contentLoadingRef.current && !contentReadyRef.current) return;
    dismissTransition();
  }, [dismissTransition]);

  const registerContentLoading = useCallback(() => {
    contentLoadingRef.current = true;
  }, []);

  const signalContentReady = useCallback(() => {
    contentReadyRef.current = true;
    tryDismiss();
  }, [tryDismiss]);

  function setSelectedLocation(location: Location, origin?: TransitionOrigin) {
    if (origin) {
      // Reset signals for new transition
      contentReadyRef.current = false;
      contentLoadingRef.current = false;
      minTimeElapsedRef.current = false;
      setTransitionOrigin(origin);
      setTransitionLocationName(location.name);
      setIsTransitioning(true);
      // Switch data after expand animation completes (400ms)
      // so the overlay fully covers the content first
      setTimeout(() => {
        setSelectedLocationState(location);
        localStorage.setItem(STORAGE_KEY, String(location.id));
      }, 400);
      // Minimum hold time (1200ms) — overlay won't dismiss before this
      setTimeout(() => {
        minTimeElapsedRef.current = true;
        tryDismiss();
      }, 1200);
      // Safety max timeout (4s) — dismiss regardless if content never signals
      setTimeout(() => {
        dismissTransition();
      }, 4000);
    } else {
      setSelectedLocationState(location);
      localStorage.setItem(STORAGE_KEY, String(location.id));
    }
  }

  const refreshLocations = useCallback(async () => {
    await loadLocations();
  }, [loadLocations]);

  return (
    <LocationContext.Provider
      value={{
        locations,
        selectedLocation,
        setSelectedLocation,
        isLoading,
        refreshLocations,
        isTransitioning,
        transitionOrigin,
        transitionLocationName,
        registerContentLoading,
        signalContentReady,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}
