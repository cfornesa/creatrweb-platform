import { drizzle } from "drizzle-orm/mysql2";
import mysql, { type PoolOptions } from "mysql2/promise";
import * as schema from "./schema";

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required database environment variable: ${name}`);
  }
  return value;
}

function getDatabasePort(): number {
  const rawPort = process.env.DB_PORT?.trim() || "3306";
  const port = Number(rawPort);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid DB_PORT value: "${rawPort}"`);
  }

  return port;
}

export function getMysqlConnectionOptions(): PoolOptions {
  const useSsl = process.env.DB_SSL?.trim().toLowerCase() === "true";

  return {
    host: getRequiredEnv("DB_HOST"),
    port: getDatabasePort(),
    database: getRequiredEnv("DB_NAME"),
    user: getRequiredEnv("DB_USER"),
    password: getRequiredEnv("DB_PASS"),
    charset: "utf8mb4",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: "Z",
    ssl: useSsl ? {} : undefined,
  };
}

export const mysqlPool = mysql.createPool(getMysqlConnectionOptions());
export const db = drizzle(mysqlPool, { schema, mode: "default" });

export * from "./schema";
export { eq, desc, asc, and, or, count, sql, like, ne, gt, lt, gte, lte, isNull, isNotNull, inArray, notInArray } from "drizzle-orm";
export { ensureTables } from "./migrate";
