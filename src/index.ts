import dotenv from "dotenv";
dotenv.config();

import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  sendDefaultPii: true,
});

import app from "./app";
import { testConnection, closeConnection } from "./database/connection";
import { startCustomDomainCacheRefresh } from "./middleware/corsCustomDomains";
import { cleanupZombieJobs } from "./utils/startup/zombieJobCleanup";
import logger from "./lib/logger";

const port = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === "production";

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
      logger.info(
        `🚀 Server running in ${
          isProd ? "production" : "development"
        } mode at http://localhost:${port}`,
      );
      logger.info(
        `📊 Database health check: http://localhost:${port}/api/health/db`,
      );
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to start server:");
    process.exit(1);
  }
};

// Graceful shutdown
process.on("SIGINT", async () => {
  logger.info("\n🛑 Shutting down server...");
  await closeConnection();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("\n🛑 Shutting down server...");
  await closeConnection();
  process.exit(0);
});

startServer();
