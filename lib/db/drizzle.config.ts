import { defineConfig } from "drizzle-kit";
import path from "path";

const rawPort = process.env.DB_PORT?.trim() || "3306";
const port = Number(rawPort);

if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`Invalid DB_PORT value: "${rawPort}"`);
}

const useSsl = process.env.DB_SSL?.trim().toLowerCase() === "true";

export default defineConfig({
  schema: path.resolve(process.cwd(), "src", "schema", "index.ts"),
  dialect: "mysql",
  dbCredentials: {
    host: process.env.DB_HOST ?? "",
    port,
    user: process.env.DB_USER ?? "",
    password: process.env.DB_PASS ?? "",
    database: process.env.DB_NAME ?? "",
    ssl: useSsl ? {} : undefined,
  },
});
