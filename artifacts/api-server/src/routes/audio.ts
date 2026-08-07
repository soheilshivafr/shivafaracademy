import { Router, Request, Response } from "express";
import { pool } from "@workspace/db";
import { requireUser, requireAdmin, optionalAuth } from "../middlewares/auth";
import { toProxyUrl } from "../lib/storage/index";

const router = Router();
const BASE_URL = process.env.BASE_URL || "";

/** Compute current fake views based on time since creation (48-hour ramp-up) */
function computeFakeViews(fakeTarget: number, createdAt: Date): number {
  const RAMP_MINUTES = 48 * 60;
  const minutesSince = (Date.now() - createdAt.getTime()) / 60_000;
  if (minutesSince >= RAMP_MINUTES) return fakeTarget;
  return Math.floor(fakeTarget * (minutesSince / RAMP_MINUTES));
}

function computeFakeLikes(fakeLikesTarget: number, createdAt: Date): number {
  const RAMP_MINUTES = 48 * 60;
  const minutesSince = (Date.now() - createdAt.getTime()) / 60_000;
  if (minutesSince >= RAMP_MINUTES) return fakeLikesTarget;
  return Math.floor(fakeLikesTarget * (minutesSince / RAMP_MINUTES));
}

// ─── Public routes ────────────────────────────────────────────────────────────

// GET /audio — list all published posts
router.get("/audio", optionalAuth, async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId ?? null;
  const client = await pool.connect();
  try {
    const { rows } = await client.query<any>(
      `SELECT ap.*,
        COALESCE((SELECT COUNT(*) FROM audio_likes al WHERE al.audio_post_id = ap.id), 0) AS real_likes_count,
        CASE WHEN $1::int IS NOT NULL
          THEN EXISTS(SELECT 1 FROM audio_likes al WHERE al.audio_post_id = ap.id AND al.user_id = $1::int)
          ELSE FALSE
        END AS user_liked
       FROM audio_posts ap
       WHERE ap.is_published = TRUE
       ORDER BY ap.created_at DESC`,
      [userId]
    );

    const posts = rows.map((r: any) => {
      const fakeViews = computeFakeViews(r.fake_views_target, new Date(r.created_at));
      const fakeLikes = computeFakeLikes(r.fake_likes_target, new Date(r.created_at));
      return {
        id: r.id,
        title: r.title,
        description: r.description,
        audioUrl: r.audio_url ? `${BASE_URL}/api/stream/audio/podcast/${r.id}` : null,
        coverUrl: toProxyUrl(r.cover_url) ?? r.cover_url ?? null,
        createdAt: r.created_at,
        views: fakeViews + r.real_views,
        likes: fakeLikes + Number(r.real_likes_count),
        userLiked: r.user_liked,
      };
    });

    res.json(posts);
  } finally {
    client.release();
  }
});

// GET /audio/:id/comments — approved comments only
router.get("/audio/:id/comments", async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT ac.id, ac.content, ac.created_at,
        u.name AS user_name, u.avatar AS user_avatar
       FROM audio_comments ac
       JOIN users u ON u.id = ac.user_id
       WHERE ac.audio_post_id = $1 AND ac.approved = TRUE
       ORDER BY ac.created_at ASC`,
      [req.params.id]
    );
    res.json(rows);
  } finally {
    client.release();
  }
});

// POST /audio/:id/view — increment real view (no auth required)
router.post("/audio/:id/view", async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE audio_posts SET real_views = real_views + 1, updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    );
    res.json({ ok: true });
  } finally {
    client.release();
  }
});

// POST /audio/:id/like — toggle like (auth required)
router.post("/audio/:id/like", requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).user!.userId;
  const postId = req.params.id;
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id FROM audio_likes WHERE audio_post_id = $1 AND user_id = $2`,
      [postId, userId]
    );
    if (rows.length > 0) {
      await client.query(`DELETE FROM audio_likes WHERE audio_post_id = $1 AND user_id = $2`, [postId, userId]);
      res.json({ liked: false });
    } else {
      await client.query(`INSERT INTO audio_likes (audio_post_id, user_id) VALUES ($1, $2)`, [postId, userId]);
      res.json({ liked: true });
    }
  } finally {
    client.release();
  }
});

// POST /audio/:id/comment — post comment (auth required, pending approval)
router.post("/audio/:id/comment", requireUser, async (req: Request, res: Response) => {
  const userId = (req as any).user!.userId;
  const { content } = req.body as { content?: string };
  if (!content?.trim()) { res.status(400).json({ error: "متن نظر الزامی است" }); return; }
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO audio_comments (audio_post_id, user_id, content) VALUES ($1, $2, $3)`,
      [req.params.id, userId, content.trim()]
    );
    res.json({ ok: true, message: "نظر شما ثبت شد و پس از تایید نمایش داده می‌شود" });
  } finally {
    client.release();
  }
});

// PATCH /audio/:id/edit — owner edit (phone 09354505225) or admin
const AUDIO_OWNER_PHONE = "09354505225";

router.patch("/audio/:id/edit", requireUser, async (req: Request, res: Response) => {
  const user = (req as any).user as { userId: number; phone: string };
  if (user.phone !== AUDIO_OWNER_PHONE) { res.status(403).json({ error: "دسترسی ندارید" }); return; }
  const { title, description, audioUrl, coverUrl } = req.body as any;
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `UPDATE audio_posts SET
        title = COALESCE(NULLIF($1,''), title),
        description = COALESCE(NULLIF($2,''), description),
        audio_url = COALESCE(NULLIF($3,''), audio_url),
        cover_url = CASE WHEN $4::text IS NOT NULL THEN $4::text ELSE cover_url END,
        updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [title?.trim() || null, description?.trim() || null, audioUrl?.trim() || null, coverUrl !== undefined ? (coverUrl || null) : undefined, req.params.id]
    );
    if (!rows.length) { res.status(404).json({ error: "یافت نشد" }); return; }
    res.json(rows[0]);
  } finally { client.release(); }
});

// ─── Admin routes ─────────────────────────────────────────────────────────────

// GET /admin/audio — all posts with real stats
router.get("/admin/audio", requireAdmin, async (_req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT ap.*,
        COALESCE((SELECT COUNT(*) FROM audio_likes al WHERE al.audio_post_id = ap.id), 0) AS real_likes_count,
        COALESCE((SELECT COUNT(*) FROM audio_comments ac WHERE ac.audio_post_id = ap.id AND ac.approved = FALSE), 0) AS pending_comments
       FROM audio_posts ap ORDER BY ap.created_at DESC`
    );
    const posts = rows.map((r: any) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      audioUrl: r.audio_url,
      coverUrl: r.cover_url,
      isPublished: r.is_published,
      createdAt: r.created_at,
      fakeViewsTarget: r.fake_views_target,
      fakeLikesTarget: r.fake_likes_target,
      realViews: r.real_views,
      realLikes: Number(r.real_likes_count),
      pendingComments: Number(r.pending_comments),
      displayedViews: computeFakeViews(r.fake_views_target, new Date(r.created_at)) + r.real_views,
    }));
    res.json(posts);
  } finally {
    client.release();
  }
});

// POST /admin/audio — create post
router.post("/admin/audio", requireAdmin, async (req: Request, res: Response) => {
  const { title, description, audioUrl, coverUrl, isPublished } = req.body as any;
  if (!title?.trim() || !audioUrl?.trim()) { res.status(400).json({ error: "عنوان و فایل صوتی الزامی است" }); return; }

  const fakeViewsTarget = Math.floor(Math.random() * (50000 - 1120 + 1)) + 1120;
  const fakeLikesPct = 0.05 + Math.random() * 0.05; // 5–10%
  const fakeLikesTarget = Math.floor(fakeViewsTarget * fakeLikesPct);

  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `INSERT INTO audio_posts (title, description, audio_url, cover_url, is_published, fake_views_target, fake_likes_target)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [title.trim(), description?.trim() || null, audioUrl.trim(), coverUrl?.trim() || null, isPublished !== false, fakeViewsTarget, fakeLikesTarget]
    );
    res.json(rows[0]);
  } finally {
    client.release();
  }
});

// PATCH /admin/audio/:id — update post
router.patch("/admin/audio/:id", requireAdmin, async (req: Request, res: Response) => {
  const { title, description, audioUrl, coverUrl, isPublished } = req.body as any;
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `UPDATE audio_posts SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        audio_url = COALESCE($3, audio_url),
        cover_url = COALESCE($4, cover_url),
        is_published = COALESCE($5, is_published),
        updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [title?.trim() || null, description?.trim() || null, audioUrl?.trim() || null, coverUrl?.trim() || null, isPublished ?? null, req.params.id]
    );
    if (!rows.length) { res.status(404).json({ error: "یافت نشد" }); return; }
    res.json(rows[0]);
  } finally {
    client.release();
  }
});

// DELETE /admin/audio/:id
router.delete("/admin/audio/:id", requireAdmin, async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query(`DELETE FROM audio_likes WHERE audio_post_id = $1`, [req.params.id]);
    await client.query(`DELETE FROM audio_comments WHERE audio_post_id = $1`, [req.params.id]);
    await client.query(`DELETE FROM audio_posts WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } finally {
    client.release();
  }
});

// GET /admin/audio/comments — all pending comments
router.get("/admin/audio/comments", requireAdmin, async (_req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT ac.*, u.name AS user_name, u.phone AS user_phone, ap.title AS post_title
       FROM audio_comments ac
       JOIN users u ON u.id = ac.user_id
       JOIN audio_posts ap ON ap.id = ac.audio_post_id
       ORDER BY ac.created_at DESC`
    );
    res.json(rows);
  } finally {
    client.release();
  }
});

// PATCH /admin/audio/comments/:id — approve or reject
router.patch("/admin/audio/comments/:id", requireAdmin, async (req: Request, res: Response) => {
  const { approved } = req.body as { approved?: boolean };
  const client = await pool.connect();
  try {
    if (approved === false) {
      await client.query(`DELETE FROM audio_comments WHERE id = $1`, [req.params.id]);
      res.json({ ok: true, action: "deleted" });
    } else {
      await client.query(`UPDATE audio_comments SET approved = TRUE WHERE id = $1`, [req.params.id]);
      res.json({ ok: true, action: "approved" });
    }
  } finally {
    client.release();
  }
});

export default router;
