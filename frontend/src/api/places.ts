/**
 * Places API - Google Places autocomplete and details
 */

import { adminFetch } from "./index";

export interface PlaceSuggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
  description: string;
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  formattedAddress: string;
  city: string;
  state: string;
  displayString: string;
  practiceSearchString: string;
  domain: string;
  websiteUri: string | null;
  phone: string | null;
  rating: number | null;
  reviewCount: number;
  category: string;
  types: string[];
  location: { latitude: number; longitude: number } | null;
}

export interface AutocompleteResponse {
  success: boolean;
  suggestions: PlaceSuggestion[];
}

export interface PlaceDetailsResponse {
  success: boolean;
  place: PlaceDetails;
}

const API_BASE = "/api/places";

/**
 * Search for businesses using autocomplete
 */
export const searchPlaces = async (
  input: string,
  sessionToken?: string
): Promise<AutocompleteResponse> => {
  const response = await adminFetch(`${API_BASE}/autocomplete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input, sessionToken }),
  });

  if (!response.ok) {
    throw new Error(`Failed to search places: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Get detailed information for a specific place
 */
export const getPlaceDetails = async (
  placeId: string,
  sessionToken?: string
): Promise<PlaceDetailsResponse> => {
  const params = sessionToken
    ? `?sessionToken=${encodeURIComponent(sessionToken)}`
    : "";
  const response = await adminFetch(`${API_BASE}/${placeId}${params}`);

  if (!response.ok) {
    throw new Error(`Failed to get place details: ${response.statusText}`);
  }

  return response.json();
};
