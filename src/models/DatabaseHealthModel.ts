import db from "../database/connection";

export type DatabaseHealth = {
  status: "healthy" | "unhealthy";
  message: string;
  timestamp: Date;
};

export async function getDatabaseHealth(): Promise<DatabaseHealth> {
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
}
