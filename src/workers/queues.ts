import { Queue } from "bullmq";
import IORedis from "ioredis";
import logger from "../lib/logger";

const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379", 10);

let connection: IORedis | null = null;

export function getRedisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      maxRetriesPerRequest: null,
      retryStrategy: (times) => Math.min(times * 200, 5000),
      ...(process.env.REDIS_TLS === "true" && { tls: {} }),
    });
    connection.on("error", (err) =>
      logger.error({ err: err?.message }, "[QUEUES][redis] connection error:"),
    );
    connection.on("close", () =>
      logger.warn("[QUEUES][redis] connection closed"),
    );
    connection.on("reconnecting", () =>
      logger.warn("[QUEUES][redis] reconnecting..."),
    );
    connection.on("end", () =>
      logger.warn("[QUEUES][redis] connection ended"),
    );
  }
  return connection;
}

const queues: Record<string, Queue> = {};

export function getMindsQueue(name: string): Queue {
  const queueName = `minds-${name}`;
  if (!queues[queueName]) {
    queues[queueName] = new Queue(queueName, {
      connection: getRedisConnection(),
      prefix: '{minds}',
    });
  }
  return queues[queueName];
}

export function getAuditQueue(name: string): Queue {
  const queueName = `audit-${name}`;
  if (!queues[queueName]) {
    queues[queueName] = new Queue(queueName, {
      connection: getRedisConnection(),
      prefix: '{audit}',
    });
  }
  return queues[queueName];
}

/**
 * CRM queue helper. Returns a queue per platform so HubSpot, Salesforce, etc.
 * each get isolated rate-limit/retry behavior. v1: 'hubspot-push' only.
 *
 * Examples:
 *   getCrmQueue('hubspot-push')  // hot-path submission push
 *   getCrmQueue('mapping-validation')  // daily token + form validation
 */
export function getCrmQueue(name: string): Queue {
  const queueName = `crm-${name}`;
  if (!queues[queueName]) {
    queues[queueName] = new Queue(queueName, {
      connection: getRedisConnection(),
      prefix: '{crm}',
    });
  }
  return queues[queueName];
}

export function getHarvestQueue(name: string): Queue {
  const queueName = `harvest-${name}`;
  if (!queues[queueName]) {
    queues[queueName] = new Queue(queueName, {
      connection: getRedisConnection(),
      prefix: '{harvest}',
    });
  }
  return queues[queueName];
}

export function getGbpAutomationQueue(name: string): Queue {
  const queueName = `gbp-automation-${name}`;
  if (!queues[queueName]) {
    queues[queueName] = new Queue(queueName, {
      connection: getRedisConnection(),
      prefix: '{gbp}',
    });
  }
  return queues[queueName];
}

export async function closeQueues(): Promise<void> {
  for (const queue of Object.values(queues)) {
    await queue.close();
  }
  if (connection) {
    await connection.quit();
    connection = null;
  }
}
