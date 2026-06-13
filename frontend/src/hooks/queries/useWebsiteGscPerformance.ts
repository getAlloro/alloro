import { useQuery } from "@tanstack/react-query";
import {
  fetchWebsiteGscPerformance,
  type WebsiteGscPerformance,
} from "../../api/websiteGscPerformance";

/**
 * Owner-facing Search Console performance, shared by the Overview "Search
 * keywords" card and the Keywords tab. Keyed by range so switching the range
 * selector caches each window independently. Mirrors the inline `useQuery`
 * pattern used for `websiteAnalytics` in WebsiteOverview.
 */
export function useWebsiteGscPerformance(rangeDays = 90, enabled = true) {
  return useQuery<WebsiteGscPerformance>({
    queryKey: ["websiteGscPerformance", rangeDays],
    queryFn: () => fetchWebsiteGscPerformance(rangeDays),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
