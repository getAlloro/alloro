import knex from "knex";
import config from "./config";
import logger from "../lib/logger";

// Get the environment (default to development)
const environment = process.env.NODE_ENV || "development";

// Create and export the database connection
export const db = knex(config[environment]);

// Test connection function
export const testConnection = async (): Promise<boolean> => {
  try {
    await db.raw("SELECT 1");
    logger.info("✅ Database connection successful");
    return true;
  } catch (error) {
    logger.error({ err: error }, "❌ Database connection failed:");
    return false;
  }
};

// Graceful shutdown function
export const closeConnection = async (): Promise<void> => {
  try {
    await db.destroy();
    logger.info("🔌 Database connection closed");
  } catch (error) {
    logger.error({ err: error }, "Error closing database connection:");
  }
};

// Health check function
export const healthCheck = async (): Promise<{
  status: string;
  message: string;
  timestamp: Date;
}> => {
  try {
    await db.raw("SELECT 1");
    return {
      status: "healthy",
      message: "Database connection is active",
      timestamp: new Date(),
    };
  } catch (error) {
    return {
      status: "unhealthy",
      message: `Database connection failed: ${error}`,
      timestamp: new Date(),
    };
  }
};

export default db;
