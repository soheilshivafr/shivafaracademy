import { Router, Request, Response } from "express";
import { pool } from "@workspace/db";
import { requireUser } from "../middlewares/auth";

const router = Router();
const LESSON_ADMIN_PHONE = "09354505225";

function isLessonAdmin(req: Request): boolean {
  return (req as any).user?.phone === LESSON_ADMIN_PHONE;
}

router.get("/lessons-manage/:courseId", requireUser, async (req: Request, res: Response) => {
  if (!isLessonAdmin(req)) { res.status(403).json({ error: "دسترسی ندارید" }); return; }
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT * FROM course_lessons WHERE course_id = $1 ORDER BY "order" ASC, id ASC`,
      [req.params.courseId]
    );
    const ids = rows.map((r: any) => r.id);
    let attRows: any[] = [];
    if (ids.length) {
      const att = await client.query(
        `SELECT * FROM lesson_attachments WHERE lesson_id = ANY($1::int[]) ORDER BY "order" ASC, id ASC`,
        [ids]
      );
      attRows = att.rows;
    }
    res.json(rows.map((r: any) => ({
      id: r.id, title: r.title, description: r.description,
      videoUrl: r.video_url, audioUrl: r.audio_url, duration: r.duration, order: r.order,
      isFree: r.is_free, courseId: r.course_id, phaseId: r.phase_id,
      attachments: attRows.filter((a: any) => a.lesson_id === r.id).map((a: any) => ({
        id: a.id, lessonId: a.lesson_id, title: a.title, fileUrl: a.file_url,
        fileType: a.file_type, fileName: a.file_name, fileSize: a.file_size, order: a.order,
      })),
    })));
  } finally { client.release(); }
});

router.post("/lessons-manage/:courseId", requireUser, async (req: Request, res: Response) => {
  if (!isLessonAdmin(req)) { res.status(403).json({ error: "دسترسی ندارید" }); return; }
  const { title, description, videoUrl, audioUrl, duration, order, isFree, phaseId } = req.body as any;
  if (!title?.trim()) { res.status(400).json({ error: "عنوان الزامی است" }); return; }
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `INSERT INTO course_lessons (course_id, title, description, video_url, audio_url, duration, "order", is_free, phase_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [req.params.courseId, title.trim(), description?.trim() || null,
       videoUrl?.trim() || null, audioUrl?.trim() || null, duration || null, order ?? 0, isFree !== false,
       typeof phaseId === "number" ? phaseId : null]
    );
    const r = rows[0] as any;
    res.status(201).json({ id: r.id, title: r.title, description: r.description, videoUrl: r.video_url, audioUrl: r.audio_url, duration: r.duration, order: r.order, isFree: r.is_free, courseId: r.course_id, phaseId: r.phase_id });
  } finally { client.release(); }
});

router.put("/lessons-manage/lesson/:id", requireUser, async (req: Request, res: Response) => {
  if (!isLessonAdmin(req)) { res.status(403).json({ error: "دسترسی ندارید" }); return; }
  const { title, description, videoUrl, audioUrl, duration, order, isFree, phaseId } = req.body as any;
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `UPDATE course_lessons SET
        title = COALESCE(NULLIF($1,''), title),
        description = $2,
        video_url = COALESCE(NULLIF($3,''), video_url),
        audio_url = $4,
        duration = COALESCE($5::int, duration),
        "order" = COALESCE($6::int, "order"),
        is_free = COALESCE($7::boolean, is_free),
        phase_id = $8::int,
        updated_at = NOW()
       WHERE id = $9 RETURNING *`,
      [title?.trim() || null, description?.trim() ?? null, videoUrl?.trim() || null,
       audioUrl?.trim() || null, duration ?? null, order ?? null, isFree ?? null,
       typeof phaseId === "number" ? phaseId : null, req.params.id]
    );
    if (!rows.length) { res.status(404).json({ error: "جلسه یافت نشد" }); return; }
    const r = rows[0] as any;
    res.json({ id: r.id, title: r.title, description: r.description, videoUrl: r.video_url, audioUrl: r.audio_url, duration: r.duration, order: r.order, isFree: r.is_free, courseId: r.course_id, phaseId: r.phase_id });
  } finally { client.release(); }
});

router.delete("/lessons-manage/lesson/:id", requireUser, async (req: Request, res: Response) => {
  if (!isLessonAdmin(req)) { res.status(403).json({ error: "دسترسی ندارید" }); return; }
  const client = await pool.connect();
  try {
    await client.query(`DELETE FROM lesson_attachments WHERE lesson_id = $1`, [req.params.id]);
    await client.query(`DELETE FROM course_lessons WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } finally { client.release(); }
});

export default router;
