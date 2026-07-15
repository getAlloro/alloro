/**
 * Express App Factory
 *
 * Builds and exports the fully-configured Express `app` — every middleware and
 * router mount, in the exact order the runtime requires — WITHOUT binding a port
 * or starting the database/worker bootstrap. This is the importable surface for
 * Supertest (`request(app)`): tests mount the real app, with the real
 * middleware stack (including the default-deny auth guard), and never open a
 * socket.
 *
 * The thin entry point `src/index.ts` imports this `app`, runs the DB-connection
 * bootstrap, and calls `app.listen(...)`. Nothing here listens, connects, or has
 * side effects at import beyond constructing the Express instance — keep it that
 * way so importing `app` in a test is cheap and hermetic.
 *
 * Middleware/mount order is load-bearing and mirrors the previous inline
 * construction in index.ts (CORS → raw billing webhook → JSON parsers → health
 * → billing gate → default-deny auth guard → routers → Sentry error handler →
 * static/proxy). Do not reorder.
 */

import * as Sentry from "@sentry/node";
import express, { Router, raw as expressRaw } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { pinoHttp } from "pino-http";
import path from "path";

import logger from "./lib/logger";

import gbpRoutes from "./routes/gbp";
import gbpAutomationRoutes from "./routes/gbpAutomation";
import patientJourneyRoutes from "./routes/patient-journey";
import { getDatabaseHealth } from "./models/DatabaseHealthModel";
import clarityRoutes from "./routes/clarity";
import authRoutes from "./routes/auth";
import otpRoutes from "./routes/auth-otp";
import authSsoRoutes from "./routes/auth-sso";
import authPasswordRoutes from "./routes/auth-password";
import pmsRoutes from "./routes/pms";
import pmRoutes from "./routes/pm";
import dashboardRoutes from "./routes/dashboard";
import onboardingRoutes from "./routes/onboarding";
import ragRoutes from "./routes/rag";
import agentRoutes from "./routes/agentsV2";
import notificationsRoutes from "./routes/notifications";
import adminAgentInsightsRoutes from "./routes/adminAgentInsights";
import appLogsRoutes from "./routes/appLogs";
import settingsRoutes from "./routes/settings";
import profileRoutes from "./routes/profile";
import organizationsRoutes from "./routes/admin/organizations";
import adminAuthRoutes from "./routes/admin/auth";
import adminAgentOutputsRoutes from "./routes/admin/agentOutputs";
import adminWebsitesRoutes from "./routes/admin/websites";
import adminMediaRoutes from "./routes/admin/media";
import adminSettingsRoutes from "./routes/admin/settings";
import adminSchedulesRoutes from "./routes/admin/schedules";
import adminLeadgenRoutes from "./routes/admin/leadgenSubmissions";
import adminPmsPipelineRoutes from "./routes/admin/pmsPipeline";
import adminSupportRoutes from "./routes/admin/support";
import adminGbpAutomationRoutes from "./routes/admin/gbpAutomation";
import adminReceiptsReportRoutes from "./routes/admin/receiptsReport";
import adminMissionControlRoutes from "./routes/admin/missionControl";
import adminAiSeoAuditRoutes from "./routes/admin/aiSeoAudit";
import adminOsRoutes from "./routes/admin/os";
import adminEmailLogsRoutes from "./routes/admin/emailLogs";
import mailgunEventsRoutes from "./routes/webhooks/mailgunEvents";
import leadgenTrackingRoutes from "./routes/leadgenTracking";
import practiceRankingRoutes from "./routes/practiceRanking";
import supportRoutes from "./routes/support";
import scraperRoutes from "./routes/scraper";
import placesRoutes from "./routes/places";
import auditRoutes from "./routes/audit";
import importsRoutes from "./routes/imports";
import websiteContactRoutes from "./routes/websiteContact";
import userWebsiteRoutes from "./routes/user/website";
import locationRoutes from "./routes/locations";
import mindsRoutes from "./routes/minds";
import mindsPublicApiRoutes from "./routes/mindsPublicApi";
import skillsPublicApiRoutes from "./routes/skillsPublicApi";
import internalApiRoutes from "./routes/internalApi";
import billingRoutes from "./routes/billing";
import appTelemetryRoutes from "./routes/appTelemetry";
import { billingGateMiddleware } from "./middleware/billingGate";
import { requireAuthUnlessPublic } from "./middleware/publicRoutes";
import { isAllowedCustomDomain } from "./middleware/corsCustomDomains";

const app = express();
const isProd = process.env.NODE_ENV === "production";
const router = Router();

// Request logging — FIRST middleware, so every request (including ones that
// never reach a router) is logged with method/path/status/latency. Shares the
// single shared `logger` instance, so its `redact` config scrubs Authorization
// / Cookie headers and other secrets out of the auto-logged req/res. Disabled
// under test (VITEST) to keep the smoke-suite output clean and hermetic.
//
// In dev, every non-/api request is proxied to Vite (see the dev proxy at the
// bottom of this file), which serves the frontend one source module at a time —
// logging each one floods the console with hundreds of `/src/**.tsx` lines.
// So in dev we skip auto-logging those proxied requests and keep only `/api/*`.
// In prod the frontend is bundled and served statically (no per-module flood),
// so every request is logged as before. Same isProd switch the proxy uses.
if (process.env.VITEST !== "true") {
  app.use(
    pinoHttp(
      isProd
        ? { logger }
        : {
            logger,
            autoLogging: {
              ignore: (req) => !(req.url || "").startsWith("/api"),
            },
          },
    ),
  );
}

// CORS middleware for development
app.use((req, res, next) => {
  // Allow requests from localhost development servers
  const allowedOrigins = [
    "http://localhost:3003",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:5050",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:7777",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3002",
    "http://127.0.0.1:5050",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:7777",
    "https://audit.getalloro.com",
    "https://n8n.getalloro.com",
    "https://getalloro.com",
    "https://www.getalloro.com",
  ];

  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else if (
    origin &&
    /\.sites\.(getalloro\.com|localhost:7777)$/.test(origin)
  ) {
    // Allow rendered site subdomains (e.g. bright-dental.sites.getalloro.com)
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else if (origin && isAllowedCustomDomain(origin)) {
    // Allow verified custom domains (e.g. www.brightdental.com)
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS, PATCH",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, x-scraper-key, x-leadgen-key",
  );
  // Let cross-origin frontends read the sliding session refresh header
  res.setHeader("Access-Control-Expose-Headers", "x-session-refresh");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

// Stripe webhook needs raw body for signature verification — mount BEFORE JSON parser
app.use("/api/billing/webhook", expressRaw({ type: "application/json" }));

// Add JSON body parser middleware with increased limit for large PMS data
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Database health check endpoint
app.get("/api/health/db", async (req, res) => {
  const health = await getDatabaseHealth();
  res.status(health.status === "healthy" ? 200 : 500).json(health);
});

// Sentry test endpoint — throws an error to verify Sentry is capturing
app.get("/api/sentry-test", () => {
  throw new Error("Sentry backend test error!");
});

// Billing gate — blocks locked-out orgs from protected routes (self-sufficient JWT parsing)
app.use(billingGateMiddleware);

// Default-deny auth — every /api route requires a valid JWT unless it is on the
// explicit public allowlist in middleware/publicRoutes.ts. This is the app-level
// guard that closes the class of unauthenticated admin/destructive endpoints.
// Mounted AFTER the billing gate (so lockout still resolves first) and BEFORE
// the router mounts below. Non-/api assets (the SPA / Vite proxy) are served
// past the routers and are unaffected — this guard only 401s /api requests, and
// the static/proxy handlers below never see allowlist misses because every
// route under /api is itself either public-listed or genuinely protected.
app.use(requireAuthUnlessPublic);

app.use(router);
app.use("/api/gbp", gbpRoutes);
app.use("/api/gbp-automation", gbpAutomationRoutes);
app.use("/api/patient-journey", patientJourneyRoutes);
app.use("/api/clarity", clarityRoutes);
// Google SSO admin login (plans/07052026-google-sso-admin-and-user-login).
// MUST be mounted BEFORE /api/auth (authRoutes): the GBP router also defines a
// vestigial `/google/callback` (routes/auth.ts:17) that would otherwise swallow
// this login callback and exchange the code with the GBP client → unauthorized_client.
// GBP's live redirect is /api/auth/callback; its other /google/* routes fall through.
app.use("/api/auth/google", authSsoRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/auth/otp", otpRoutes);
app.use("/api/auth", authPasswordRoutes);
app.use("/api/pms", pmsRoutes);
app.use("/api/pm", pmRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/onboarding", onboardingRoutes);
app.use("/api/rag", ragRoutes);
app.use("/api/agents", agentRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/admin/agent-insights", adminAgentInsightsRoutes);
app.use("/api/admin/app-logs", appLogsRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/admin/organizations", organizationsRoutes);
app.use("/api/admin/agent-outputs", adminAgentOutputsRoutes);
app.use("/api/admin/websites", adminWebsitesRoutes);
app.use("/api/admin/websites/:projectId/media", adminMediaRoutes);
app.use("/api/admin/settings", adminSettingsRoutes);
app.use("/api/admin/schedules", adminSchedulesRoutes);
app.use("/api/admin/leadgen-submissions", adminLeadgenRoutes);
app.use("/api/admin/pms-jobs", adminPmsPipelineRoutes);
app.use("/api/admin/support", adminSupportRoutes);
app.use("/api/admin/gbp-automation", adminGbpAutomationRoutes);
app.use("/api/admin/receipts-report", adminReceiptsReportRoutes);
app.use("/api/admin/mission-control", adminMissionControlRoutes);
app.use("/api/admin/ai-seo-audit", adminAiSeoAuditRoutes);
app.use("/api/admin/os", adminOsRoutes); // OS knowledge base (super-admin, plans/07042026-alloro-os-admin-port)
app.use("/api/admin/email-logs", adminEmailLogsRoutes); // Email Logs dashboard (super-admin, plans/07062026-email-logs-dashboard)
app.use("/api/leadgen", leadgenTrackingRoutes);
app.use("/api/admin/practice-ranking", practiceRankingRoutes);
app.use("/api/practice-ranking", practiceRankingRoutes); // Client-facing endpoint for /latest
app.use("/api/admin", adminAuthRoutes);
app.use("/api/support", supportRoutes); // Help form / support inquiries
app.use("/api/scraper", scraperRoutes); // Website scraper for n8n webhooks
app.use("/api/places", placesRoutes); // Google Places API for GBP search
app.use("/api/audit", auditRoutes); // Audit process tracking for leadgen tool
app.use("/api/imports", importsRoutes); // Public file serving for self-hosted imports
app.use("/api/websites", websiteContactRoutes); // Public contact form for rendered sites
app.use("/api/webhooks/mailgun-events", mailgunEventsRoutes); // Signed Mailgun event webhook (delivery/open tracking)
app.use("/api/user/website", userWebsiteRoutes); // User website management (DFY tier)
app.use("/api/locations", locationRoutes); // Location management for multi-location orgs
app.use("/api/admin/minds", mindsRoutes); // Minds MVP — AI chatbot profiles with knowledge sync
app.use("/api/minds", mindsPublicApiRoutes); // Public skill/portal API
app.use("/api/skills", skillsPublicApiRoutes); // Public skill portal API
app.use("/api/internal", internalApiRoutes); // Internal API for n8n workers
app.use("/api/billing", billingRoutes); // Stripe billing & subscription management
app.use("/api/telemetry", appTelemetryRoutes); // Authenticated first-party app usage telemetry

// Any /api/* request that matched no route above returns a clean 404 — never fall
// through to the frontend catch-all below (which serves index.html in prod and, in
// dev, proxies to Vite which proxies /api back here → an Express↔Vite loop that hangs
// ~25s before 500ing). Standard { success, data, error } shape (§8.1).
app.use("/api", (_req, res) => {
  res.status(404).json({
    success: false,
    data: null,
    error: { code: "NOT_FOUND", message: "API route not found.", details: null },
  });
});

// Sentry error handler — must be after all routes and before other error handlers
Sentry.setupExpressErrorHandler(app);

if (isProd) {
  app.use(express.static(path.join(__dirname, "../public")));
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(__dirname, "../public/index.html"));
  });
} else {
  // ✅ FIXED — valid Express path, NOT a full URL
  app.use(
    "/", // or "*"
    createProxyMiddleware({
      target: "http://localhost:5174", // ✅ proxy target
      changeOrigin: true,
      ws: true,
    }),
  );
}

export default app;
export { app };
