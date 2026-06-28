export interface MarketGeo {
  city: string | null;
  state: string | null;
}

function cleanLocationPart(value: string | undefined): string | null {
  const cleaned = value?.trim();
  if (!cleaned || cleaned.toLowerCase() === "unknown") return null;
  return cleaned;
}

function parseMarketLocation(value: string | null | undefined): MarketGeo {
  if (!value) return { city: null, state: null };
  const parts = value.split(",").map((part) => part.trim());
  return {
    city: cleanLocationPart(parts[0]),
    state: cleanLocationPart(parts[1]),
  };
}

export function resolveMarketGeo(
  searchCity: string | null,
  searchState: string | null,
  marketLocation: string | null,
): MarketGeo {
  const parsed = parseMarketLocation(marketLocation);
  return {
    city: cleanLocationPart(searchCity ?? undefined) ?? parsed.city,
    state: cleanLocationPart(searchState ?? undefined) ?? parsed.state,
  };
}
