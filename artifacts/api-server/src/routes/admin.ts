import { Router } from "express";
import { spawn as spawnProc } from "child_process";
import fs from "fs";
import path from "path";
import { db } from "@workspace/db";
import {
  adminUsersTable,
  coursesTable,
  courseFaqsTable,
  courseLessonsTable,
  coursePhasesTable,
  lessonAttachmentsTable,
  productsTable,
  productCategoriesTable,
  reelsTable,
  usersTable,
  userCoursesTable,
  userProductsTable,
  ordersTable,
  siteSettingsTable,
  chatbotKnowledgeTable,
} from "@workspace/db";
import { eq, asc, count, sql, inArray } from "drizzle-orm";
import { sendPushToAll } from "./push";
import { signAdminToken, requireAdmin, requireSuperAdmin, SUPER_ADMIN_USERNAME } from "../middlewares/auth";
import { hashPassword, verifyPassword } from "../lib/password";
import { getSettingsMap } from "./settings";
import { SEED_KNOWLEDGE } from "../data/chatbot-seed";

const router = Router();

function parseIntParam(value: string | string[] | undefined, res: import("express").Response): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = parseInt(raw ?? "", 10);
  if (isNaN(n) || n <= 0) {
    res.status(400).json({ error: "شناسه نامعتبر است" });
    return null;
  }
  return n;
}

// POST /admin/login
router.post("/admin/login", async (req, res) => {
  const { username, password } = req.body as { username: string; password: string };
  if (!username || !password) {
    res.status(400).json({ error: "نام کاربری و رمز عبور الزامی است" });
    return;
  }

  const [admin] = await db
    .select()
    .from(adminUsersTable)
    .where(eq(adminUsersTable.username, username))
    .limit(1);

  if (!admin) {
    res.status(401).json({ error: "نام کاربری یا رمز عبور اشتباه است" });
    return;
  }

  const valid = await verifyPassword(password, admin.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "نام کاربری یا رمز عبور اشتباه است" });
    return;
  }

  const isSuperAdmin = admin.username === SUPER_ADMIN_USERNAME || admin.isSuperAdmin;
  const permissions = admin.permissions ?? [];
  const token = signAdminToken({ adminId: admin.id, username: admin.username, role: "admin", isSuperAdmin, permissions });
  res.json({ token, admin: { id: admin.id, username: admin.username, isSuperAdmin, permissions } });
});

// GET /admin/generate-user-token — generate a PWA user token for the admin's own account
router.get("/admin/generate-user-token", requireAdmin, async (req, res) => {
  const adminUsername = req.admin!.username;
  const [user] = await db
    .select({ id: usersTable.id, phone: usersTable.phone })
    .from(usersTable)
    .where(eq(usersTable.phone, adminUsername))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "حساب کاربری برای این ادمین در سایت اصلی یافت نشد" });
    return;
  }

  const { signUserToken } = await import("../middlewares/auth");
  const userToken = signUserToken({ userId: user.id, phone: user.phone });
  res.json({ token: userToken });
});

// GET /admin/stats — dashboard summary
router.get("/admin/stats", requireAdmin, async (_req, res) => {
  const [
    [usersCount], [coursesCount], [productsCount], [reelsCount], [ordersCount],
    revenueResult, usersWithPurchasesResult, courseBuyersResult, productBuyersResult,
  ] = await Promise.all([
    db.select({ count: count() }).from(usersTable),
    db.select({ count: count() }).from(coursesTable),
    db.select({ count: count() }).from(productsTable),
    db.select({ count: count() }).from(reelsTable),
    db.select({ count: count() }).from(ordersTable),
    db.select({ total: sql<string>`coalesce(sum(amount),0)` }).from(ordersTable).where(eq(ordersTable.status, "paid")),
    // کاربرانی که حداقل یک دوره یا محصول خریده‌اند
    db.select({ cnt: sql<string>`count(distinct user_id)` })
      .from(sql`(
        select user_id from user_courses
        union
        select user_id from user_products
      ) as buyers`),
    // تعداد خریدار به تفکیک دوره
    db.select({
      id: coursesTable.id,
      title: coursesTable.title,
      buyerCount: count(userCoursesTable.userId),
    })
      .from(coursesTable)
      .leftJoin(userCoursesTable, eq(userCoursesTable.courseId, coursesTable.id))
      .groupBy(coursesTable.id, coursesTable.title)
      .orderBy(sql`count(${userCoursesTable.userId}) desc`),
    // تعداد خریدار به تفکیک محصول
    db.select({
      id: productsTable.id,
      title: productsTable.title,
      buyerCount: count(userProductsTable.userId),
    })
      .from(productsTable)
      .leftJoin(userProductsTable, eq(userProductsTable.productId, productsTable.id))
      .groupBy(productsTable.id, productsTable.title)
      .orderBy(sql`count(${userProductsTable.userId}) desc`),
  ]);

  res.json({
    users: usersCount?.count ?? 0,
    courses: coursesCount?.count ?? 0,
    products: productsCount?.count ?? 0,
    reels: reelsCount?.count ?? 0,
    orders: ordersCount?.count ?? 0,
    revenue: Number(revenueResult[0]?.total ?? 0),
    usersWithPurchases: Number(usersWithPurchasesResult[0]?.cnt ?? 0),
    courseBuyers: courseBuyersResult.map(r => ({ id: r.id, title: r.title, buyerCount: Number(r.buyerCount) })),
    productBuyers: productBuyersResult.map(r => ({ id: r.id, title: r.title, buyerCount: Number(r.buyerCount) })),
  });
});

// ─── Courses ────────────────────────────────────────────────────────────────

interface FaqInput {
  question: string;
  answer: string;
  order?: number;
}

function mapFaqInputs(faqs: FaqInput[], courseId: number) {
  return faqs.map((f, i) => ({
    courseId,
    question: f.question,
    answer: f.answer,
    order: f.order ?? i,
  }));
}

interface AttachmentInput {
  title?: string | null;
  fileUrl: string;
  fileType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  order?: number;
}

function mapAttachmentInputs(attachments: AttachmentInput[], lessonId: number) {
  return attachments
    .filter((a) => a && typeof a.fileUrl === "string" && a.fileUrl.trim())
    .map((a, i) => ({
      lessonId,
      title: a.title ?? null,
      fileUrl: a.fileUrl.trim(),
      fileType: a.fileType ?? null,
      fileName: a.fileName ?? null,
      fileSize: typeof a.fileSize === "number" ? a.fileSize : null,
      order: a.order ?? i,
    }));
}

// Resolve a requested phaseId to a valid value for the given course.
// Returns: the phaseId if it belongs to the course, null if no phase requested,
// or the string "invalid" if the phase exists for a different course / not at all.
async function resolvePhaseId(phaseId: unknown, courseId: number): Promise<number | null | "invalid"> {
  if (typeof phaseId !== "number") return null;
  const [phase] = await db
    .select({ courseId: coursePhasesTable.courseId })
    .from(coursePhasesTable)
    .where(eq(coursePhasesTable.id, phaseId))
    .limit(1);
  if (!phase || phase.courseId !== courseId) return "invalid";
  return phaseId;
}

// Attach the attachments array to each lesson row
async function withAttachments<T extends { id: number }>(lessons: T[]): Promise<(T & { attachments: typeof lessonAttachmentsTable.$inferSelect[] })[]> {
  if (lessons.length === 0) return [];
  const ids = lessons.map((l) => l.id);
  const atts = await db
    .select()
    .from(lessonAttachmentsTable)
    .where(inArray(lessonAttachmentsTable.lessonId, ids))
    .orderBy(asc(lessonAttachmentsTable.order), asc(lessonAttachmentsTable.id));
  return lessons.map((l) => ({
    ...l,
    attachments: atts.filter((a) => a.lessonId === l.id),
  }));
}

router.get("/admin/courses", requireAdmin, async (_req, res) => {
  const courses = await db.select().from(coursesTable).orderBy(asc(coursesTable.createdAt));
  const faqs = await db.select().from(courseFaqsTable).orderBy(asc(courseFaqsTable.order));
  const phases = await db.select().from(coursePhasesTable).orderBy(asc(coursePhasesTable.order), asc(coursePhasesTable.id));

  const result = courses.map((course) => ({
    ...course,
    faqs: faqs.filter((f) => f.courseId === course.id),
    phases: phases.filter((p) => p.courseId === course.id),
  }));

  res.json(result);
});

router.post("/admin/courses", requireAdmin, async (req, res) => {
  const { faqs, ...courseData } = req.body as { faqs?: FaqInput[] } & Record<string, unknown>;

  const [course] = await db
    .insert(coursesTable)
    .values({
      title: courseData.title as string,
      description: (courseData.description as string | null) ?? null,
      image: (courseData.image as string | null) ?? null,
      thumbnail: (courseData.thumbnail as string | null) ?? null,
      audioUrl: (courseData.audioUrl as string | null) ?? null,
      price: (courseData.price as number) ?? 0,
      results: (courseData.results as string[] | null) ?? null,
      isPublished: (courseData.isPublished as boolean) ?? false,
      isPhased: (courseData.isPhased as boolean) ?? false,
    })
    .returning();

  let insertedFaqs: typeof courseFaqsTable.$inferSelect[] = [];
  if (faqs && Array.isArray(faqs) && faqs.length > 0) {
    insertedFaqs = await db
      .insert(courseFaqsTable)
      .values(mapFaqInputs(faqs, course.id))
      .returning();
  }

  if (course.isPublished) {
    sendPushToAll({ title: "📚 دوره جدید منتشر شد", body: course.title, url: `/course/${course.id}` }).catch(() => {});
  }

  res.status(201).json({ ...course, faqs: insertedFaqs, phases: [] });
});

router.put("/admin/courses/:id", requireAdmin, async (req, res) => {
  const id = parseIntParam(req.params.id, res);
  if (id === null) return;
  const { faqs, ...courseData } = req.body as { faqs?: FaqInput[] } & Record<string, unknown>;

  const [old] = await db.select({ isPublished: coursesTable.isPublished }).from(coursesTable).where(eq(coursesTable.id, id)).limit(1);
  const wasPublished = old?.isPublished ?? false;

  const [course] = await db
    .update(coursesTable)
    .set({
      title: courseData.title as string,
      description: (courseData.description as string | null) ?? null,
      image: (courseData.image as string | null) ?? null,
      thumbnail: (courseData.thumbnail as string | null) ?? null,
      audioUrl: (courseData.audioUrl as string | null) ?? null,
      price: (courseData.price as number) ?? 0,
      results: (courseData.results as string[] | null) ?? null,
      isPublished: (courseData.isPublished as boolean) ?? false,
      isPhased: (courseData.isPhased as boolean) ?? false,
      updatedAt: new Date(),
    })
    .where(eq(coursesTable.id, id))
    .returning();

  if (!course) {
    res.status(404).json({ error: "دوره یافت نشد" });
    return;
  }

  await db.delete(courseFaqsTable).where(eq(courseFaqsTable.courseId, id));
  let insertedFaqs: typeof courseFaqsTable.$inferSelect[] = [];
  if (faqs && Array.isArray(faqs) && faqs.length > 0) {
    insertedFaqs = await db
      .insert(courseFaqsTable)
      .values(mapFaqInputs(faqs, course.id))
      .returning();
  }

  if (course.isPublished && !wasPublished) {
    sendPushToAll({ title: "📚 دوره جدید منتشر شد", body: course.title, url: `/course/${course.id}` }).catch(() => {});
  }

  const phases = await db.select().from(coursePhasesTable).where(eq(coursePhasesTable.courseId, id)).orderBy(asc(coursePhasesTable.order), asc(coursePhasesTable.id));
  res.json({ ...course, faqs: insertedFaqs, phases });
});

router.delete("/admin/courses/:id", requireAdmin, async (req, res) => {
  const id = parseIntParam(req.params.id, res);
  if (id === null) return;
  const lessons = await db.select({ id: courseLessonsTable.id }).from(courseLessonsTable).where(eq(courseLessonsTable.courseId, id));
  if (lessons.length > 0) {
    await db.delete(lessonAttachmentsTable).where(inArray(lessonAttachmentsTable.lessonId, lessons.map((l) => l.id)));
  }
  await db.delete(courseLessonsTable).where(eq(courseLessonsTable.courseId, id));
  await db.delete(courseFaqsTable).where(eq(courseFaqsTable.courseId, id));
  await db.delete(coursePhasesTable).where(eq(coursePhasesTable.courseId, id));
  await db.delete(coursesTable).where(eq(coursesTable.id, id));
  res.json({ message: "دوره حذف شد" });
});

// ─── Course Phases (admin) ───────────────────────────────────────────────────

router.post("/admin/courses/:id/phases", requireAdmin, async (req, res) => {
  const courseId = parseIntParam(req.params.id, res);
  if (courseId === null) return;
  const body = req.body as { title?: string; order?: number };
  if (!body.title?.trim()) {
    res.status(400).json({ error: "عنوان فاز الزامی است" });
    return;
  }
  const [phase] = await db
    .insert(coursePhasesTable)
    .values({ courseId, title: body.title.trim(), order: body.order ?? 0 })
    .returning();
  res.status(201).json(phase);
});

router.put("/admin/phases/:id", requireAdmin, async (req, res) => {
  const id = parseIntParam(req.params.id, res);
  if (id === null) return;
  const body = req.body as { title?: string; order?: number };
  if (!body.title?.trim()) {
    res.status(400).json({ error: "عنوان فاز الزامی است" });
    return;
  }
  const [phase] = await db
    .update(coursePhasesTable)
    .set({ title: body.title.trim(), order: body.order ?? 0 })
    .where(eq(coursePhasesTable.id, id))
    .returning();
  if (!phase) {
    res.status(404).json({ error: "فاز یافت نشد" });
    return;
  }
  res.json(phase);
});

router.delete("/admin/phases/:id", requireAdmin, async (req, res) => {
  const id = parseIntParam(req.params.id, res);
  if (id === null) return;
  // Detach lessons from the removed phase rather than deleting them
  await db.update(courseLessonsTable).set({ phaseId: null }).where(eq(courseLessonsTable.phaseId, id));
  await db.delete(coursePhasesTable).where(eq(coursePhasesTable.id, id));
  res.json({ message: "فاز حذف شد" });
});

// ─── Lessons (admin) ─────────────────────────────────────────────────────────

router.get("/admin/courses/:id/lessons", requireAdmin, async (req, res) => {
  const courseId = parseIntParam(req.params.id, res);
  if (courseId === null) return;
  const lessons = await db
    .select()
    .from(courseLessonsTable)
    .where(eq(courseLessonsTable.courseId, courseId))
    .orderBy(asc(courseLessonsTable.order));
  res.json(await withAttachments(lessons));
});

router.post("/admin/courses/:id/lessons", requireAdmin, async (req, res) => {
  const courseId = parseIntParam(req.params.id, res);
  if (courseId === null) return;
  const body = req.body as {
    title: string;
    description?: string | null;
    videoUrl?: string | null;
    audioUrl?: string | null;
    duration?: number | null;
    order?: number;
    isFree?: boolean;
    phaseId?: number | null;
    attachments?: AttachmentInput[];
  };
  if (!body.title?.trim()) {
    res.status(400).json({ error: "عنوان جلسه الزامی است" });
    return;
  }
  const phaseId = await resolvePhaseId(body.phaseId, courseId);
  if (phaseId === "invalid") {
    res.status(400).json({ error: "فاز انتخاب‌شده به این دوره تعلق ندارد" });
    return;
  }
  const [lesson] = await db
    .insert(courseLessonsTable)
    .values({
      courseId,
      title: body.title.trim(),
      description: body.description ?? null,
      videoUrl: body.videoUrl ?? null,
      audioUrl: body.audioUrl ?? null,
      duration: body.duration ?? null,
      order: body.order ?? 0,
      isFree: body.isFree ?? false,
      phaseId,
    })
    .returning();

  let attachments: typeof lessonAttachmentsTable.$inferSelect[] = [];
  if (Array.isArray(body.attachments) && body.attachments.length > 0) {
    const rows = mapAttachmentInputs(body.attachments, lesson.id);
    if (rows.length > 0) attachments = await db.insert(lessonAttachmentsTable).values(rows).returning();
  }
  res.status(201).json({ ...lesson, attachments });
});

router.put("/admin/lessons/:id", requireAdmin, async (req, res) => {
  const id = parseIntParam(req.params.id, res);
  if (id === null) return;
  const body = req.body as {
    title: string;
    description?: string | null;
    videoUrl?: string | null;
    audioUrl?: string | null;
    duration?: number | null;
    order?: number;
    isFree?: boolean;
    phaseId?: number | null;
    attachments?: AttachmentInput[];
  };
  if (!body.title?.trim()) {
    res.status(400).json({ error: "عنوان جلسه الزامی است" });
    return;
  }
  const [existing] = await db
    .select({ courseId: courseLessonsTable.courseId })
    .from(courseLessonsTable)
    .where(eq(courseLessonsTable.id, id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "جلسه یافت نشد" });
    return;
  }
  const phaseId = await resolvePhaseId(body.phaseId, existing.courseId);
  if (phaseId === "invalid") {
    res.status(400).json({ error: "فاز انتخاب‌شده به این دوره تعلق ندارد" });
    return;
  }
  const [lesson] = await db
    .update(courseLessonsTable)
    .set({
      title: body.title.trim(),
      description: body.description ?? null,
      videoUrl: body.videoUrl ?? null,
      audioUrl: body.audioUrl ?? null,
      duration: body.duration ?? null,
      order: body.order ?? 0,
      isFree: body.isFree ?? false,
      phaseId,
    })
    .where(eq(courseLessonsTable.id, id))
    .returning();
  if (!lesson) {
    res.status(404).json({ error: "جلسه یافت نشد" });
    return;
  }

  // Replace attachments only when the client explicitly sends the array
  let attachments: typeof lessonAttachmentsTable.$inferSelect[] = [];
  if (Array.isArray(body.attachments)) {
    await db.delete(lessonAttachmentsTable).where(eq(lessonAttachmentsTable.lessonId, id));
    const rows = mapAttachmentInputs(body.attachments, id);
    if (rows.length > 0) attachments = await db.insert(lessonAttachmentsTable).values(rows).returning();
  } else {
    attachments = await db.select().from(lessonAttachmentsTable).where(eq(lessonAttachmentsTable.lessonId, id)).orderBy(asc(lessonAttachmentsTable.order), asc(lessonAttachmentsTable.id));
  }
  res.json({ ...lesson, attachments });
});

router.delete("/admin/lessons/:id", requireAdmin, async (req, res) => {
  const id = parseIntParam(req.params.id, res);
  if (id === null) return;
  await db.delete(lessonAttachmentsTable).where(eq(lessonAttachmentsTable.lessonId, id));
  await db.delete(courseLessonsTable).where(eq(courseLessonsTable.id, id));
  res.json({ message: "جلسه حذف شد" });
});

// ─── Product Categories ─────────────────────────────────────────────────────

router.get("/admin/product-categories", requireAdmin, async (_req, res) => {
  const cats = await db.select().from(productCategoriesTable).orderBy(asc(productCategoriesTable.sortOrder), asc(productCategoriesTable.id));
  res.json(cats);
});

router.post("/admin/product-categories", requireAdmin, async (req, res) => {
  const { name, slug, sortOrder } = req.body as { name: string; slug: string; sortOrder?: number };
  if (!name || !slug) { res.status(400).json({ error: "نام و slug الزامی است" }); return; }
  const [cat] = await db.insert(productCategoriesTable).values({ name, slug, sortOrder: sortOrder ?? 0 }).returning();
  res.status(201).json(cat);
});

router.put("/admin/product-categories/:id", requireAdmin, async (req, res) => {
  const id = parseIntParam(req.params.id, res);
  if (id === null) return;
  const { name, slug, sortOrder } = req.body as { name: string; slug: string; sortOrder?: number };
  const [cat] = await db.update(productCategoriesTable).set({ name, slug, sortOrder: sortOrder ?? 0 }).where(eq(productCategoriesTable.id, id)).returning();
  if (!cat) { res.status(404).json({ error: "دسته‌بندی یافت نشد" }); return; }
  res.json(cat);
});

router.patch("/admin/product-categories/:id/sort-order", requireAdmin, async (req, res) => {
  const id = parseIntParam(req.params.id, res);
  if (id === null) return;
  const { sortOrder } = req.body as { sortOrder: number };
  if (typeof sortOrder !== "number") { res.status(400).json({ error: "sortOrder عددی الزامی است" }); return; }
  const [cat] = await db.update(productCategoriesTable).set({ sortOrder }).where(eq(productCategoriesTable.id, id)).returning();
  if (!cat) { res.status(404).json({ error: "دسته‌بندی یافت نشد" }); return; }
  res.json(cat);
});

router.delete("/admin/product-categories/:id", requireAdmin, async (req, res) => {
  const id = parseIntParam(req.params.id, res);
  if (id === null) return;
  await db.delete(productCategoriesTable).where(eq(productCategoriesTable.id, id));
  res.json({ message: "دسته‌بندی حذف شد" });
});

// ─── Products ───────────────────────────────────────────────────────────────

router.get("/admin/products", requireAdmin, async (_req, res) => {
  const products = await db.select().from(productsTable).orderBy(asc(productsTable.createdAt));
  res.json(products);
});

router.post("/admin/products", requireAdmin, async (req, res) => {
  const body = req.body as {
    title: string; description?: string | null; image?: string | null;
    audioUrl?: string | null;
    price?: number; isPublished?: boolean; categoryId?: number | null;
    productType?: string; files?: Array<{ url: string; name: string; size?: number }>;
    metadata?: Record<string, unknown>;
  };
  const [product] = await db.insert(productsTable).values({
    title: body.title,
    description: body.description ?? null,
    image: body.image ?? null,
    audioUrl: body.audioUrl ?? null,
    price: body.price ?? 0,
    isPublished: body.isPublished ?? false,
    categoryId: body.categoryId ?? null,
    productType: body.productType ?? "other",
    files: body.files ?? [],
    metadata: body.metadata ?? {},
  }).returning();
  if (product.isPublished) {
    sendPushToAll({ title: "🛍 محصول جدید منتشر شد", body: product.title, url: `/product/${product.id}` }).catch(() => {});
  }
  res.status(201).json(product);
});

router.put("/admin/products/:id", requireAdmin, async (req, res) => {
  const id = parseIntParam(req.params.id, res);
  if (id === null) return;
  const body = req.body as {
    title: string; description?: string | null; image?: string | null;
    audioUrl?: string | null;
    price?: number; isPublished?: boolean; categoryId?: number | null;
    productType?: string; files?: Array<{ url: string; name: string; size?: number }>;
    metadata?: Record<string, unknown>;
  };
  const [oldProduct] = await db.select({ isPublished: productsTable.isPublished }).from(productsTable).where(eq(productsTable.id, id)).limit(1);
  const wasProductPublished = oldProduct?.isPublished ?? false;
  const [product] = await db.update(productsTable).set({
    title: body.title,
    description: body.description ?? null,
    image: body.image ?? null,
    audioUrl: body.audioUrl ?? null,
    price: body.price ?? 0,
    isPublished: body.isPublished ?? false,
    categoryId: body.categoryId ?? null,
    productType: body.productType ?? "other",
    files: body.files ?? [],
    metadata: body.metadata ?? {},
    updatedAt: new Date(),
  }).where(eq(productsTable.id, id)).returning();
  if (!product) { res.status(404).json({ error: "محصول یافت نشد" }); return; }
  if (product.isPublished && !wasProductPublished) {
    sendPushToAll({ title: "🛍 محصول جدید منتشر شد", body: product.title, url: `/product/${product.id}` }).catch(() => {});
  }
  res.json(product);
});

router.delete("/admin/products/:id", requireAdmin, async (req, res) => {
  const id = parseIntParam(req.params.id, res);
  if (id === null) return;
  await db.delete(productsTable).where(eq(productsTable.id, id));
  res.json({ message: "محصول حذف شد" });
});

// ─── Reels ──────────────────────────────────────────────────────────────────

router.get("/admin/reels", requireAdmin, async (_req, res) => {
  const reels = await db.select().from(reelsTable).orderBy(asc(reelsTable.order));
  res.json(reels);
});

router.post("/admin/reels", requireAdmin, async (req, res) => {
  const body = req.body as { title?: string | null; videoUrl: string; order?: number };
  const [reel] = await db
    .insert(reelsTable)
    .values({
      title: body.title ?? null,
      videoUrl: body.videoUrl,
      order: body.order ?? 0,
    })
    .returning();
  sendPushToAll({ title: "🎬 ریل جدید", body: reel.title ?? "یک ویدیوی جدید اضافه شد", url: "/reels" }).catch(() => {});
  res.status(201).json(reel);
});

router.put("/admin/reels/:id", requireAdmin, async (req, res) => {
  const id = parseIntParam(req.params.id, res);
  if (id === null) return;
  const body = req.body as { title?: string | null; videoUrl: string; order?: number };
  const [reel] = await db
    .update(reelsTable)
    .set({
      title: body.title ?? null,
      videoUrl: body.videoUrl,
      order: body.order ?? 0,
    })
    .where(eq(reelsTable.id, id))
    .returning();

  if (!reel) {
    res.status(404).json({ error: "ریل یافت نشد" });
    return;
  }
  res.json(reel);
});

router.delete("/admin/reels/:id", requireAdmin, async (req, res) => {
  const id = parseIntParam(req.params.id, res);
  if (id === null) return;
  await db.delete(reelsTable).where(eq(reelsTable.id, id));
  res.json({ message: "ریل حذف شد" });
});

// ─── Users ──────────────────────────────────────────────────────────────────

router.get("/admin/users", requireAdmin, async (_req, res) => {
  const users = await db.select().from(usersTable).orderBy(asc(usersTable.createdAt));
  const userCourses = await db.select().from(userCoursesTable);
  const userProducts = await db.select().from(userProductsTable);

  const result = users.map(({ passwordHash, ...user }) => ({
    ...user,
    courseIds: userCourses.filter((uc) => uc.userId === user.id).map((uc) => uc.courseId),
    productIds: userProducts.filter((up) => up.userId === user.id).map((up) => up.productId),
  }));

  res.json(result);
});

// GET /admin/users/lite — فقط id، phone و name (سبک، برای picker ادمین)
router.get("/admin/users/lite", requireAdmin, async (_req, res) => {
  const users = await db
    .select({ id: usersTable.id, phone: usersTable.phone, name: usersTable.name })
    .from(usersTable)
    .orderBy(asc(usersTable.createdAt));
  res.json(users);
});

router.post("/admin/users", requireAdmin, async (req, res) => {
  const { phone, password, name } = req.body as { phone?: string; password?: string; name?: string | null };
  const normalizedPhone = (phone ?? "").trim();

  if (!/^09\d{9}$/.test(normalizedPhone)) {
    res.status(400).json({ error: "شماره موبایل نامعتبر است (مثال: 09123456789)" });
    return;
  }
  if (!password || password.length < 6) {
    res.status(400).json({ error: "رمز عبور باید حداقل ۶ کاراکتر باشد" });
    return;
  }

  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.phone, normalizedPhone)).limit(1);
  if (existing) {
    res.status(409).json({ error: "کاربری با این شماره موبایل قبلاً ثبت شده است" });
    return;
  }

  const passwordHash = await hashPassword(password);
  try {
    const [created] = await db
      .insert(usersTable)
      .values({ phone: normalizedPhone, passwordHash, name: name?.trim() || null })
      .returning();
    const { passwordHash: _omit, ...safe } = created;
    res.status(201).json(safe);
  } catch (err: any) {
    // Postgres unique_violation (race with the precheck above)
    if (err?.code === "23505") {
      res.status(409).json({ error: "کاربری با این شماره موبایل قبلاً ثبت شده است" });
      return;
    }
    throw err;
  }
});

router.put("/admin/users/:userId", requireAdmin, async (req, res) => {
  const userId = parseIntParam(req.params.userId, res);
  if (userId === null) return;
  const { name } = req.body as { name?: string | null };

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "کاربر یافت نشد" });
    return;
  }

  const updates: Partial<typeof usersTable.$inferInsert> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name ?? null;

  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, userId)).returning();
  res.json(updated);
});

router.post("/admin/users/:userId/change-password", requireAdmin, async (req, res) => {
  const userId = parseIntParam(req.params.userId, res);
  if (userId === null) return;
  const { password } = req.body as { password?: string };

  if (!password || password.length < 6) {
    res.status(400).json({ error: "رمز عبور باید حداقل ۶ کاراکتر باشد" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "کاربر یافت نشد" });
    return;
  }

  const passwordHash = await hashPassword(password);
  await db.update(usersTable).set({ passwordHash, updatedAt: new Date() }).where(eq(usersTable.id, userId));
  res.json({ message: "رمز عبور با موفقیت تغییر کرد" });
});

router.delete("/admin/users/:userId", requireAdmin, async (req, res) => {
  const userId = parseIntParam(req.params.userId, res);
  if (userId === null) return;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "کاربر یافت نشد" });
    return;
  }

  await db.delete(userCoursesTable).where(eq(userCoursesTable.userId, userId));
  await db.delete(userProductsTable).where(eq(userProductsTable.userId, userId));
  await db.delete(usersTable).where(eq(usersTable.id, userId));

  res.json({ message: "کاربر با موفقیت حذف شد" });
});

router.post("/admin/users/:userId/grant-course/:courseId", requireAdmin, async (req, res) => {
  const userId = parseIntParam(req.params.userId, res);
  if (userId === null) return;
  const courseId = parseIntParam(req.params.courseId, res);
  if (courseId === null) return;

  const existing = await db
    .select()
    .from(userCoursesTable)
    .where(eq(userCoursesTable.userId, userId));

  const alreadyHas = existing.some((r) => r.courseId === courseId);
  if (!alreadyHas) {
    await db.insert(userCoursesTable).values({ userId, courseId });
  }

  res.json({ message: "دسترسی دوره اعطا شد" });
});

router.post("/admin/users/:userId/grant-product/:productId", requireAdmin, async (req, res) => {
  const userId = parseIntParam(req.params.userId, res);
  if (userId === null) return;
  const productId = parseIntParam(req.params.productId, res);
  if (productId === null) return;

  const existing = await db
    .select()
    .from(userProductsTable)
    .where(eq(userProductsTable.userId, userId));

  const alreadyHas = existing.some((r) => r.productId === productId);
  if (!alreadyHas) {
    await db.insert(userProductsTable).values({ userId, productId });
  }

  res.json({ message: "دسترسی محصول اعطا شد" });
});

// ─── Orders ─────────────────────────────────────────────────────────────────

router.get("/admin/orders", requireAdmin, async (_req, res) => {
  const orders = await db.select().from(ordersTable).orderBy(asc(ordersTable.createdAt));

  const userIds = [...new Set(orders.map(o => o.userId))];
  const courseIds = [...new Set(orders.filter(o => o.itemType === "course").map(o => o.itemId))];
  const productIds = [...new Set(orders.filter(o => o.itemType === "product").map(o => o.itemId))];

  const [users, courses, products] = await Promise.all([
    userIds.length ? db.select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone }).from(usersTable).where(inArray(usersTable.id, userIds)) : [],
    courseIds.length ? db.select({ id: coursesTable.id, title: coursesTable.title }).from(coursesTable).where(inArray(coursesTable.id, courseIds)) : [],
    productIds.length ? db.select({ id: productsTable.id, title: productsTable.title }).from(productsTable).where(inArray(productsTable.id, productIds)) : [],
  ]);

  const userMap = new Map(users.map(u => [u.id, u]));
  const courseMap = new Map(courses.map(c => [c.id, c.title]));
  const productMap = new Map(products.map(p => [p.id, p.title]));

  const enriched = orders.map(o => ({
    ...o,
    userName: userMap.get(o.userId)?.name ?? null,
    userPhone: userMap.get(o.userId)?.phone ?? null,
    itemTitle: o.itemType === "course" ? (courseMap.get(o.itemId) ?? null) : (productMap.get(o.itemId) ?? null),
  }));

  res.json(enriched);
});

// ─── Settings ────────────────────────────────────────────────────────────────

const SETTINGS_KEYS = [
  "siteName", "logoUrl", "primaryColor",
  "heroTitle", "heroSubtitle", "aboutText", "footerText", "bannerImageUrl",
  "avalai_api_key", "chatbot_model",
  "elevenlabs_api_key", "elevenlabs_voice_id",
  "openai_api_key",
  "chatbot_enabled", "voice_call_enabled",
  "voice_call_blocked_course_ids",
  "chatbot_course_filter_mode",
  "chatbot_course_filter_ids",
  "voice_call_course_filter_mode",
  "voice_call_course_filter_ids",
  "site_url",
  "zarinpal_merchant_id",
  "zarinpal_sandbox",
  "sms_api_key",
  "sms_from",
  "sms_pattern_code",
  "ippanel_api_key",
  // Social Proof timing (seconds)
  "sp_first_delay_min",
  "sp_first_delay_max",
  "sp_interval_min",
  "sp_interval_max",
];

router.get("/admin/settings", requireAdmin, async (_req, res) => {
  const map = await getSettingsMap();
  res.json(map);
});

router.put("/admin/settings", requireAdmin, async (req, res) => {
  const body = req.body as Record<string, string>;

  for (const key of SETTINGS_KEYS) {
    if (key in body) {
      const existing = await db
        .select()
        .from(siteSettingsTable)
        .where(eq(siteSettingsTable.key, key))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(siteSettingsTable)
          .set({ value: body[key], updatedAt: new Date() })
          .where(eq(siteSettingsTable.key, key));
      } else {
        await db.insert(siteSettingsTable).values({ key, value: body[key] });
      }
    }
  }

  const map = await getSettingsMap();
  res.json(map);
});

// ─── Admin Courses (for voice-call block configuration) ──────────────────────
router.get("/admin/courses", requireAdmin, async (_req, res) => {
  const allCourses = await db
    .select({ id: coursesTable.id, title: coursesTable.title, isPublished: coursesTable.isPublished })
    .from(coursesTable)
    .orderBy(coursesTable.id);
  res.json(allCourses);
});

// ─── Chatbot Knowledge ───────────────────────────────────────────────────────

interface ChatbotKnowledgeInput {
  category: string;
  question: string;
  answer: string;
  courseId?: string | null;
}

router.get("/admin/chatbot-knowledge", requireAdmin, async (_req, res) => {
  const items = await db
    .select()
    .from(chatbotKnowledgeTable)
    .orderBy(asc(chatbotKnowledgeTable.createdAt));
  res.json(items);
});

router.post("/admin/chatbot-knowledge", requireAdmin, async (req, res) => {
  const body = req.body as ChatbotKnowledgeInput;
  const [item] = await db
    .insert(chatbotKnowledgeTable)
    .values({
      category: body.category,
      question: body.question,
      answer: body.answer,
      courseId: body.courseId ?? null,
    })
    .returning();
  res.status(201).json(item);
});

router.put("/admin/chatbot-knowledge/:id", requireAdmin, async (req, res) => {
  const id = parseIntParam(req.params.id, res);
  if (id === null) return;
  const body = req.body as ChatbotKnowledgeInput;
  const [item] = await db
    .update(chatbotKnowledgeTable)
    .set({
      category: body.category,
      question: body.question,
      answer: body.answer,
      courseId: body.courseId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(chatbotKnowledgeTable.id, id))
    .returning();

  if (!item) {
    res.status(404).json({ error: "آیتم یافت نشد" });
    return;
  }
  res.json(item);
});

router.delete("/admin/chatbot-knowledge/:id", requireAdmin, async (req, res) => {
  const id = parseIntParam(req.params.id, res);
  if (id === null) return;
  await db.delete(chatbotKnowledgeTable).where(eq(chatbotKnowledgeTable.id, id));
  res.json({ message: "آیتم حذف شد" });
});

// POST /admin/chatbot-knowledge/seed — بارگذاری محتوای پیش‌فرض پایگاه دانش
// با ?force=1 محتوای فعلی حذف و دوباره از منبع (chatbot-seed) بارگذاری می‌شود (idempotent)
router.post("/admin/chatbot-knowledge/seed", requireAdmin, async (req, res) => {
  const { force } = req.query;

  // Check existing count
  const existing = await db.select({ id: chatbotKnowledgeTable.id }).from(chatbotKnowledgeTable).limit(1);
  if (existing.length > 0 && force !== "1") {
    res.status(409).json({ error: "پایگاه دانش قبلاً محتوا دارد. برای بارگذاری مجدد ?force=1 اضافه کنید", count: existing.length });
    return;
  }

  // On force, wipe-then-insert so re-seeding never duplicates rows.
  // Wrapped in a transaction so a failed insert can't leave the KB empty.
  await db.transaction(async (tx) => {
    if (force === "1") {
      await tx.delete(chatbotKnowledgeTable);
    }
    await tx.insert(chatbotKnowledgeTable).values(SEED_KNOWLEDGE);
  });
  res.json({ ok: true, inserted: SEED_KNOWLEDGE.length });
});

// DELETE /admin/users/:id/device — آزادسازی دستگاه کاربر (پشتیبانی)
router.delete("/admin/users/:id/device", requireAdmin, async (req, res) => {
  const id = parseIntParam(req.params.id, res);
  if (id === null) return;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!user) { res.status(404).json({ error: "کاربر یافت نشد" }); return; }

  await db
    .update(usersTable)
    .set({ boundDeviceId: null, updatedAt: new Date() })
    .where(eq(usersTable.id, id));

  res.json({ message: `دستگاه کاربر ${user.phone} با موفقیت آزاد شد` });
});


// POST /admin/fix-videos — apply ffmpeg faststart to all existing videos
// Run once after deploying to fix videos uploaded before this feature was added.

router.post("/admin/fix-videos", requireAdmin, async (_req, res) => {
  const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
  const videosDir = path.join(UPLOAD_DIR, "videos");

  if (!fs.existsSync(videosDir)) {
    res.json({ fixed: 0, skipped: 0, message: "پوشه videos یافت نشد" });
    return;
  }

  const files = fs.readdirSync(videosDir).filter(f => /\.(mp4|mkv|mov|avi)$/i.test(f));
  let fixed = 0;
  let skipped = 0;

  for (const file of files) {
    const filePath = path.join(videosDir, file);
    const tmpPath = filePath + ".fs.mp4";
    const ok = await new Promise<boolean>((resolve) => {
      const ff = spawnProc("ffmpeg", ["-i", filePath, "-c", "copy", "-movflags", "+faststart", "-y", tmpPath]);
      ff.on("close", (code) => {
        if (code === 0 && fs.existsSync(tmpPath)) {
          try { fs.renameSync(tmpPath, filePath); resolve(true); } catch { resolve(false); }
        } else {
          try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
          resolve(false);
        }
      });
      ff.on("error", () => { resolve(false); });
    });
    if (ok) fixed++; else skipped++;
  }

  res.json({ fixed, skipped, total: files.length, message: `${fixed} ویدیو faststart شد، ${skipped} رد شد` });
});


// ─── Admin Management (Super Admin Only) ─────────────────────────────────────

// GET /admin/admins — لیست همه ادمین‌ها
router.get("/admin/admins", requireSuperAdmin, async (_req, res) => {
  const admins = await db
    .select({
      id: adminUsersTable.id,
      username: adminUsersTable.username,
      isSuperAdmin: adminUsersTable.isSuperAdmin,
      permissions: adminUsersTable.permissions,
      createdAt: adminUsersTable.createdAt,
    })
    .from(adminUsersTable)
    .orderBy(asc(adminUsersTable.createdAt));
  res.json(admins);
});

// POST /admin/admins — ایجاد ادمین جدید
router.post("/admin/admins", requireSuperAdmin, async (req, res) => {
  const { username, password, permissions } = req.body as {
    username?: string;
    password?: string;
    permissions?: string[];
  };

  if (!username || username.trim().length < 3) {
    res.status(400).json({ error: "نام کاربری باید حداقل ۳ کاراکتر باشد" });
    return;
  }
  if (!password || password.length < 6) {
    res.status(400).json({ error: "رمز عبور باید حداقل ۶ کاراکتر باشد" });
    return;
  }

  const [existing] = await db
    .select({ id: adminUsersTable.id })
    .from(adminUsersTable)
    .where(eq(adminUsersTable.username, username.trim()))
    .limit(1);

  if (existing) {
    res.status(409).json({ error: "این نام کاربری قبلاً ثبت شده است" });
    return;
  }

  const passwordHash = await hashPassword(password);
  try {
    const [created] = await db
      .insert(adminUsersTable)
      .values({
        username: username.trim(),
        passwordHash,
        isSuperAdmin: false,
        permissions: permissions ?? [],
      })
      .returning({
        id: adminUsersTable.id,
        username: adminUsersTable.username,
        isSuperAdmin: adminUsersTable.isSuperAdmin,
        permissions: adminUsersTable.permissions,
        createdAt: adminUsersTable.createdAt,
      });
    res.status(201).json(created);
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "این نام کاربری قبلاً ثبت شده است" });
      return;
    }
    throw err;
  }
});

// PUT /admin/admins/:id — ویرایش مجوزها و رمز عبور ادمین
router.put("/admin/admins/:id", requireSuperAdmin, async (req, res) => {
  const id = parseIntParam(req.params.id, res);
  if (id === null) return;

  const { permissions, password, username } = req.body as {
    permissions?: string[];
    password?: string;
    username?: string;
  };

  const [target] = await db
    .select()
    .from(adminUsersTable)
    .where(eq(adminUsersTable.id, id))
    .limit(1);

  if (!target) {
    res.status(404).json({ error: "ادمین یافت نشد" });
    return;
  }

  if (target.isSuperAdmin || target.username === SUPER_ADMIN_USERNAME) {
    res.status(403).json({ error: "سوپر ادمین اصلی قابل ویرایش نیست" });
    return;
  }

  const updates: Partial<typeof adminUsersTable.$inferInsert> = {};

  if (permissions !== undefined) {
    updates.permissions = permissions;
  }
  if (password && password.length >= 6) {
    updates.passwordHash = await hashPassword(password);
  } else if (password !== undefined && password !== "") {
    res.status(400).json({ error: "رمز عبور باید حداقل ۶ کاراکتر باشد" });
    return;
  }
  if (username && username.trim().length >= 3 && username.trim() !== target.username) {
    const [dup] = await db
      .select({ id: adminUsersTable.id })
      .from(adminUsersTable)
      .where(eq(adminUsersTable.username, username.trim()))
      .limit(1);
    if (dup) {
      res.status(409).json({ error: "این نام کاربری قبلاً ثبت شده است" });
      return;
    }
    updates.username = username.trim();
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "هیچ تغییری ارسال نشد" });
    return;
  }

  const [updated] = await db
    .update(adminUsersTable)
    .set(updates)
    .where(eq(adminUsersTable.id, id))
    .returning({
      id: adminUsersTable.id,
      username: adminUsersTable.username,
      isSuperAdmin: adminUsersTable.isSuperAdmin,
      permissions: adminUsersTable.permissions,
      createdAt: adminUsersTable.createdAt,
    });

  res.json(updated);
});

// DELETE /admin/admins/:id — حذف ادمین
router.delete("/admin/admins/:id", requireSuperAdmin, async (req, res) => {
  const id = parseIntParam(req.params.id, res);
  if (id === null) return;

  const requestingAdminId = (req.admin as { adminId: number }).adminId;
  if (id === requestingAdminId) {
    res.status(400).json({ error: "نمی‌توانید حساب خودتان را حذف کنید" });
    return;
  }

  const [target] = await db
    .select()
    .from(adminUsersTable)
    .where(eq(adminUsersTable.id, id))
    .limit(1);

  if (!target) {
    res.status(404).json({ error: "ادمین یافت نشد" });
    return;
  }

  if (target.isSuperAdmin || target.username === SUPER_ADMIN_USERNAME) {
    res.status(403).json({ error: "سوپر ادمین اصلی قابل حذف نیست" });
    return;
  }

  await db.delete(adminUsersTable).where(eq(adminUsersTable.id, id));
  res.json({ message: "ادمین با موفقیت حذف شد" });
});

export { hashPassword };
export default router;
