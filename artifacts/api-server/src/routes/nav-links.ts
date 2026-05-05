import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  navLinksTable,
  pagesTable,
  eq,
  asc,
  formatMysqlDateTime,
} from "@workspace/db";
import {
  CreateNavLinkBody,
  UpdateNavLinkBody,
  ReorderNavItemsBody,
} from "@workspace/api-zod";
import { requireAuth, requireOwner } from "../middlewares/auth";
import { loadCurrentUser } from "../lib/current-user";

const router: IRouter = Router();

type NavLinkRow = typeof navLinksTable.$inferSelect & {
  pageSlug?: string | null;
};

function serialize(row: NavLinkRow) {
  return {
    id: row.id,
    label: row.label,
    url: row.url,
    openInNewTab: Boolean(row.openInNewTab),
    sortOrder: row.sortOrder,
    kind: (row.kind ?? "external") as "external" | "page" | "system",
    pageId: row.pageId ?? null,
    pageSlug: row.pageSlug ?? null,
    visible: Boolean(row.visible),
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

async function listAllNavLinks(): Promise<NavLinkRow[]> {
  const rows = await db
    .select({
      id: navLinksTable.id,
      label: navLinksTable.label,
      url: navLinksTable.url,
      openInNewTab: navLinksTable.openInNewTab,
      sortOrder: navLinksTable.sortOrder,
      kind: navLinksTable.kind,
      pageId: navLinksTable.pageId,
      visible: navLinksTable.visible,
      createdAt: navLinksTable.createdAt,
      updatedAt: navLinksTable.updatedAt,
      pageSlug: pagesTable.slug,
    })
    .from(navLinksTable)
    .leftJoin(pagesTable, eq(pagesTable.id, navLinksTable.pageId))
    .orderBy(asc(navLinksTable.sortOrder), asc(navLinksTable.id));
  return rows as NavLinkRow[];
}

router.get("/nav-links", async (req: Request, res: Response) => {
  try {
    const rows = await listAllNavLinks();
    let includeHidden = false;
    if (String(req.query.includeHidden ?? "") === "1") {
      const { user } = await loadCurrentUser(req);
      if (user?.role === "owner") includeHidden = true;
    }
    const filtered = includeHidden ? rows : rows.filter((r) => r.visible !== false);
    return res.json({ links: filtered.map(serialize) });
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
          kind: "external",
          visible: true,
        })
        .$returningId();
      const id = insertResult[0]?.id;
      if (!id) {
        return res.status(500).json({ error: "Failed to create nav link" });
      }
      const all = await listAllNavLinks();
      const created = all.find((r) => r.id === id);
      if (!created) {
        return res.status(500).json({ error: "Failed to load created nav link" });
      }
      return res.status(201).json(serialize(created));
    } catch (err) {
      console.error("Failed to create nav link:", err);
      return res.status(400).json({ error: "Invalid request" });
    }
  },
);

router.patch(
  "/nav-items/reorder",
  requireAuth,
  requireOwner,
  async (req: Request, res: Response) => {
    try {
      const parsed = ReorderNavItemsBody.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid request body", details: parsed.error.format() });
      }
      const items = parsed.data.items;
      const allRows = await db
        .select({ id: navLinksTable.id })
        .from(navLinksTable);
      const allIds = new Set(allRows.map((r) => r.id));
      const submittedIds = new Set(
        items.map((i: { id: number; sortOrder: number }) => i.id),
      );
      const missing = [...allIds].filter((id) => !submittedIds.has(id));
      const unknown = [...submittedIds].filter((id) => !allIds.has(id));
      if (unknown.length > 0 || missing.length > 0) {
        return res.status(400).json({
          error:
            "Reorder must include every nav row exactly once (partial reorders are not supported)",
          ...(unknown.length > 0 ? { unknownIds: unknown } : {}),
          ...(missing.length > 0 ? { missingIds: missing } : {}),
        });
      }
      const ordered = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
      const now = formatMysqlDateTime();
      await db.transaction(async (tx) => {
        for (let i = 0; i < ordered.length; i += 1) {
          await tx
            .update(navLinksTable)
            .set({ sortOrder: (i + 1) * 10, updatedAt: now })
            .where(eq(navLinksTable.id, ordered[i]!.id));
        }
      });

      const links = await listAllNavLinks();
      return res.json({ links: links.map(serialize) });
    } catch (err) {
      console.error("Failed to reorder nav items:", err);
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
        visible: boolean;
        updatedAt: string;
      }> = { updatedAt: formatMysqlDateTime() };

      if (typeof parsed.data.label === "string") {
        const trimmed = parsed.data.label.trim();
        if (trimmed.length === 0 || trimmed.length > 64) {
          return res.status(400).json({ error: "label must be 1-64 characters" });
        }
        updates.label = trimmed;
      }
      if (typeof parsed.data.url === "string") {
        if (row.kind !== "external") {
          return res
            .status(400)
            .json({ error: "url is only editable on external nav links" });
        }
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
      if (typeof parsed.data.visible === "boolean") {
        updates.visible = parsed.data.visible;
      }

      await db.update(navLinksTable).set(updates).where(eq(navLinksTable.id, id));
      const all = await listAllNavLinks();
      const reloaded = all.find((r) => r.id === id);
      return res.json(serialize(reloaded!));
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
        .select()
        .from(navLinksTable)
        .where(eq(navLinksTable.id, id))
        .limit(1);
      const row = rows[0];
      if (!row) return res.status(404).json({ error: "Not found" });
      if (row.kind === "system") {
        return res
          .status(400)
          .json({ error: "system nav items cannot be deleted (hide via visible=false instead)" });
      }
      if (row.kind === "page") {
        return res
          .status(400)
          .json({ error: "page nav items are managed by the page itself — delete the page to remove the nav row" });
      }
      await db.delete(navLinksTable).where(eq(navLinksTable.id, id));
      return res.status(204).send();
    } catch (err) {
      console.error("Failed to delete nav link:", err);
      return res.status(400).json({ error: "Invalid request" });
    }
  },
);

export default router;
