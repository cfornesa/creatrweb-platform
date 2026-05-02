import { Router, type IRouter, type Request, type Response } from "express";
import { db, postsTable, usersTable, eq, count, and, ne } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { UpdateMeBody } from "@workspace/api-zod";

const router: IRouter = Router();

// GET /users/me
router.get("/users/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const currentUser = req.currentUser!;
    const name = currentUser.name || currentUser.email || "Anonymous";
    const imageUrl = currentUser.image || null;

    const postCountResult = await db
      .select({ count: count() })
      .from(postsTable)
      .where(eq(postsTable.authorId, currentUser.id));

    const postCount = postCountResult[0]?.count ?? 0;

    const parseSocialLinks = (val: any) => {
      if (!val) return null;
      if (typeof val === 'string') {
        try {
          return JSON.parse(val);
        } catch (e) {
          return null;
        }
      }
      return val;
    };

    return res.json({
      id: currentUser.id,
      name,
      username: currentUser.username || null,
      email: currentUser.email,
      imageUrl,
      bio: currentUser.bio || null,
      website: currentUser.website || null,
      socialLinks: parseSocialLinks(currentUser.socialLinks),
      role: currentUser.role,
      status: currentUser.status,
      postCount,
    });
  } catch (err) {
    return res.status(500).json({ error: "Server error" });
  }
});

// GET /users/:id
router.get("/users/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    
    // Check if ID is a UUID or a username
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    
    let user;
    if (isUuid) {
      const result = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, id))
        .limit(1);
      user = result[0];
    } else {
      // Try fetching by username
      const result = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.username, id))
        .limit(1);
      user = result[0];
    }

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const name = user.name || user.email || "Anonymous";
    const imageUrl = user.image || null;

    const postCountResult = await db
      .select({ count: count() })
      .from(postsTable)
      .where(eq(postsTable.authorId, user.id));

    const postCount = postCountResult[0]?.count ?? 0;

    const parseSocialLinks = (val: any) => {
      if (!val) return null;
      if (typeof val === 'string') {
        try {
          return JSON.parse(val);
        } catch (e) {
          return null;
        }
      }
      return val;
    };

    return res.json({
      id: user.id,
      name,
      username: user.username || null,
      imageUrl,
      bio: user.bio || null,
      website: user.website || null,
      socialLinks: parseSocialLinks(user.socialLinks),
      postCount,
    });
  } catch (err) {
    console.error("Failed to fetch user:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// PATCH /users/me
router.patch("/users/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const currentUser = req.currentUser!;
    const bodyResult = UpdateMeBody.safeParse(req.body);

    if (!bodyResult.success) {
      return res.status(400).json({ error: "Invalid request body", details: bodyResult.error.format() });
    }

    const { username, bio, website, socialLinks } = bodyResult.data;

    // Validate username uniqueness if it's being changed
    if (username && username !== currentUser.username) {
      const existingUser = await db
        .select()
        .from(usersTable)
        .where(and(eq(usersTable.username, username), ne(usersTable.id, currentUser.id)))
        .limit(1);

      if (existingUser.length > 0) {
        return res.status(400).json({ error: "Username is already taken" });
      }
    }

    await db
      .update(usersTable)
      .set({
        username: username ?? undefined,
        bio: bio ?? undefined,
        website: website ?? undefined,
        socialLinks: socialLinks ?? undefined,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(usersTable.id, currentUser.id));

    // Fetch updated user
    const updatedUserResult = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, currentUser.id))
      .limit(1);

    const updatedUser = updatedUserResult[0]!;
    const name = updatedUser.name || updatedUser.email || "Anonymous";
    const imageUrl = updatedUser.image || null;

    const postCountResult = await db
      .select({ count: count() })
      .from(postsTable)
      .where(eq(postsTable.authorId, updatedUser.id));

    const postCount = postCountResult[0]?.count ?? 0;

    const parseSocialLinks = (val: any) => {
      if (!val) return null;
      if (typeof val === 'string') {
        try {
          return JSON.parse(val);
        } catch (e) {
          return null;
        }
      }
      return val;
    };

    return res.json({
      id: updatedUser.id,
      name,
      username: updatedUser.username || null,
      imageUrl,
      bio: updatedUser.bio || null,
      website: updatedUser.website || null,
      socialLinks: parseSocialLinks(updatedUser.socialLinks),
      postCount,
    });
  } catch (err) {
    console.error("Failed to update profile:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
