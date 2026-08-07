import { Router } from "express";
import { db } from "@workspace/db";
import { coursesTable, courseFaqsTable, courseLessonsTable, coursePhasesTable, lessonAttachmentsTable, userCoursesTable } from "@workspace/db";
import { eq, asc, and, inArray } from "drizzle-orm";
import { requireUser } from "../middlewares/auth";
import { toProxyUrl } from "../lib/storage/index";

const router = Router();
const BASE_URL = process.env.BASE_URL || "";

// ─── Helper: rewrite media URLs in a course object ────────────────────────────
function sanitizeCourse<T extends { audioUrl?: string | null; imageUrl?: string | null }>(c: T): T {
  return {
    ...c,
    audioUrl: c.audioUrl ? `${BASE_URL}/api/stream/audio/course/${(c as any).id}` : null,
    imageUrl: toProxyUrl(c.imageUrl) ?? c.imageUrl ?? null,
  };
}

// GET /courses - public
router.get("/courses", async (_req, res) => {
  const courses = await db
    .select()
    .from(coursesTable)
    .where(eq(coursesTable.isPublished, true))
    .orderBy(asc(coursesTable.createdAt));

  const courseIds = courses.map((c) => c.id);
  const phases = courseIds.length
    ? await db
        .select()
        .from(coursePhasesTable)
        .where(inArray(coursePhasesTable.courseId, courseIds))
        .orderBy(asc(coursePhasesTable.order), asc(coursePhasesTable.id))
    : [];

  res.json(courses.map((c) => ({ ...sanitizeCourse(c), phases: phases.filter((p) => p.courseId === c.id) })));
});

// GET /courses/:id - public
router.get("/courses/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "شناسه نامعتبر" });
    return;
  }

  const [course] = await db.select().from(coursesTable).where(eq(coursesTable.id, id)).limit(1);

  if (!course || !course.isPublished) {
    res.status(404).json({ error: "دوره یافت نشد" });
    return;
  }

  const faqs = await db
    .select()
    .from(courseFaqsTable)
    .where(eq(courseFaqsTable.courseId, id))
    .orderBy(asc(courseFaqsTable.order));

  const phases = await db
    .select()
    .from(coursePhasesTable)
    .where(eq(coursePhasesTable.courseId, id))
    .orderBy(asc(coursePhasesTable.order), asc(coursePhasesTable.id));

  res.json({ ...sanitizeCourse(course), faqs, phases });
});

// GET /user/courses - authenticated
router.get("/user/courses", requireUser, async (req, res) => {
  const userCourses = await db
    .select({ course: coursesTable })
    .from(userCoursesTable)
    .innerJoin(coursesTable, eq(userCoursesTable.courseId, coursesTable.id))
    .where(eq(userCoursesTable.userId, req.user!.userId));

  res.json(userCourses.map((r) => sanitizeCourse(r.course)));
});

// GET /courses/:id/lessons - authenticated + purchased
router.get("/courses/:id/lessons", requireUser, async (req, res) => {
  const courseId = parseInt(req.params.id as string);
  if (isNaN(courseId)) {
    res.status(400).json({ error: "شناسه نامعتبر" });
    return;
  }

  const [ownership] = await db
    .select()
    .from(userCoursesTable)
    .where(
      and(
        eq(userCoursesTable.userId, req.user!.userId),
        eq(userCoursesTable.courseId, courseId)
      )
    )
    .limit(1);

  if (!ownership) {
    res.status(403).json({ error: "شما این دوره را خریداری نکرده‌اید" });
    return;
  }

  const lessons = await db
    .select()
    .from(courseLessonsTable)
    .where(eq(courseLessonsTable.courseId, courseId))
    .orderBy(asc(courseLessonsTable.order));

  const attachments = lessons.length
    ? await db
        .select()
        .from(lessonAttachmentsTable)
        .where(inArray(lessonAttachmentsTable.lessonId, lessons.map((l) => l.id)))
        .orderBy(asc(lessonAttachmentsTable.order), asc(lessonAttachmentsTable.id))
    : [];

  // Replace raw videoUrl/audioUrl/imageUrl with protected stream/proxy endpoints
  const safeLessons = lessons.map((l) => ({
    ...l,
    videoUrl: l.videoUrl ? `${BASE_URL}/api/stream/lesson/${l.id}` : null,
    audioUrl: l.audioUrl ? `${BASE_URL}/api/stream/audio/lesson/${l.id}` : null,
    imageUrl: toProxyUrl((l as any).imageUrl) ?? (l as any).imageUrl ?? null,
    attachments: attachments
      .filter((a) => a.lessonId === l.id)
      .map((a) => ({
        ...a,
        fileUrl: toProxyUrl((a as any).fileUrl) ?? (a as any).fileUrl ?? null,
      })),
  }));

  res.json(safeLessons);
});

export default router;
