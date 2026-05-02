import app from "./app";
import { logger } from "./lib/logger";
import { ensureTables } from "@workspace/db";
import { ensureMediaRoot } from "./lib/media";

const rawPort = process.env["PORT"] ?? "8080";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

ensureTables()
  .then(() => {
    ensureMediaRoot();
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Failed to initialize database tables");
    process.exit(1);
  });
