import type { Knex } from "knex";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

// SSL on for remote (RDS) hosts, off for local Postgres which has no TLS.
// Override explicitly with DB_SSL=true|false.
function sslOption(): false | { rejectUnauthorized: boolean } {
  const raw = process.env.DB_SSL;
  if (raw !== undefined) {
    return raw === "true" || raw === "1" ? { rejectUnauthorized: false } : false;
  }
  const host = process.env.DB_HOST ?? "";
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "";
  return isLocal ? false : { rejectUnauthorized: false };
}

const config: { [key: string]: Knex.Config } = {
  production: {
    client: "pg",
    connection: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || "5432"),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: sslOption(),
    },
    migrations: {
      directory: "./src/database/migrations",
      extension: "ts",
    },
    seeds: {
      directory: "./src/database/seeds",
      extension: "ts",
    },
    pool: {
      min: 2,
      max: 50,
      acquireTimeoutMillis: 90000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200,
      propagateCreateError: false,
    },
    acquireConnectionTimeout: 90000,
    useNullAsDefault: true,
    log: {
      warn(message) {
        console.warn("[DB WARNING]", message);
      },
      error(message) {
        console.error("[DB ERROR]", message);
      },
      deprecate(message) {
        console.warn("[DB DEPRECATED]", message);
      },
      debug(message) {
        if (process.env.DB_DEBUG === "true") {
          console.log("[DB DEBUG]", message);
        }
      },
    },
  },
  development: {
    client: "pg",
    connection: {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || "5432"),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: sslOption(),
    },
    migrations: {
      directory: "./src/database/migrations",
      extension: "ts",
    },
    seeds: {
      directory: "./src/database/seeds",
      extension: "ts",
    },
    pool: {
      min: 2,
      max: 10, // Reduced from 100 to prevent connection exhaustion
      acquireTimeoutMillis: 60000, // Reduced from 90000
      createTimeoutMillis: 10000, // Reduced from 30000
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200,
      propagateCreateError: false,
    },
    acquireConnectionTimeout: 60000, // Reduced from 90000
    useNullAsDefault: true,
    log: {
      warn(message) {
        console.warn("[DB WARNING]", message);
      },
      error(message) {
        console.error("[DB ERROR]", message);
      },
      deprecate(message) {
        console.warn("[DB DEPRECATED]", message);
      },
      debug(message) {
        if (process.env.DB_DEBUG === "true") {
          console.log("[DB DEBUG]", message);
        }
      },
    },
  },
};

export default config;
