import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { ExpressAuth } from "@auth/express";
import router from "./routes";
import feedsRouter from "./routes/feeds";
import { logger } from "./lib/logger";
import { authConfig } from "./auth/config";
import { hydrateAuth } from "./middlewares/auth";
import { createRateLimitMiddleware } from "./lib/ratelimit";
import { injectPostMetadata } from "./lib/meta-injection";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();
app.set("trust proxy", true);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:20925", "http://localhost:8080"];

app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
  }),
);

app.use(createRateLimitMiddleware({ windowMs: 60_000, max: 240 }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(feedsRouter);
app.use("/api/auth", ExpressAuth(authConfig));

app.use(hydrateAuth);
app.use("/api", router);

const staticPath = process.env.STATIC_FILES_PATH
  ? path.resolve(process.env.STATIC_FILES_PATH)
  : path.resolve(__dirname, "..", "..", "microblog", "dist", "public");

if (fs.existsSync(staticPath)) {
  const indexPath = path.join(staticPath, "index.html");
  
  // Specific handler for posts to inject social metadata
  app.get(["/posts/:id", "/embed/posts/:id"], async (req, res, next) => {
    const id = req.params.id as string;
    if (id && id !== "index.html") {
      const html = await injectPostMetadata(indexPath, id);
      if (html) {
        res.send(html);
        return;
      }
    }
    next();
  });

  app.use(express.static(staticPath));
  app.use((_req: Request, res: Response) => {
    res.sendFile(indexPath);
  });
} else {
  logger.warn(
    { staticPath },
    "Static files directory not found — frontend served separately (dev mode)",
  );
}

export default app;
