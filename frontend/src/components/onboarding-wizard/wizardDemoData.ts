import type { SupportTicket, SupportTicketMessage } from "../../api/support";

/**
 * Demo/placeholder data for wizard mode.
 *
 * Each property is keyed so consuming components can cherry-pick via
 * `useWizardDemoData()?.someKey`. Shapes match what the real hooks return
 * so components can swap in demo data with minimal branching.
 */
export const WIZARD_DEMO_DATA = {
  // ───────────────────────── User Profile ─────────────────────────
  userProfile: {
    firstName: "Doctor",
    lastName: "Smith",
    practiceName: "Smith Orthodontics",
  },

  // ───────────────────────── Dashboard — Hero ─────────────────────────
  // Shape: ResolvedTopAction (from useTopAction)
  heroAction: {
    resultId: 1,
    createdAt: new Date().toISOString(),
    title: "Respond to 3 pending Google reviews",
    urgency: "high" as const,
    priority_score: 92,
    domain: "review" as const,
    rationale:
      "You have 3 unanswered reviews from the last 7 days. Prompt responses improve local ranking signals and show prospective patients you're engaged.",
    highlights: [
      "Review response rate dropped below 80%",
      "2 of 3 reviews mention wait times",
    ],
    supporting_metrics: [
      { label: "Pending reviews", value: "3", sub: "last 7 days", source_field: "reviews.pending" },
      { label: "Avg response time", value: "4.2 days", sub: "vs 1.5 day goal", source_field: "reviews.avg_response" },
      { label: "Review score", value: "4.8", sub: "127 total reviews", source_field: "reviews.rating" },
    ],
    outcome: {
      deliverables: "Respond to all 3 reviews (estimated 10 min)",
      mechanism:
        "Faster review responses correlate with a 15% increase in new patient inquiries for similar practices.",
    },
    cta: {
      primary: { label: "Open Reviews", action_url: "/dashboard" },
      secondary: { label: "View Local Rankings", action_url: "/rankings" },
    },
    domain_summaries: [
      {
        domain: "review" as const,
        heading: "Online Reputation",
        summary: "127 reviews · 4.8 average · 3 pending responses",
        detail:
          "Your overall rating is strong but response rate has dipped this week. Two recent reviews mention wait times — consider a templated reply addressing scheduling improvements.",
      },
      {
        domain: "ranking" as const,
        heading: "Local Visibility",
        summary: "Ranked #3 of 15 competitors",
        detail:
          "Your map pack ranking has been steady. Responding to reviews is one of the top signals that can push you from #3 to #2.",
      },
    ],
  },

  // ───────────────────────── Dashboard — Trajectory ─────────────────────────
  // Shape: ProoflineResult (from useAgentData -> agents.proofline.results)
  trajectoryData: {
    title: "Practice Trajectory",
    trajectory:
      "Your practice is showing <hl>strong momentum</hl> this month. New patient starts are up 12% and your local visibility continues to improve. Production is trending 15% above last month, driven by a surge in marketing-sourced referrals.",
    explanation: "Based on PMS data, GBP metrics, and ranking signals.",
    metric_signal: "production_up",
    value_change: 15.2,
    highlights: [
      "Google reviews up 23% this quarter",
      "Website form submissions increased by 18%",
      "Patient retention rate at 89%",
    ],
    dateEnd: new Date().toISOString(),
  },

  // ───────────────────────── Dashboard — Shared metrics ─────────────────────────
  // Partial DashboardMetrics consumed by Trajectory mini-stats, LocalRankingCard, PMSCard
  dashboardMetrics: {
    pms: {
      production_total: 156000,
      production_this_month: 156000,
      production_change_30d: 15.2,
      total_referrals: 47,
      total_referrals_this_month: 47,
      doctor_referrals: 14,
      doctor_referrals_this_month: 14,
      self_referrals: 33,
      distinct_months: 6,
    },
    ranking: {
      position: 3,
      total_competitors: 15,
      score: 78,
      lowest_factor: { name: "review_velocity", score: 62 },
    },
    reviews: {
      total: 127,
      average_rating: 4.8,
      this_month: 8,
      pending_responses: 3,
    },
    gbp: {
      call_clicks: 42,
      direction_clicks: 28,
      website_clicks: 65,
    },
    form_submissions: {
      total: 23,
      unread: 5,
      flagged: 2,
      verified: 16,
    },
    referral: {
      total_sources: 8,
      top_source: "Google Ads",
    },
  },

  // ───────────────────────── Dashboard — Website Card ─────────────────────────
  // Shape: FormSubmissionsStats + TimeseriesPoint[]
  websiteCardData: {
    stats: { unreadCount: 5, flaggedCount: 2, verifiedCount: 16 },
    timeseries: [
      { month: "2025-07", verified: 8, unread: 2, flagged: 1 },
      { month: "2025-08", verified: 10, unread: 3, flagged: 0 },
      { month: "2025-09", verified: 12, unread: 1, flagged: 2 },
      { month: "2025-10", verified: 9, unread: 4, flagged: 1 },
      { month: "2025-11", verified: 14, unread: 2, flagged: 1 },
      { month: "2025-12", verified: 11, unread: 3, flagged: 0 },
      { month: "2026-01", verified: 15, unread: 1, flagged: 2 },
      { month: "2026-02", verified: 13, unread: 2, flagged: 1 },
      { month: "2026-03", verified: 16, unread: 3, flagged: 0 },
      { month: "2026-04", verified: 14, unread: 2, flagged: 2 },
      { month: "2026-05", verified: 18, unread: 1, flagged: 1 },
      { month: "2026-06", verified: 16, unread: 5, flagged: 2 },
    ],
    // Shape: WebsiteAnalytics (from /user/website/analytics) — demo Rybbit data
    // so the overview Analytics card has a trend during the wizard tour.
    analytics: {
      hasIntegration: true,
      latestReportDate: "2026-05-30",
      dataDays: 14,
      totals: {
        sessions: 1840,
        pageviews: 5210,
        users: 1490,
        bounceRate: 0.42,
        pagesPerSession: 2.8,
        sessionDuration: 96,
      },
      daily: [
        { date: "2026-05-17", sessions: 110, pageviews: 300, users: 92 },
        { date: "2026-05-18", sessions: 128, pageviews: 352, users: 104 },
        { date: "2026-05-19", sessions: 142, pageviews: 401, users: 118 },
        { date: "2026-05-20", sessions: 121, pageviews: 338, users: 99 },
        { date: "2026-05-21", sessions: 155, pageviews: 442, users: 126 },
        { date: "2026-05-22", sessions: 168, pageviews: 470, users: 137 },
        { date: "2026-05-23", sessions: 133, pageviews: 366, users: 108 },
        { date: "2026-05-24", sessions: 119, pageviews: 321, users: 95 },
        { date: "2026-05-25", sessions: 147, pageviews: 418, users: 122 },
        { date: "2026-05-26", sessions: 162, pageviews: 455, users: 131 },
        { date: "2026-05-27", sessions: 175, pageviews: 489, users: 142 },
        { date: "2026-05-28", sessions: 158, pageviews: 431, users: 124 },
        { date: "2026-05-29", sessions: 171, pageviews: 478, users: 139 },
        { date: "2026-05-30", sessions: 181, pageviews: 498, users: 146 },
      ],
    },
  },

  // ───────────────────────── Dashboard — Local Ranking Card ─────────────────────────
  // Shape: RankingResultLite (from useLatestRanking + useDashboardMetrics)
  localRankingCardData: {
    rankScore: 78,
    rankPosition: 3,
    totalCompetitors: 15,
    specialty: "Orthodontics",
    location: "Springfield, IL",
    searchPosition: 4,
    searchStatus: "ok" as const,
    searchQuery: "orthodontist near me",
    searchCheckedAt: new Date().toISOString(),
    practiceHealth: 82,
    rankingFactors: {
      category_match: 0.95,
      keyword_name: 0.7,
      gbp_activity: 0.85,
      nap_consistency: 0.9,
      star_rating: { score: 0.96 },
      review_count: { score: 0.78 },
      review_velocity: { score: 0.55 },
      sentiment: { score: 0.88 },
    },
  },

  // ───────────────────────── Dashboard — PMS Card ─────────────────────────
  // Shape: PmsKeyData subset (months[] + sources[]) consumed by PMSCard
  pmsCardData: {
    months: [
      { month: "2026-01", selfReferrals: 12, doctorReferrals: 8, totalReferrals: 20, productionTotal: 24000 },
      { month: "2026-02", selfReferrals: 15, doctorReferrals: 10, totalReferrals: 25, productionTotal: 30000 },
      { month: "2026-03", selfReferrals: 18, doctorReferrals: 12, totalReferrals: 30, productionTotal: 36000 },
      { month: "2026-04", selfReferrals: 14, doctorReferrals: 11, totalReferrals: 25, productionTotal: 30000 },
      { month: "2026-05", selfReferrals: 20, doctorReferrals: 14, totalReferrals: 34, productionTotal: 40800 },
      { month: "2026-06", selfReferrals: 22, doctorReferrals: 13, totalReferrals: 35, productionTotal: 42000 },
    ],
    sources: [
      { rank: 1, name: "Google Ads", referrals: 38, production: 45600, percentage: 29.2 },
      { rank: 2, name: "Dr. Johnson (Pediatrics)", referrals: 22, production: 26400, percentage: 16.9 },
      { rank: 3, name: "Patient Referrals", referrals: 18, production: 21600, percentage: 13.8 },
      { rank: 4, name: "Dr. Williams (Family)", referrals: 15, production: 18000, percentage: 11.5 },
      { rank: 5, name: "Website Organic", referrals: 12, production: 14400, percentage: 9.2 },
    ],
  },

  // ───────────────────────── PMS Statistics — Monthly Data ─────────────────────────
  // Shape: PmsDashboardMonth[] (passed to PmsVitalsRow, PmsVelocityCard, etc.)
  pmsMonthlyData: [
    { month: "2026-01", selfReferrals: 12, doctorReferrals: 8, total: 20, totalReferrals: 20, productionTotal: 24000 },
    { month: "2026-02", selfReferrals: 15, doctorReferrals: 10, total: 25, totalReferrals: 25, productionTotal: 30000 },
    { month: "2026-03", selfReferrals: 18, doctorReferrals: 12, total: 30, totalReferrals: 30, productionTotal: 36000 },
    { month: "2026-04", selfReferrals: 14, doctorReferrals: 11, total: 25, totalReferrals: 25, productionTotal: 30000 },
    { month: "2026-05", selfReferrals: 20, doctorReferrals: 14, total: 34, totalReferrals: 34, productionTotal: 40800 },
    { month: "2026-06", selfReferrals: 22, doctorReferrals: 13, total: 35, totalReferrals: 35, productionTotal: 42000 },
  ],

  // ───────────────────────── PMS Statistics — Top Sources ─────────────────────────
  // Shape: PmsKeyDataSource[] (passed to PmsAttentionCards, PmsTopSourcesCard)
  pmsTopSources: [
    { rank: 1, name: "Google Ads", referrals: 38, production: 45600, percentage: 29.2 },
    { rank: 2, name: "Dr. Johnson (Pediatrics)", referrals: 22, production: 26400, percentage: 16.9 },
    { rank: 3, name: "Patient Referrals", referrals: 18, production: 21600, percentage: 13.8 },
    { rank: 4, name: "Dr. Williams (Family)", referrals: 15, production: 18000, percentage: 11.5 },
    { rank: 5, name: "Website Organic", referrals: 12, production: 14400, percentage: 9.2 },
    { rank: 6, name: "Insurance Referrals", referrals: 10, production: 12000, percentage: 7.7 },
    { rank: 7, name: "Social Media", referrals: 8, production: 9600, percentage: 6.2 },
    { rank: 8, name: "Walk-ins", referrals: 6, production: 7200, percentage: 4.6 },
  ],

  // ───────────────────────── PMS Statistics — Totals ─────────────────────────
  pmsTotals: { totalProduction: 156000, totalReferrals: 130 },

  // ───────────────────────── PMS Statistics — Legacy referral shape ─────────────────────────
  // Consumed by PMSVisualPillars wizard path (wizardDemoData.referralData.monthlyData)
  referralData: {
    monthlyData: [
      { month: "Jan", marketing: 12, doctor: 8 },
      { month: "Feb", marketing: 15, doctor: 10 },
      { month: "Mar", marketing: 18, doctor: 12 },
      { month: "Apr", marketing: 14, doctor: 11 },
      { month: "May", marketing: 20, doctor: 14 },
      { month: "Jun", marketing: 22, doctor: 13 },
    ],
    keyData: {
      mktProduction: 89000,
      docProduction: 67000,
      totalReferrals: 130,
    },
  },

  // ───────────────────────── Referral Engine ─────────────────────────
  // Shape: ReferralEngineData (passed to ReferralEngineDashboard)
  referralEngineData: {
    executive_summary: [
      "Marketing-sourced referrals (Google Ads, website, social) make up 58% of new starts and are growing 12% month-over-month.",
      "Doctor referrals contribute 42% of production but are concentrated in two providers — diversifying relationships is the top growth lever.",
      "Average production per referral ($1,200) is above the regional benchmark of $1,050, suggesting strong case acceptance.",
    ],
    doctor_referral_matrix: [
      { referrer_name: "Dr. Johnson (Pediatrics)", referred: 22, net_production: 26400, avg_production_per_referral: 1200, trend_label: "Steady", notes: "Longest-standing referral partner" },
      { referrer_name: "Dr. Williams (Family)", referred: 15, net_production: 18000, avg_production_per_referral: 1200, trend_label: "Growing", notes: "Increased from 2 to 4/month last quarter" },
      { referrer_name: "Dr. Park (Pediatric Dentistry)", referred: 8, net_production: 9600, avg_production_per_referral: 1200, trend_label: "New", notes: "Started referring 3 months ago" },
      { referrer_name: "Dr. Chen (General Dentistry)", referred: 5, net_production: 6000, avg_production_per_referral: 1200, trend_label: "Declining", notes: "Down from 8 last quarter" },
    ],
    non_doctor_referral_matrix: [
      { source_label: "Google Ads", source_key: "google_ads", source_type: "paid", referred: 38, net_production: 45600, avg_production_per_referral: 1200, trend_label: "Growing", notes: "Highest volume source" },
      { source_label: "Patient Referrals", source_key: "patient_referrals", source_type: "organic", referred: 18, net_production: 21600, avg_production_per_referral: 1200, trend_label: "Steady", notes: "Word-of-mouth remains strong" },
      { source_label: "Website Organic", source_key: "website_organic", source_type: "organic", referred: 12, net_production: 14400, avg_production_per_referral: 1200, trend_label: "Growing", notes: "SEO improvements paying off" },
      { source_label: "Insurance Referrals", source_key: "insurance", source_type: "other", referred: 10, net_production: 12000, avg_production_per_referral: 1200, trend_label: "Steady", notes: "In-network listings" },
      { source_label: "Social Media", source_key: "social_media", source_type: "paid", referred: 8, net_production: 9600, avg_production_per_referral: 1200, trend_label: "New", notes: "Instagram campaigns started 2 months ago" },
    ],
    growth_opportunity_summary: {
      top_three_fixes: [
        { title: "Re-engage Dr. Chen", description: "Schedule a lunch-and-learn to rebuild the referral relationship. Potential: +3/month." },
        { title: "Expand Google Ads budget", description: "Current ROAS is 4.2x. A 25% budget increase could yield 8-10 additional starts/month." },
        { title: "Launch patient referral program", description: "Formalize word-of-mouth with incentives. Similar practices see a 30% lift." },
      ],
      estimated_additional_annual_revenue: 150000,
    },
    observed_period: { start_date: "2026-01-01", end_date: "2026-06-30" },
    confidence: 0.87,
  },

  // ───────────────────────── Rankings ─────────────────────────
  // Shape consumed by RankingsDashboard via useWizardDemoData()?.rankingData
  rankingData: [
    {
      locationName: "Main Office",
      rank: 3,
      totalCompetitors: 15,
      visibilityScore: 78,
      patientMood: "High",
      reviews: 127,
      rating: 4.8,
    },
  ],

  // ───────────────────────── Patient Journey — GBP ─────────────────────────
  // Shape: GBPData (from useGBP)
  gbpDemoData: {
    newReviews: { prevMonth: 6, currMonth: 8 },
    avgRating: { prevMonth: 4.7, currMonth: 4.8 },
    callClicks: { prevMonth: 35, currMonth: 42 },
    trendScore: 72,
  },

  // ───────────────────────── Patient Journey — Clarity ─────────────────────────
  // Shape: ClarityData (from useClarity)
  clarityDemoData: {
    sessions: { prevMonth: 420, currMonth: 485 },
    bounceRate: { prevMonth: 0.38, currMonth: 0.32 },
    deadClicks: { prevMonth: 24, currMonth: 18 },
    trendScore: 65,
  },

  // ───────────────────────── Websites — Project ─────────────────────────
  // Shape: Project (from /user/website API)
  demoProject: {
    id: "demo-project-1",
    hostname: "smithortho.alloro.io",
    display_name: "Smith Orthodontics",
    status: "READY",
    is_read_only: false,
    custom_domain: null,
    domain_verified_at: null,
    wrapper: "<div id=\"site-wrapper\"></div>",
    header: "<header>Smith Orthodontics</header>",
    footer: "© 2026 Smith Orthodontics",
    template_id: "modern-dental",
    organization_id: 1,
    primary_color: "#2563eb",
    accent_color: "#7c3aed",
  },

  // ───────────────────────── Websites — Pages ─────────────────────────
  // Shape: Page[] (from /user/website API)
  demoPages: [
    { id: "demo-page-home", path: "/", status: "published", sections: {}, updated_at: new Date().toISOString() },
    { id: "demo-page-about", path: "/about", status: "published", sections: {}, updated_at: new Date(Date.now() - 3 * 86_400_000).toISOString() },
    { id: "demo-page-services", path: "/services", status: "published", sections: {}, updated_at: new Date(Date.now() - 7 * 86_400_000).toISOString() },
    { id: "demo-page-contact", path: "/contact", status: "published", sections: {}, updated_at: new Date(Date.now() - 5 * 86_400_000).toISOString() },
  ],

  // ───────────────────────── Websites — Form Submissions ─────────────────────────
  demoSubmissions: [
    { id: "sub-1", name: "Sarah M.", email: "sarah.m@email.com", phone: "(555) 123-4567", message: "I'd like to schedule a consultation for my daughter's braces.", source: "Contact Page", status: "verified", created_at: new Date(Date.now() - 1 * 86_400_000).toISOString() },
    { id: "sub-2", name: "James K.", email: "james.k@email.com", phone: "(555) 234-5678", message: "Do you offer Invisalign for adults? What's the typical timeline?", source: "Services Page", status: "unread", created_at: new Date(Date.now() - 2 * 86_400_000).toISOString() },
    { id: "sub-3", name: "Maria L.", email: "maria.l@email.com", phone: "(555) 345-6789", message: "Insurance question — do you accept Delta Dental PPO?", source: "Contact Page", status: "flagged", created_at: new Date(Date.now() - 3 * 86_400_000).toISOString() },
    { id: "sub-4", name: "Robert P.", email: "robert.p@email.com", phone: "(555) 456-7890", message: "Looking to transfer from another orthodontist. Can you do a records review?", source: "Contact Page", status: "verified", created_at: new Date(Date.now() - 5 * 86_400_000).toISOString() },
  ],

  // ───────────────────────── Support — Tickets ─────────────────────────
  // Shape: SupportTicket[] (from useSupportTickets)
  demoTickets: [
    {
      id: "demo-ticket-1",
      publicId: "TK-001",
      locationId: null,
      type: "feature_request" as const,
      status: "in_progress" as const,
      severity: "medium" as const,
      title: "Add automated review response templates",
      currentPageUrl: null,
      requestedCompletionDate: null,
      guidedAnswers: {},
      resolutionNotes: null,
      resolvedAt: null,
      latestMessageAt: new Date(Date.now() - 1 * 86_400_000).toISOString(),
      clientVisibleMessageCount: 3,
      createdAt: new Date(Date.now() - 7 * 86_400_000).toISOString(),
      updatedAt: new Date(Date.now() - 1 * 86_400_000).toISOString(),
    },
    {
      id: "demo-ticket-2",
      publicId: "TK-002",
      locationId: null,
      type: "bug_report" as const,
      status: "resolved" as const,
      severity: "low" as const,
      title: "Dashboard chart not loading on Safari",
      currentPageUrl: "/dashboard",
      requestedCompletionDate: null,
      guidedAnswers: {},
      resolutionNotes: "Fixed in latest release.",
      resolvedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      latestMessageAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      clientVisibleMessageCount: 4,
      createdAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    },
    {
      id: "demo-ticket-3",
      publicId: "TK-003",
      locationId: null,
      type: "website_edit" as const,
      status: "new" as const,
      severity: "low" as const,
      title: "Update office hours on website footer",
      currentPageUrl: "/dfy/website",
      requestedCompletionDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      guidedAnswers: {},
      resolutionNotes: null,
      resolvedAt: null,
      latestMessageAt: new Date(Date.now() - 4 * 86_400_000).toISOString(),
      clientVisibleMessageCount: 1,
      createdAt: new Date(Date.now() - 4 * 86_400_000).toISOString(),
      updatedAt: new Date(Date.now() - 4 * 86_400_000).toISOString(),
    },
  ] as SupportTicket[],

  // ───────────────────────── Support — Messages (keyed by ticket ID) ─────────────────────────
  // Shape: Record<string, SupportTicketMessage[]>
  demoMessages: {
    "demo-ticket-1": [
      {
        id: "msg-1a",
        ticketId: "demo-ticket-1",
        authorUserId: null,
        authorRole: "client" as const,
        visibility: "client_visible" as const,
        body: "It would be great to have pre-written templates for responding to Google reviews. We get similar questions often.",
        authorName: "Dr. Smith",
        createdAt: new Date(Date.now() - 7 * 86_400_000).toISOString(),
        updatedAt: new Date(Date.now() - 7 * 86_400_000).toISOString(),
      },
      {
        id: "msg-1b",
        ticketId: "demo-ticket-1",
        authorUserId: null,
        authorRole: "admin" as const,
        visibility: "client_visible" as const,
        body: "Great suggestion! We're working on an AI-powered review response feature. I'll keep you updated on the timeline.",
        authorName: "Alloro Support",
        createdAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
        updatedAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
      },
      {
        id: "msg-1c",
        ticketId: "demo-ticket-1",
        authorUserId: null,
        authorRole: "admin" as const,
        visibility: "client_visible" as const,
        body: "Quick update — the review response templates feature is now in development. Expected release in about 2 weeks.",
        authorName: "Alloro Support",
        createdAt: new Date(Date.now() - 1 * 86_400_000).toISOString(),
        updatedAt: new Date(Date.now() - 1 * 86_400_000).toISOString(),
      },
    ],
  } as Record<string, SupportTicketMessage[]>,

  // ───────────────────────── Settings — Team Members ─────────────────────────
  // Shape: User[] (from useSettingsUsers)
  demoUsers: [
    { id: 1, email: "dr.smith@smithortho.com", name: "Dr. Smith", role: "admin", joined_at: "2025-06-15T00:00:00.000Z" },
    { id: 2, email: "jessica@smithortho.com", name: "Jessica Torres", role: "manager", joined_at: "2025-08-01T00:00:00.000Z" },
    { id: 3, email: "mike@smithortho.com", name: "Mike Chen", role: "viewer", joined_at: "2026-01-10T00:00:00.000Z" },
  ],

  // ───────────────────────── Settings — Pending Invitations ─────────────────────────
  // Shape: Invitation[] (from useSettingsUsers)
  demoInvitations: [
    { id: 1, email: "newteam@smithortho.com", role: "manager", created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(), expires_at: new Date(Date.now() + 5 * 86_400_000).toISOString() },
  ],
};
