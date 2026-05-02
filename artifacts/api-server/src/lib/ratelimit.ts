import type { Request, Response, NextFunction } from "express";

type RateLimitOptions = {
  windowMs: number;
  max: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

function getKey(req: Request): string {
  return `${req.ip ?? "unknown"}:${req.path}`;
}

export function createRateLimitMiddleware({ windowMs, max }: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = getKey(req);
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (current.count >= max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader("Retry-After", retryAfterSeconds.toString());
      return res.status(429).json({ error: "Too many requests" });
    }

    current.count += 1;
    buckets.set(key, current);
    return next();
  };
}
