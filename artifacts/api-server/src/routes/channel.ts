import { Router } from "express";
import { db } from "@workspace/db";
import { channelPostsTable, siteSettingsTable } from "@workspace/db";
import { desc, eq, sql, inArray } from "drizzle-orm";
import { requireAdmin, requireUser } from "../middlewares/auth";

const CHANNEL_OWNER_PHONE = "09354505225";

const router = Router();

// GET /channel/posts — public
router.get("/channel/posts", async (req, res) => {
  const posts = await db
    .select()
    .from(channelPostsTable)
    .orderBy(desc(channelPostsTable.isPinned), channelPostsTable.createdAt);
  res.json(posts);
});

// POST /channel/posts/:id/view — public, increment view count
router.post("/channel/posts/:id/view", async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db
    .update(channelPostsTable)
    .set({ viewCount: sql`${channelPostsTable.viewCount} + 1` })
    .where(eq(channelPostsTable.id, id));
  res.json({ ok: true });
});

// Admin routes
// GET /admin/channel/posts
router.get("/admin/channel/posts", requireAdmin, async (_req, res) => {
  const posts = await db
    .select()
    .from(channelPostsTable)
    .orderBy(desc(channelPostsTable.createdAt));
  res.json(posts);
});

// POST /admin/channel/posts
router.post("/admin/channel/posts", requireAdmin, async (req, res) => {
  const { content, mediaUrl, mediaType, isPinned } = req.body;
  if (!content) { res.status(400).json({ error: "content required" }); return; }
  const [post] = await db
    .insert(channelPostsTable)
    .values({ content, mediaUrl: mediaUrl || null, mediaType: mediaType || null, isPinned: isPinned ?? false })
    .returning();
  res.status(201).json(post);
});

// PUT /admin/channel/posts/:id
router.put("/admin/channel/posts/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { content, mediaUrl, mediaType, isPinned } = req.body;
  const [post] = await db
    .update(channelPostsTable)
    .set({ content, mediaUrl: mediaUrl || null, mediaType: mediaType || null, isPinned: isPinned ?? false })
    .where(eq(channelPostsTable.id, id))
    .returning();
  if (!post) { res.status(404).json({ error: "Not found" }); return; }
  res.json(post);
});

// PATCH /admin/channel/posts/:id/pin
router.patch("/admin/channel/posts/:id/pin", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { isPinned } = req.body;
  const [post] = await db
    .update(channelPostsTable)
    .set({ isPinned: isPinned ?? true })
    .where(eq(channelPostsTable.id, id))
    .returning();
  if (!post) { res.status(404).json({ error: "Not found" }); return; }
  res.json(post);
});

// DELETE /admin/channel/posts/:id
router.delete("/admin/channel/posts/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(channelPostsTable).where(eq(channelPostsTable.id, id));
  res.json({ message: "deleted" });
});

// ─── OWNER routes (user JWT + phone check) ────────────────────────────────────
// mediaType values: "image" | "video" | "video_circle" | "voice"

router.post("/channel/owner/posts", requireUser, async (req, res) => {
  if (req.user!.phone !== CHANNEL_OWNER_PHONE) { res.status(403).json({ error: "دسترسی ندارید" }); return; }
  const { content, mediaUrl, mediaType, isPinned } = req.body as {
    content?: string; mediaUrl?: string; mediaType?: string; isPinned?: boolean;
  };
  const text = (content ?? "").trim();
  if (!text && !mediaUrl) { res.status(400).json({ error: "متن یا رسانه الزامی است" }); return; }
  const [post] = await db.insert(channelPostsTable).values({
    content: text,
    mediaUrl: mediaUrl || null,
    mediaType: mediaType || null,
    isPinned: isPinned ?? false,
  }).returning();
  res.status(201).json(post);
});

router.put("/channel/owner/posts/:id", requireUser, async (req, res) => {
  if (req.user!.phone !== CHANNEL_OWNER_PHONE) { res.status(403).json({ error: "دسترسی ندارید" }); return; }
  const id = parseInt(req.params["id"] as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { content, mediaUrl, mediaType, isPinned } = req.body as {
    content?: string; mediaUrl?: string; mediaType?: string; isPinned?: boolean;
  };
  const updates: Partial<typeof channelPostsTable.$inferInsert> = {};
  if (content !== undefined) updates.content = content;
  if (mediaUrl !== undefined) updates.mediaUrl = mediaUrl || null;
  if (mediaType !== undefined) updates.mediaType = mediaType || null;
  if (isPinned !== undefined) updates.isPinned = isPinned;
  const [post] = await db.update(channelPostsTable).set(updates)
    .where(eq(channelPostsTable.id, id)).returning();
  if (!post) { res.status(404).json({ error: "یافت نشد" }); return; }
  res.json(post);
});

router.delete("/channel/owner/posts/:id", requireUser, async (req, res) => {
  if (req.user!.phone !== CHANNEL_OWNER_PHONE) { res.status(403).json({ error: "دسترسی ندارید" }); return; }
  const id = parseInt(req.params["id"] as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(channelPostsTable).where(eq(channelPostsTable.id, id));
  res.json({ ok: true });
});

router.patch("/channel/owner/posts/:id/pin", requireUser, async (req, res) => {
  if (req.user!.phone !== CHANNEL_OWNER_PHONE) { res.status(403).json({ error: "دسترسی ندارید" }); return; }
  const id = parseInt(req.params["id"] as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { isPinned } = req.body as { isPinned?: boolean };
  const [post] = await db.update(channelPostsTable)
    .set({ isPinned: isPinned ?? true })
    .where(eq(channelPostsTable.id, id)).returning();
  if (!post) { res.status(404).json({ error: "یافت نشد" }); return; }
  res.json(post);
});


// ─── Channel Profile Settings (Admin) ──────────────────────────────────────

// GET /admin/channel/settings — دریافت آواتار و نام کانال
router.get("/admin/channel/settings", requireAdmin, async (_req, res) => {
  const rows = await db
    .select()
    .from(siteSettingsTable)
    .where(inArray(siteSettingsTable.key, ["channel_avatar", "channel_name"]));
  const map: Record<string, string | null> = { channel_avatar: null, channel_name: null };
  for (const row of rows) {
    map[row.key] = row.value ?? null;
  }
  res.json(map);
});

// PUT /admin/channel/settings — ذخیره آواتار و نام کانال
router.put("/admin/channel/settings", requireAdmin, async (req, res) => {
  const { channel_avatar, channel_name } = req.body as {
    channel_avatar?: string;
    channel_name?: string;
  };
  const updates: Array<{ key: string; value: string }> = [];
  if (channel_avatar !== undefined) updates.push({ key: "channel_avatar", value: channel_avatar });
  if (channel_name !== undefined) updates.push({ key: "channel_name", value: channel_name });
  if (updates.length === 0) { res.status(400).json({ error: "هیچ مقداری ارسال نشد" }); return; }
  for (const { key, value } of updates) {
    await db
      .insert(siteSettingsTable)
      .values({ key, value })
      .onConflictDoUpdate({ target: siteSettingsTable.key, set: { value } });
  }
  res.json({ ok: true });
});

export default router;
