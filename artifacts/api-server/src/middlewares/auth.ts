import type { NextFunction, Request, Response } from "express";
import { loadCurrentUser } from "../lib/current-user";

export async function hydrateAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const { session, user } = await loadCurrentUser(req);
    req.authSession = session;
    req.currentUser = user;
    next();
  } catch (error) {
    next(error);
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { session, user } = await loadCurrentUser(req);
    req.authSession = session;
    req.currentUser = user;

    if (!session?.user || !user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (user.status === "blocked") {
      res.status(403).json({ error: "Account blocked" });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
}

export function requireOwner(req: Request, res: Response, next: NextFunction): void {
  if (!req.currentUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (req.currentUser.role !== "owner") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  next();
}
