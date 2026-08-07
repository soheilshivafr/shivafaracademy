import { Router } from "express";
import { db } from "@workspace/db";
import {
  courseLicensesTable,
  coursesTable,
  userCoursesTable,
  usersTable,
} from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { requireAdmin, requireUser } from "../middlewares/auth";

const router = Router();

function generateLicenseCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = (n: number) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `SHVF-${seg(4)}-${seg(4)}-${seg(4)}`;
}

// POST /admin/licenses/generate  — ادمین لایسنس تولید می‌کند (یک یا چند دوره)
router.post("/admin/licenses/generate", requireAdmin, async (req, res) => {
  const body = req.body as { courseId?: number; courseIds?: number[] };

  // پشتیبانی از هر دو فرمت: courseId (قدیمی) و courseIds (جدید)
  let ids: number[] = [];
  if (Array.isArray(body.courseIds) && body.courseIds.length > 0) {
    ids = body.courseIds.map(Number).filter((n) => !isNaN(n) && n > 0);
  } else if (body.courseId) {
    ids = [Number(body.courseId)];
  }

  if (ids.length === 0) {
    res.status(400).json({ error: "حداقل یک دوره باید انتخاب شود" });
    return;
  }

  // بررسی وجود همه دوره‌ها
  const courses = await db
    .select({ id: coursesTable.id, title: coursesTable.title })
    .from(coursesTable)
    .where(inArray(coursesTable.id, ids));

  if (courses.length !== ids.length) {
    res.status(404).json({ error: "یک یا چند دوره یافت نشد" });
    return;
  }

  let code = generateLicenseCode();
  for (let i = 0; i < 5; i++) {
    const [existing] = await db
      .select({ id: courseLicensesTable.id })
      .from(courseLicensesTable)
      .where(eq(courseLicensesTable.code, code))
      .limit(1);
    if (!existing) break;
    code = generateLicenseCode();
  }

  const [license] = await db
    .insert(courseLicensesTable)
    .values({
      code,
      courseId: ids[0],
      courseIds: ids,
    })
    .returning();

  const courseTitles = courses.map((c) => c.title);
  res.json({ ...license, courseTitle: courseTitles.join(" + "), courseTitles });
});

// GET /admin/licenses  — لیست همه لایسنس‌ها
router.get("/admin/licenses", requireAdmin, async (req, res) => {
  const licenses = await db
    .select({
      id: courseLicensesTable.id,
      code: courseLicensesTable.code,
      courseId: courseLicensesTable.courseId,
      courseIds: courseLicensesTable.courseIds,
      usedByUserId: courseLicensesTable.usedByUserId,
      userPhone: usersTable.phone,
      userName: usersTable.name,
      userDevice: usersTable.boundDeviceId,
      usedAt: courseLicensesTable.usedAt,
      createdAt: courseLicensesTable.createdAt,
    })
    .from(courseLicensesTable)
    .leftJoin(usersTable, eq(courseLicensesTable.usedByUserId, usersTable.id))
    .orderBy(desc(courseLicensesTable.createdAt));

  // بارگذاری عناوین همه دوره‌ها
  const allCourseIds = new Set<number>();
  for (const lic of licenses) {
    if (lic.courseIds && lic.courseIds.length > 0) {
      lic.courseIds.forEach((id) => allCourseIds.add(id));
    } else if (lic.courseId) {
      allCourseIds.add(lic.courseId);
    }
  }

  let courseMap = new Map<number, string>();
  if (allCourseIds.size > 0) {
    const coursesData = await db
      .select({ id: coursesTable.id, title: coursesTable.title })
      .from(coursesTable)
      .where(inArray(coursesTable.id, [...allCourseIds]));
    courseMap = new Map(coursesData.map((c) => [c.id, c.title]));
  }

  const result = licenses.map((lic) => {
    const effectiveIds =
      lic.courseIds && lic.courseIds.length > 0
        ? lic.courseIds
        : lic.courseId
        ? [lic.courseId]
        : [];

    const courseTitles = effectiveIds.map((id) => courseMap.get(id) ?? `دوره #${id}`);
    return {
      ...lic,
      courseTitle: courseTitles.join(" + "),
      courseTitles,
    };
  });

  res.json(result);
});

// DELETE /admin/licenses/:id  — حذف لایسنس استفاده نشده
router.delete("/admin/licenses/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "شناسه نامعتبر" }); return; }

  const [license] = await db.select().from(courseLicensesTable)
    .where(eq(courseLicensesTable.id, id)).limit(1);
  if (!license) { res.status(404).json({ error: "لایسنس یافت نشد" }); return; }
  if (license.usedByUserId) { res.status(400).json({ error: "لایسنس استفاده شده را نمی‌توان حذف کرد" }); return; }

  await db.delete(courseLicensesTable).where(eq(courseLicensesTable.id, id));
  res.json({ message: "لایسنس حذف شد" });
});

// POST /licenses/redeem  — کاربر لایسنس وارد می‌کند
router.post("/licenses/redeem", requireUser, async (req, res) => {
  const { code } = req.body as { code?: string };
  if (!code || !code.trim()) { res.status(400).json({ error: "کد لایسنس الزامی است" }); return; }

  const normalizedCode = code.trim().toUpperCase();

  const [license] = await db.select().from(courseLicensesTable)
    .where(eq(courseLicensesTable.code, normalizedCode)).limit(1);

  if (!license) { res.status(404).json({ error: "کد لایسنس نامعتبر است" }); return; }
  if (license.usedByUserId) { res.status(400).json({ error: "این لایسنس قبلاً استفاده شده است" }); return; }

  const userId = req.user!.userId;

  // تعیین لیست دوره‌ها برای فعال‌سازی
  const effectiveIds: number[] =
    license.courseIds && license.courseIds.length > 0
      ? license.courseIds
      : license.courseId
      ? [license.courseId]
      : [];

  if (effectiveIds.length === 0) {
    res.status(400).json({ error: "لایسنس معتبر نیست — دوره‌ای تعریف نشده" });
    return;
  }

  // بررسی دوره‌های موجود کاربر
  const existingCourses = await db
    .select({ courseId: userCoursesTable.courseId })
    .from(userCoursesTable)
    .where(eq(userCoursesTable.userId, userId));

  const ownedSet = new Set(existingCourses.map((r) => r.courseId));

  const toActivate = effectiveIds.filter((id) => !ownedSet.has(id));

  if (toActivate.length === 0) {
    res.status(400).json({ error: "همه دوره‌های این لایسنس قبلاً در اکانت شما فعال هستند" });
    return;
  }

  // فعال‌سازی همه دوره‌های جدید
  await db.update(courseLicensesTable)
    .set({ usedByUserId: userId, usedAt: new Date() })
    .where(eq(courseLicensesTable.id, license.id));

  await db.insert(userCoursesTable).values(
    toActivate.map((courseId) => ({ userId, courseId }))
  );

  // عناوین دوره‌ها
  const activatedCourses = await db
    .select({ id: coursesTable.id, title: coursesTable.title })
    .from(coursesTable)
    .where(inArray(coursesTable.id, toActivate));

  const courseTitles = activatedCourses.map((c) => c.title);
  const courseTitle = courseTitles.join(" + ");

  res.json({
    message: "دوره با موفقیت فعال شد",
    courseTitle,
    courseTitles,
    courseId: toActivate[0],
    courseIds: toActivate,
  });
});

export default router;
