import dotenv from "dotenv";
dotenv.config();

import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  sendDefaultPii: true,
});

import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import path from "path";

import { Router } from "express";

import googleAuthRoutes from "./routes/googleauth";
import gbpRoutes from "./routes/gbp";
import gbpAutomationRoutes from "./routes/gbpAutomation";
import {
  testConnection,
  healthCheck,
  closeConnection,
} from "./database/connection";
import clarityRoutes from "./routes/clarity";
import taskRoutes from "./routes/tasks";
import authRoutes from "./routes/auth";
import otpRoutes from "./routes/auth-otp";
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
import adminMissionControlRoutes from "./routes/admin/missionControl";
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
import {
  isAllowedCustomDomain,
  startCustomDomainCacheRefresh,
} from "./middleware/corsCustomDomains";
import { cleanupZombieJobs } from "./utils/startup/zombieJobCleanup";

const app = express();
const port = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === "production";
const router = Router();

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
app.use("/api/billing/webhook", express.raw({ type: "application/json" }));

// Add JSON body parser middleware with increased limit for large PMS data
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Database health check endpoint
app.get("/api/health/db", async (req, res) => {
  const health = await healthCheck();
  res.status(health.status === "healthy" ? 200 : 500).json(health);
});

// Sentry test endpoint — throws an error to verify Sentry is capturing
app.get("/api/sentry-test", () => {
  throw new Error("Sentry backend test error!");
});

// Billing gate — blocks locked-out orgs from protected routes (self-sufficient JWT parsing)
app.use(billingGateMiddleware);

app.use(router);
app.use("/api/gbp", gbpRoutes);
app.use("/api/gbp-automation", gbpAutomationRoutes);
app.use("/api/clarity", clarityRoutes);
app.use("/api/tasks", taskRoutes);
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
app.use("/api/admin/mission-control", adminMissionControlRoutes);
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
app.use("/api/user/website", userWebsiteRoutes); // User website management (DFY tier)
app.use("/api/locations", locationRoutes); // Location management for multi-location orgs
app.use("/api/admin/minds", mindsRoutes); // Minds MVP — AI chatbot profiles with knowledge sync
app.use("/api/minds", mindsPublicApiRoutes); // Public skill/portal API
app.use("/api/skills", skillsPublicApiRoutes); // Public skill portal API
app.use("/api/internal", internalApiRoutes); // Internal API for n8n workers
app.use("/api/billing", billingRoutes); // Stripe billing & subscription management
app.use("/api/telemetry", appTelemetryRoutes); // Authenticated first-party app usage telemetry

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

// Initialize database connection and start server
const startServer = async () => {
  try {
    // Test database connection on startup
    await testConnection();

    // Reset any jobs left in "processing" from a prior crash/restart
    await cleanupZombieJobs();

    // Start custom domain CORS cache (refreshes every 5 min)
    startCustomDomainCacheRefresh();

    app.listen(port, () => {
      console.log(
        `🚀 Server running in ${
          isProd ? "production" : "development"
        } mode at http://localhost:${port}`,
      );
      console.log(
        `📊 Database health check: http://localhost:${port}/api/health/db`,
      );
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down server...");
  await closeConnection();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n🛑 Shutting down server...");
  await closeConnection();
  process.exit(0);
});

startServer();
