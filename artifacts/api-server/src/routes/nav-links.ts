import { Router, type IRouter, type Request, type Response } from "express";
import { db, navLinksTable, eq, asc } from "@workspace/db";
import { CreateNavLinkBody, UpdateNavLinkBody } from "@workspace/api-zod";
import { requireAuth, requireOwner } from "../middlewares/auth";

const router: IRouter = Router();

type NavLinkRow = typeof navLinksTable.$inferSelect;

function serialize(row: NavLinkRow) {
  return {
    id: row.id,
    label: row.label,
    url: row.url,
    openInNewTab: Boolean(row.openInNewTab),
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const ALLOWED_URL_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

function isValidUrl(value: string): boolean {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length > 2048) return false;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  return ALLOWED_URL_PROTOCOLS.has(parsed.protocol);
}

router.get("/nav-links", async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(navLinksTable)
      .orderBy(asc(navLinksTable.sortOrder), asc(navLinksTable.id));
    return res.json({ links: rows.map(serialize) });
  } catch (err) {
    console.error("Failed to list nav links:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post(
  "/nav-links",
  requireAuth,
  requireOwner,
  async (req: Request, res: Response) => {
    try {
      const parsed = CreateNavLinkBody.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid request body", details: parsed.error.format() });
      }
      const label = parsed.data.label.trim();
      const url = parsed.data.url.trim();
      if (label.length === 0 || label.length > 64) {
        return res.status(400).json({ error: "label must be 1-64 characters" });
      }
      if (!isValidUrl(url)) {
        return res.status(400).json({ error: "url must be a valid URL" });
      }

      const insertResult = await db
        .insert(navLinksTable)
        .values({
          label,
          url,
          openInNewTab: parsed.data.openInNewTab ?? true,
          sortOrder: parsed.data.sortOrder ?? 0,
        })
        .$returningId();
      const id = insertResult[0]?.id;
      if (!id) {
        return res.status(500).json({ error: "Failed to create nav link" });
      }
      const rows = await db
        .select()
        .from(navLinksTable)
        .where(eq(navLinksTable.id, id))
        .limit(1);
      if (!rows[0]) {
        return res.status(500).json({ error: "Failed to load created nav link" });
      }
      return res.status(201).json(serialize(rows[0]));
    } catch (err) {
      console.error("Failed to create nav link:", err);
      return res.status(400).json({ error: "Invalid request" });
    }
  },
);

router.patch(
  "/nav-links/:id",
  requireAuth,
  requireOwner,
  async (req: Request, res: Response) => {
    try {
      const id = Number.parseInt(String(req.params.id || ""), 10);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(404).json({ error: "Not found" });
      }
      const parsed = UpdateNavLinkBody.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid request body", details: parsed.error.format() });
      }
      const rows = await db
        .select()
        .from(navLinksTable)
        .where(eq(navLinksTable.id, id))
        .limit(1);
      const row = rows[0];
      if (!row) return res.status(404).json({ error: "Not found" });

      const updates: Partial<{
        label: string;
        url: string;
        openInNewTab: boolean;
        sortOrder: number;
        updatedAt: string;
      }> = { updatedAt: new Date().toISOString() };

      if (typeof parsed.data.label === "string") {
        const trimmed = parsed.data.label.trim();
        if (trimmed.length === 0 || trimmed.length > 64) {
          return res.status(400).json({ error: "label must be 1-64 characters" });
        }
        updates.label = trimmed;
      }
      if (typeof parsed.data.url === "string") {
        const trimmed = parsed.data.url.trim();
        if (!isValidUrl(trimmed)) {
          return res.status(400).json({ error: "url must be a valid URL" });
        }
        updates.url = trimmed;
      }
      if (typeof parsed.data.openInNewTab === "boolean") {
        updates.openInNewTab = parsed.data.openInNewTab;
      }
      if (typeof parsed.data.sortOrder === "number") {
        updates.sortOrder = parsed.data.sortOrder;
      }

      await db.update(navLinksTable).set(updates).where(eq(navLinksTable.id, id));
      const reloaded = await db
        .select()
        .from(navLinksTable)
        .where(eq(navLinksTable.id, id))
        .limit(1);
      return res.json(serialize(reloaded[0]!));
    } catch (err) {
      console.error("Failed to update nav link:", err);
      return res.status(400).json({ error: "Invalid request" });
    }
  },
);

router.delete(
  "/nav-links/:id",
  requireAuth,
  requireOwner,
  async (req: Request, res: Response) => {
    try {
      const id = Number.parseInt(String(req.params.id || ""), 10);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(404).json({ error: "Not found" });
      }
      const rows = await db
        .select({ id: navLinksTable.id })
        .from(navLinksTable)
        .where(eq(navLinksTable.id, id))
        .limit(1);
      if (!rows[0]) return res.status(404).json({ error: "Not found" });
      await db.delete(navLinksTable).where(eq(navLinksTable.id, id));
      return res.status(204).send();
    } catch (err) {
      console.error("Failed to delete nav link:", err);
      return res.status(400).json({ error: "Invalid request" });
    }
  },
);

export default router;
