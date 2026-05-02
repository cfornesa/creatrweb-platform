import { Router, type IRouter, type Request, type Response } from "express";
import { db, siteSettingsTable, siteSettingsDefaults, eq } from "@workspace/db";
import { requireAuth, requireOwner } from "../middlewares/auth";
import { UpdateSiteSettingsBody } from "@workspace/api-zod";

const router: IRouter = Router();

async function loadOrSeedSettings() {
  // Race-safe: single MySQL `INSERT IGNORE` then SELECT. Two concurrent first-hits
  // cannot duplicate-key here — the second one is silently ignored.
  await db
    .insert(siteSettingsTable)
    .ignore()
    .values({ id: 1, ...siteSettingsDefaults });

  const rows = await db
    .select()
    .from(siteSettingsTable)
    .where(eq(siteSettingsTable.id, 1))
    .limit(1);
  return rows[0]!;
}

function serialize(row: Awaited<ReturnType<typeof loadOrSeedSettings>>) {
  const { id: _id, updatedAt: _updatedAt, ...rest } = row;
  return rest;
}

router.get("/site-settings", async (_req: Request, res: Response) => {
  try {
    const row = await loadOrSeedSettings();
    return res.json(serialize(row));
  } catch (err) {
    console.error("Failed to fetch site settings:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.patch(
  "/site-settings",
  requireAuth,
  requireOwner,
  async (req: Request, res: Response) => {
    try {
      const parsed = UpdateSiteSettingsBody.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid request body", details: parsed.error.format() });
      }

      await loadOrSeedSettings();

      const updates = Object.fromEntries(
        Object.entries(parsed.data).filter(([, v]) => v !== undefined),
      );

      if (Object.keys(updates).length > 0) {
        await db
          .update(siteSettingsTable)
          .set({ ...updates, updatedAt: new Date().toISOString() })
          .where(eq(siteSettingsTable.id, 1));
      }

      const row = await loadOrSeedSettings();
      return res.json(serialize(row));
    } catch (err) {
      console.error("Failed to update site settings:", err);
      return res.status(500).json({ error: "Server error" });
    }
  },
);

export default router;
