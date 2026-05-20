import type { DocPage } from "../../types/docs";
import { LocalRankingsReplica } from "../../components/replicas/LocalRankingsReplica";

export const localRankingsPage: DocPage = {
  slug: "local-rankings",
  route: "/rankings",
  title: "Local Rankings",
  description:
    "The Local Rankings dashboard shows where your practice appears in local search results. Track your current rank, view rank history, switch keywords, and compare your position against local competitors.",
  category: "dashboard",
  replica: LocalRankingsReplica,
  hotspots: [
    {
      id: "rank-badge",
      x: 5,
      y: 18,
      width: 52,
      height: 28,
      label: "Google Maps Estimate",
      description: "Your sampled Google Maps position for 'orthodontist near me'. Shows your rank (#3), star rating, review count, and the improvement trend from #5.",
      step: 1,
    },
    {
      id: "health-score",
      x: 58,
      y: 18,
      width: 38,
      height: 28,
      label: "Practice Health Score",
      description: "Alloro's diagnostic score (0–100) for your local SEO fundamentals: review velocity, rating, profile completeness, NAP consistency, and sentiment.",
      step: 2,
    },
    {
      id: "competitors-table",
      x: 5,
      y: 50,
      width: 52,
      height: 24,
      label: "Competitors Table",
      description: "Top 5 results Google Maps shows for your tracked query. Your row is highlighted. Compare star ratings, review counts, and positions.",
      step: 3,
    },
    {
      id: "analysis-section",
      x: 58,
      y: 50,
      width: 38,
      height: 24,
      label: "Top Moves to Climb",
      description: "Highest-impact actions to improve local visibility, ordered by priority. Click any move to see why it matters and how to close the gap.",
      step: 4,
    },
  ],
  steps: [
    {
      number: 1,
      title: "Check your Google Maps rank",
      description: "The hero card shows your estimated Google Maps position for the tracked keyword. A rank of 1–3 means you're in the Google Local Pack — the top three results shown on the map.",
      hotspotId: "rank-badge",
    },
    {
      number: 2,
      title: "Review Practice Health",
      description: "The gauge scores your local SEO fundamentals on a 0–100 scale. The delta badge shows change since your last ranking run. Click 'See how I perform' to open a competitor comparison.",
      hotspotId: "health-score",
    },
    {
      number: 3,
      title: "Compare against competitors",
      description: "The competitors table shows the top Google Maps results for your keyword. Your practice is highlighted with a 'You' badge. Compare star ratings and review counts to identify gaps.",
      hotspotId: "competitors-table",
    },
    {
      number: 4,
      title: "Act on recommendations",
      description: "The 'Top moves to climb' section lists the highest-impact actions you can take, ordered by priority. Each card explains what to do and why it matters.",
      hotspotId: "analysis-section",
    },
  ],
  changelog: [
    {
      version: "0.0.82",
      date: "May 2026",
      summary: "Initial documentation baseline for the Local Rankings dashboard.",
    },
    {
      version: "0.0.78",
      date: "March 2026",
      summary: "Competitor map markers updated for improved clarity — pins now show practice names on hover.",
    },
  ],
};
