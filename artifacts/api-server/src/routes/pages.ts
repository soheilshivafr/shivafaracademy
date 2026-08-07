import { Router } from "express";
import { db } from "@workspace/db";
import {
  siteSettingsTable,
  pageMediaTable,
  studentResultsTable,
  pageFaqsTable,
} from "@workspace/db";
import { eq, and, asc, like } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

/* ──────────────────────────────────────────────────────────────────────────
 * Landing pages that Sara (voice) and the chatbot can refer users to.
 * These pages are NOT linked from the main app navigation.
 *
 * Text content lives in `site_settings` under the prefix `page_<slug>_<field>`
 * (read directly here, NOT exposed by the public /settings whitelist).
 * Structured content (images / audio / video / faqs / results) lives in the
 * dedicated tables. Everything falls back to the hardcoded Persian defaults
 * below until an admin overrides it — so the pages are never empty.
 * ────────────────────────────────────────────────────────────────────────── */

const SLUGS = ["guarantee", "results", "collab", "mtp"] as const;
type Slug = (typeof SLUGS)[number];

const MEDIA_KINDS = ["image", "audio", "video"] as const;

const MTP_CTA_LABEL = "ثبت‌نام در دورهٔ MTP";

async function getMtpCourseUrl(): Promise<string> {
  try {
    const [row] = await db
      .select()
      .from(siteSettingsTable)
      .where(eq(siteSettingsTable.key, "mtp_course_id"))
      .limit(1);
    const id = row?.value?.trim();
    if (id && /^\d+$/.test(id)) return `/courses/${id}`;
  } catch {
    /* fall through */
  }
  return "/courses";
}

/* ── Default text content per page ─────────────────────────────────────────── */
const DEFAULT_CONTENT: Record<Slug, Record<string, string>> = {
  guarantee: {
    title: "ضمانت‌نامهٔ کتبی بازگشت وجه",
    intro:
      "ما به کیفیت آموزش‌های دورهٔ MTP باور داریم؛ به همین دلیل دوره با ضمانت‌نامهٔ کتبی بازگشت وجه ارائه می‌شود تا با خیال راحت تصمیم بگیری.",
    body:
      "اگر آموزش‌های دوره را کامل اجرا کنی، تمام مراحل گفته‌شده را طبق دستورالعمل انجام بدهی و دقیقاً مطابق شرایط ضمانت عمل کرده باشی، اما طی ۷ روز به نتیجه نرسی، می‌توانی از گارانتی بازگشت وجه استفاده کنی.\n\nهدف ما فقط فروش دوره نیست؛ هدف اینه که آموزش‌ها را اجرا کنی و واقعاً به نتیجه برسی. این ضمانت‌نامه تعهد ما به کیفیت دوره است.",
    terms:
      "اجرای کامل و قدم‌به‌قدم آموزش‌های دوره\nانجام تمرین‌ها و تکالیف هر بخش طبق دستورالعمل\nهمکاری با تیم پشتیبانی در طول مسیر\nثبت و ارائهٔ مستندات اجرای آموزش‌ها در صورت درخواست\nاعلام درخواست گارانتی حداکثر تا پایان روز هفتم",
    note:
      "تصاویر و نسخهٔ کامل ضمانت‌نامهٔ کتبی در ادامه قرار داده شده است. برای دریافت اطلاعات بیشتر می‌توانی با پشتیبانی در تماس باشی.",
  },
  results: {
    title: "نتایج و رضایت دانشجوها",
    intro:
      "این‌ها نمونه‌ای از نتایج و پیام‌های واقعی دانشجوهای دورهٔ MTP است. میزان نتیجهٔ هر فرد به اجرای آموزش‌ها و تلاش خودش بستگی دارد.",
  },
  collab: {
    title: "فرصت همکاری ۳۵ نفر منتخب",
    intro:
      "در این مرحله فقط ۳۵ نفر برای سه پروژهٔ اولیه انتخاب می‌شوند. این یک فرصت محدود برای همکاری مستقیم در پروژه‌های واقعی است.",
    body:
      "هر پروژه ۲۵ میلیون تومان ارزش‌گذاری شده و مجموعاً تا ۷۵ میلیون تومان فرصت همکاری اولیه برای افراد منتخب وجود دارد.\n\nانتخاب نهایی پس از بررسی انجام می‌شود و سرعت اقدام یکی از عوامل مؤثر در انتخاب افراد است؛ در کنار جدیت، همکاری با تیم پشتیبانی، فعال‌سازی و یادگیری آموزش‌ها و نظم در پیگیری.\n\nهیچ فردی از قبل به‌صورت قطعی جزو ۳۵ نفر اعلام نمی‌شود؛ این صفحه فقط شرایط واقعی انتخاب را توضیح می‌دهد. اگر آماده‌ای، همین حالا قدم اول را بردار.",
    criteria:
      "جدیت و آمادگی برای شروع\nسرعت در اقدام و ثبت‌نام\nهمکاری مستمر با تیم پشتیبانی\nفعال‌سازی و یادگیری کامل آموزش‌ها\nنظم و پیگیری در طول مسیر",
  },
  mtp: {
    title: "معرفی کامل بیزینس MTP",
    intro:
      "MTP مخفف «مجری تبلیغات پلاس» است؛ یک مدل کسب‌وکار اینترنتی روی خدمات موردنیاز شبکه‌های اجتماعی. میلیون‌ها پیج، کانال، فروشگاه، بلاگر، مدرس و کسب‌وکار به خدماتی مثل افزایش فالوور، افزایش ممبر، افزایش بازدید، تبلیغات و رشد پیج نیاز دارند. در MTP یاد می‌گیری چطور این خدمات را به مشتری‌ها ارائه بدی و از این طریق درآمد بسازی.",
    body:
      "تمام مسیر — حتی پیدا کردن مشتری، صحبت با مشتری و گرفتن پروژه — قدم‌به‌قدم آموزش داده می‌شود. لازم نیست خودت فالوور داشته باشی، تولید محتوا کنی، بلاگر باشی، متخصص دیجیتال مارکتینگ باشی یا سرمایهٔ سنگین داشته باشی.\n\nMTP محدود به اینستاگرام نیست؛ روی اینستاگرام، تلگرام، روبیکا، بله و سایر شبکه‌های اجتماعی داخلی و خارجی قابل اجراست. هرجا کسب‌وکارها حضور داشته باشن، بازار MTP هم وجود داره.",
    advantages:
      "بدون نیاز به مغازه، دفتر، اجاره و دکور\nبدون نیاز به خرید جنس و انبار\nبدون نیاز به فالوور یا تولید محتوا\nبدون نیاز به تخصص پیچیده یا مدرک دانشگاهی\nقابل انجام از خونه فقط با موبایل و لپ‌تاپ\nقابل انجام کنار شغل فعلی یا تحصیل\nمناسب خانم‌ها و آقایان در تمام شهرهای ایران و حتی خارج از ایران\nبازارش از قبل وجود داره و لازم نیست مردم رو قانع کنی به این خدمات نیاز دارن",
    extras:
      "دسترسی کامل و مادام‌العمر به همهٔ آموزش‌ها\nپشتیبانی در طول مسیر و گروه اختصاصی دانشجوها\nآموزش صفر تا صد پیدا کردن و جذب مشتری\nجلسات Q&A و به‌روزرسانی‌های آینده\nگواهینامهٔ معتبر پس از اتمام دوره و آزمون نهایی",
    income:
      "میزان درآمد به اجرای آموزش‌ها و فعالیت هر فرد بستگی دارد. طبق نتایج ثبت‌شدهٔ دانشجوها، خیلی‌ها در همان هفتهٔ اول درآمد اولیه‌شون رو کسب کردن و درآمد ماه اول خیلی از افراد بین ۳۰ تا ۷۰ میلیون تومان بوده. (درآمد قطعی برای همه تضمین نمی‌شه و نتیجه به میزان اجرای آموزش‌ها بستگی دارد.)",
  },
};

/* ── Default media / faqs / results (used until an admin adds rows) ─────────── */
const DEFAULT_GUARANTEE_IMAGES = [
  { id: -1, url: "/page-defaults/guarantee-1.png", caption: "نمونهٔ ضمانت‌نامهٔ کتبی" },
  { id: -2, url: "/page-defaults/guarantee-2.png", caption: "شرایط و تعهدات گارانتی" },
  { id: -3, url: "/page-defaults/guarantee-3.png", caption: "مهر و امضای آکادمی" },
];

const DEFAULT_RESULTS = [
  {
    id: -1,
    type: "text",
    name: "علی، ۳۵ ساله",
    body:
      "قبل از MTP درآمدم حدود ۱۵ میلیون تومان بود. دقیق طبق آموزش‌ها جلو رفتم و مشتری‌هامو درست پیدا کردم؛ چند ماه بعد به درآمد چندبرابری رسیدم.",
    mediaUrl: null,
  },
  {
    id: -2,
    type: "text",
    name: "مریم، ۲۸ ساله",
    body:
      "کنار کارم شروع کردم و فکر نمی‌کردم انقدر زود به نتیجه برسم. هفتهٔ اول اولین پروژه‌ام رو گرفتم.",
    mediaUrl: null,
  },
  {
    id: -3,
    type: "text",
    name: "رضا، شهرستان",
    body:
      "از یه شهر کوچیک شروع کردم و بدون هیچ تجربهٔ قبلی. آموزش‌ها واقعاً از صفر بود و پشتیبانی همیشه کنارم بود.",
    mediaUrl: null,
  },
];

const DEFAULT_MTP_FAQS = [
  {
    id: -1,
    question: "برای شروع MTP باید فالوور یا پیج داشته باشم؟",
    answer:
      "خیر. یکی از مهم‌ترین مزیت‌های MTP اینه که برای شروع هیچ نیازی به داشتن فالوور یا پیج بزرگ نداری.",
  },
  {
    id: -2,
    question: "اگر شاغل یا دانشجو باشم می‌توانم MTP را انجام دهم؟",
    answer:
      "بله. بسیاری از دانشجوهای MTP در کنار شغل یا تحصیلشان این بیزینس را انجام می‌دهند و نیاز به سرمایهٔ سنگین یا تجربهٔ قبلی نیست.",
  },
  {
    id: -3,
    question: "آیا واقعاً می‌شود از همان ۷ روز اول درآمد داشت؟",
    answer:
      "بسیاری از دانشجویان طبق نتایج ثبت‌شدهٔ مجموعه در هفتهٔ اول به درآمد اولیه رسیده‌اند. البته میزان نتیجه به اجرای آموزش‌ها بستگی دارد.",
  },
  {
    id: -4,
    question: "ضمانت دوره چگونه است؟",
    answer:
      "دوره ضمانت‌نامهٔ کتبی بازگشت وجه دارد: اگر آموزش‌ها را کامل اجرا کنی و طبق شرایط ضمانت عمل کرده باشی اما طی ۷ روز به نتیجه نرسی، امکان استفاده از گارانتی بازگشت وجه وجود دارد.",
  },
  {
    id: -5,
    question: "MTP روی چه شبکه‌های اجتماعی قابل اجراست؟",
    answer:
      "MTP محدود به اینستاگرام نیست؛ روی اینستاگرام، تلگرام، روبیکا، بله و سایر شبکه‌های اجتماعی داخلی و خارجی قابل اجراست.",
  },
];

/* ── Helpers ───────────────────────────────────────────────────────────────── */
function isSlug(s: string): s is Slug {
  return (SLUGS as readonly string[]).includes(s);
}

async function getContent(slug: Slug): Promise<Record<string, string>> {
  const defaults = DEFAULT_CONTENT[slug];
  const merged: Record<string, string> = { ...defaults };
  const prefix = `page_${slug}_`;
  const rows = await db
    .select()
    .from(siteSettingsTable)
    .where(like(siteSettingsTable.key, `${prefix}%`));
  for (const row of rows) {
    if (row.value != null) {
      merged[row.key.slice(prefix.length)] = row.value;
    }
  }
  return merged;
}

async function getMedia(slug: Slug, kind: string, adminView: boolean) {
  const conds = adminView
    ? and(eq(pageMediaTable.page, slug), eq(pageMediaTable.kind, kind))
    : and(eq(pageMediaTable.page, slug), eq(pageMediaTable.kind, kind), eq(pageMediaTable.isPublished, true));
  return db.select().from(pageMediaTable).where(conds).orderBy(asc(pageMediaTable.sortOrder), asc(pageMediaTable.id));
}

/* ── Public: GET /pages/:slug ──────────────────────────────────────────────── */
router.get("/pages/:slug", async (req, res) => {
  const slug = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;
  if (!isSlug(slug)) { res.status(404).json({ error: "صفحه یافت نشد" }); return; }

  const content = await getContent(slug);
  const ctaUrl = await getMtpCourseUrl();
  const payload: Record<string, unknown> = { slug, content, ctaUrl, ctaLabel: MTP_CTA_LABEL };

  if (slug === "guarantee") {
    const images = await getMedia("guarantee", "image", false);
    payload.media = images.length > 0 ? images : DEFAULT_GUARANTEE_IMAGES;
  }

  if (slug === "results") {
    const rows = await db
      .select()
      .from(studentResultsTable)
      .where(eq(studentResultsTable.isPublished, true))
      .orderBy(asc(studentResultsTable.sortOrder), asc(studentResultsTable.id));
    payload.results = rows.length > 0 ? rows : DEFAULT_RESULTS;
  }

  if (slug === "mtp") {
    const audio = await getMedia("mtp", "audio", false);
    const video = await getMedia("mtp", "video", false);
    payload.media = [...audio, ...video];
    const faqRows = await db
      .select()
      .from(pageFaqsTable)
      .where(and(eq(pageFaqsTable.page, "mtp"), eq(pageFaqsTable.isPublished, true)))
      .orderBy(asc(pageFaqsTable.sortOrder), asc(pageFaqsTable.id));
    payload.faqs = faqRows.length > 0 ? faqRows : DEFAULT_MTP_FAQS;
  }

  res.json(payload);
});

/* ── Admin: GET /admin/pages/:slug (includes unpublished) ──────────────────── */
router.get("/admin/pages/:slug", requireAdmin, async (req, res) => {
  const slug = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;
  if (!isSlug(slug)) { res.status(404).json({ error: "صفحه یافت نشد" }); return; }

  if (slug === "guarantee") {
    const [content, media] = await Promise.all([
      getContent(slug),
      getMedia("guarantee", "image", true),
    ]);
    res.json({ slug, content, media });
    return;
  }
  if (slug === "results") {
    const [content, results] = await Promise.all([
      getContent(slug),
      db
        .select()
        .from(studentResultsTable)
        .orderBy(asc(studentResultsTable.sortOrder), asc(studentResultsTable.id)),
    ]);
    res.json({ slug, content, results });
    return;
  }
  if (slug === "mtp") {
    const [content, audio, video, faqs] = await Promise.all([
      getContent(slug),
      getMedia("mtp", "audio", true),
      getMedia("mtp", "video", true),
      db
        .select()
        .from(pageFaqsTable)
        .where(eq(pageFaqsTable.page, "mtp"))
        .orderBy(asc(pageFaqsTable.sortOrder), asc(pageFaqsTable.id)),
    ]);
    res.json({ slug, content, media: [...audio, ...video], faqs });
    return;
  }

  const content = await getContent(slug);
  res.json({ slug, content });
});

/* ── Admin: PUT /admin/pages/:slug/content ─────────────────────────────────── */
router.put("/admin/pages/:slug/content", requireAdmin, async (req, res) => {
  const slug = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;
  if (!isSlug(slug)) { res.status(404).json({ error: "صفحه یافت نشد" }); return; }

  const body = (req.body ?? {}) as Record<string, string>;
  const allowed = Object.keys(DEFAULT_CONTENT[slug]);
  for (const field of allowed) {
    if (!(field in body)) continue;
    const key = `page_${slug}_${field}`;
    const value = body[field] ?? "";
    const existing = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.key, key)).limit(1);
    if (existing.length > 0) {
      await db.update(siteSettingsTable).set({ value, updatedAt: new Date() }).where(eq(siteSettingsTable.key, key));
    } else {
      await db.insert(siteSettingsTable).values({ key, value });
    }
  }
  res.json({ content: await getContent(slug) });
});

/* ── Admin: page media CRUD ────────────────────────────────────────────────── */
router.post("/admin/page-media", requireAdmin, async (req, res) => {
  const { page, kind, url, caption, sortOrder, isPublished } = req.body ?? {};
  if (!page || !kind || !url) { res.status(400).json({ error: "page و kind و url الزامی است" }); return; }
  if (!isSlug(page)) { res.status(400).json({ error: "page نامعتبر است" }); return; }
  if (!(MEDIA_KINDS as readonly string[]).includes(kind)) { res.status(400).json({ error: "kind نامعتبر است" }); return; }
  const [row] = await db
    .insert(pageMediaTable)
    .values({
      page,
      kind,
      url,
      caption: caption ?? null,
      sortOrder: Number(sortOrder) || 0,
      isPublished: isPublished !== false,
    })
    .returning();
  res.json(row);
});

router.put("/admin/page-media/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { url, caption, sortOrder, isPublished } = req.body ?? {};
  const patch: Record<string, unknown> = {};
  if (url !== undefined) patch.url = url;
  if (caption !== undefined) patch.caption = caption;
  if (sortOrder !== undefined) patch.sortOrder = Number(sortOrder) || 0;
  if (isPublished !== undefined) patch.isPublished = !!isPublished;
  const [row] = await db.update(pageMediaTable).set(patch).where(eq(pageMediaTable.id, id)).returning();
  res.json(row);
});

router.delete("/admin/page-media/:id", requireAdmin, async (req, res) => {
  await db.delete(pageMediaTable).where(eq(pageMediaTable.id, Number(req.params.id)));
  res.json({ ok: true });
});

/* ── Admin: page faqs CRUD ─────────────────────────────────────────────────── */
router.post("/admin/page-faqs", requireAdmin, async (req, res) => {
  const { page, question, answer, sortOrder, isPublished } = req.body ?? {};
  if (!page || !question || !answer) { res.status(400).json({ error: "page و question و answer الزامی است" }); return; }
  if (!isSlug(page)) { res.status(400).json({ error: "page نامعتبر است" }); return; }
  const [row] = await db
    .insert(pageFaqsTable)
    .values({
      page,
      question,
      answer,
      sortOrder: Number(sortOrder) || 0,
      isPublished: isPublished !== false,
    })
    .returning();
  res.json(row);
});

router.put("/admin/page-faqs/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { question, answer, sortOrder, isPublished } = req.body ?? {};
  const patch: Record<string, unknown> = {};
  if (question !== undefined) patch.question = question;
  if (answer !== undefined) patch.answer = answer;
  if (sortOrder !== undefined) patch.sortOrder = Number(sortOrder) || 0;
  if (isPublished !== undefined) patch.isPublished = !!isPublished;
  const [row] = await db.update(pageFaqsTable).set(patch).where(eq(pageFaqsTable.id, id)).returning();
  res.json(row);
});

router.delete("/admin/page-faqs/:id", requireAdmin, async (req, res) => {
  await db.delete(pageFaqsTable).where(eq(pageFaqsTable.id, Number(req.params.id)));
  res.json({ ok: true });
});

/* ── Admin: student results CRUD ───────────────────────────────────────────── */
router.post("/admin/student-results", requireAdmin, async (req, res) => {
  const { type, name, body, mediaUrl, sortOrder, isPublished } = req.body ?? {};
  if (!type) { res.status(400).json({ error: "type الزامی است" }); return; }
  const [row] = await db
    .insert(studentResultsTable)
    .values({
      type,
      name: name ?? null,
      body: body ?? null,
      mediaUrl: mediaUrl ?? null,
      sortOrder: Number(sortOrder) || 0,
      isPublished: isPublished !== false,
    })
    .returning();
  res.json(row);
});

router.put("/admin/student-results/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { type, name, body, mediaUrl, sortOrder, isPublished } = req.body ?? {};
  const patch: Record<string, unknown> = {};
  if (type !== undefined) patch.type = type;
  if (name !== undefined) patch.name = name;
  if (body !== undefined) patch.body = body;
  if (mediaUrl !== undefined) patch.mediaUrl = mediaUrl;
  if (sortOrder !== undefined) patch.sortOrder = Number(sortOrder) || 0;
  if (isPublished !== undefined) patch.isPublished = !!isPublished;
  const [row] = await db.update(studentResultsTable).set(patch).where(eq(studentResultsTable.id, id)).returning();
  res.json(row);
});

router.delete("/admin/student-results/:id", requireAdmin, async (req, res) => {
  await db.delete(studentResultsTable).where(eq(studentResultsTable.id, Number(req.params.id)));
  res.json({ ok: true });
});

export default router;
