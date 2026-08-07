import { Router } from "express";
import { db } from "@workspace/db";
import { reelsTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const router = Router();

const BASE_URL = process.env.BASE_URL || "";

// GET /reels - public
router.get("/reels", async (_req, res) => {
  const reels = await db.select().from(reelsTable).orderBy(desc(reelsTable.order));
  // Replace raw videoUrl with stream endpoint so videos bypass the upload block
  const mapped = reels.map((r) => ({
    ...r,
    videoUrl: r.videoUrl ? `${BASE_URL}/api/stream/reel/${r.id}` : null,
  }));
  res.json(mapped);
});

export default router;
