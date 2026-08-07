import { Router } from "express";
import { db } from "@workspace/db";
import {
  kbFaqsTable, kbObjectionsTable, kbProofAssetsTable,
  kbSuccessStoriesTable, kbKnowledgeItemsTable,
} from "@workspace/db";
import { eq, desc, and, ilike, or } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

// ── FAQ Bank ────────────────────────────────────────────────────────────────

router.get("/admin/kb/faqs", requireAdmin, async (req, res) => {
  const { category, product, isPublished } = req.query as Record<string, string>;
  let query = db.select().from(kbFaqsTable);
  const conditions = [];
  if (category) conditions.push(eq(kbFaqsTable.category, category));
  if (product) conditions.push(eq(kbFaqsTable.product, product));
  if (isPublished !== undefined) conditions.push(eq(kbFaqsTable.isPublished, isPublished === "true"));
  const rows = conditions.length
    ? await db.select().from(kbFaqsTable).where(and(...conditions)).orderBy(desc(kbFaqsTable.updatedAt))
    : await db.select().from(kbFaqsTable).orderBy(desc(kbFaqsTable.updatedAt));
  res.json(rows);
});

router.post("/admin/kb/faqs", requireAdmin, async (req, res) => {
  const [row] = await db.insert(kbFaqsTable).values(req.body).returning();
  res.status(201).json(row);
});

router.put("/admin/kb/faqs/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string);
  const [row] = await db.update(kbFaqsTable)
    .set({ ...req.body, updatedAt: new Date() })
    .where(eq(kbFaqsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  res.json(row);
});

router.delete("/admin/kb/faqs/:id", requireAdmin, async (req, res) => {
  await db.delete(kbFaqsTable).where(eq(kbFaqsTable.id, parseInt(req.params.id as string)));
  res.json({ ok: true });
});

// ── Objections ───────────────────────────────────────────────────────────────

router.get("/admin/kb/objections", requireAdmin, async (req, res) => {
  const rows = await db.select().from(kbObjectionsTable).orderBy(desc(kbObjectionsTable.updatedAt));
  res.json(rows);
});

router.post("/admin/kb/objections", requireAdmin, async (req, res) => {
  const [row] = await db.insert(kbObjectionsTable).values(req.body).returning();
  res.status(201).json(row);
});

router.put("/admin/kb/objections/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string);
  const [row] = await db.update(kbObjectionsTable)
    .set({ ...req.body, updatedAt: new Date() })
    .where(eq(kbObjectionsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  res.json(row);
});

router.delete("/admin/kb/objections/:id", requireAdmin, async (req, res) => {
  await db.delete(kbObjectionsTable).where(eq(kbObjectionsTable.id, parseInt(req.params.id as string)));
  res.json({ ok: true });
});

// ── Proof Assets ─────────────────────────────────────────────────────────────

router.get("/admin/kb/proof-assets", requireAdmin, async (req, res) => {
  const { product, proofType, visibility } = req.query as Record<string, string>;
  const conditions = [];
  if (product) conditions.push(eq(kbProofAssetsTable.product, product));
  if (proofType) conditions.push(eq(kbProofAssetsTable.proofType, proofType));
  if (visibility) conditions.push(eq(kbProofAssetsTable.visibility, visibility));
  const rows = conditions.length
    ? await db.select().from(kbProofAssetsTable).where(and(...conditions)).orderBy(kbProofAssetsTable.priority)
    : await db.select().from(kbProofAssetsTable).orderBy(kbProofAssetsTable.priority);
  res.json(rows);
});

router.post("/admin/kb/proof-assets", requireAdmin, async (req, res) => {
  const [row] = await db.insert(kbProofAssetsTable).values(req.body).returning();
  res.status(201).json(row);
});

router.put("/admin/kb/proof-assets/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string);
  const [row] = await db.update(kbProofAssetsTable)
    .set({ ...req.body, updatedAt: new Date() })
    .where(eq(kbProofAssetsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  res.json(row);
});

router.delete("/admin/kb/proof-assets/:id", requireAdmin, async (req, res) => {
  await db.delete(kbProofAssetsTable).where(eq(kbProofAssetsTable.id, parseInt(req.params.id as string)));
  res.json({ ok: true });
});

// ── Success Stories ──────────────────────────────────────────────────────────

router.get("/admin/kb/success-stories", requireAdmin, async (req, res) => {
  const { product, resultType, isVerified } = req.query as Record<string, string>;
  const conditions = [];
  if (product) conditions.push(eq(kbSuccessStoriesTable.product, product));
  if (resultType) conditions.push(eq(kbSuccessStoriesTable.resultType, resultType));
  if (isVerified !== undefined) conditions.push(eq(kbSuccessStoriesTable.isVerified, isVerified === "true"));
  const rows = conditions.length
    ? await db.select().from(kbSuccessStoriesTable).where(and(...conditions)).orderBy(desc(kbSuccessStoriesTable.successScore))
    : await db.select().from(kbSuccessStoriesTable).orderBy(desc(kbSuccessStoriesTable.successScore));
  res.json(rows);
});

router.post("/admin/kb/success-stories", requireAdmin, async (req, res) => {
  const body = req.body as typeof kbSuccessStoriesTable.$inferInsert;
  // Auto-compute success score
  body.successScore = computeSuccessScore(body);
  const [row] = await db.insert(kbSuccessStoriesTable).values(body).returning();
  res.status(201).json(row);
});

router.put("/admin/kb/success-stories/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string);
  const body = req.body as typeof kbSuccessStoriesTable.$inferInsert;
  body.successScore = computeSuccessScore(body);
  const [row] = await db.update(kbSuccessStoriesTable)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(kbSuccessStoriesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  res.json(row);
});

router.delete("/admin/kb/success-stories/:id", requireAdmin, async (req, res) => {
  await db.delete(kbSuccessStoriesTable).where(eq(kbSuccessStoriesTable.id, parseInt(req.params.id as string)));
  res.json({ ok: true });
});

// ── General Knowledge Items ──────────────────────────────────────────────────

router.get("/admin/kb/items", requireAdmin, async (req, res) => {
  const { category, product, accessLevel } = req.query as Record<string, string>;
  const conditions = [];
  if (category) conditions.push(eq(kbKnowledgeItemsTable.category, category));
  if (product) conditions.push(eq(kbKnowledgeItemsTable.product, product));
  if (accessLevel) conditions.push(eq(kbKnowledgeItemsTable.accessLevel, accessLevel));
  const rows = conditions.length
    ? await db.select().from(kbKnowledgeItemsTable).where(and(...conditions)).orderBy(kbKnowledgeItemsTable.priority)
    : await db.select().from(kbKnowledgeItemsTable).orderBy(kbKnowledgeItemsTable.priority);
  res.json(rows);
});

router.post("/admin/kb/items", requireAdmin, async (req, res) => {
  const [row] = await db.insert(kbKnowledgeItemsTable).values(req.body).returning();
  res.status(201).json(row);
});

router.put("/admin/kb/items/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string);
  const [row] = await db.update(kbKnowledgeItemsTable)
    .set({ ...req.body, updatedAt: new Date() })
    .where(eq(kbKnowledgeItemsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "not found" }); return; }
  res.json(row);
});

router.delete("/admin/kb/items/:id", requireAdmin, async (req, res) => {
  await db.delete(kbKnowledgeItemsTable).where(eq(kbKnowledgeItemsTable.id, parseInt(req.params.id as string)));
  res.json({ ok: true });
});

// ── Retrieval Engine (Section 19.3) ─────────────────────────────────────────

/**
 * Retrieve the most relevant KB context for a given message and intent.
 * Returns a formatted string block ready for injection into a system prompt.
 * accessLevel: "sales" (Sara) | "support" (ChatBot student mode) | "all"
 */
export async function retrieveKBContext(
  userMessage: string,
  intent: "trust" | "price" | "guarantee" | "risk" | "saturation" | "general",
  product?: string,
  accessLevel: "sales" | "support" | "all" = "sales",
): Promise<string> {
  try {
    const msgLower = userMessage.toLowerCase();

    // 1. Relevant FAQs
    const faqConditions = [eq(kbFaqsTable.isPublished, true)];
    if (accessLevel !== "all") {
      faqConditions.push(
        or(eq(kbFaqsTable.accessLevel, accessLevel), eq(kbFaqsTable.accessLevel, "sales"))!,
      );
    }
    const faqs = await db.select().from(kbFaqsTable).where(and(...faqConditions)).limit(20);
    const matchedFaqs = faqs
      .filter(f => {
        const haystack = `${f.question} ${f.keywords ?? ""} ${f.tags ?? ""}`.toLowerCase();
        return msgLower.split(/\s+/).some(word => word.length > 2 && haystack.includes(word));
      })
      .slice(0, 3);

    // 2. Relevant objection handler
    const objections = await db.select().from(kbObjectionsTable)
      .where(and(eq(kbObjectionsTable.isPublished, true), eq(kbObjectionsTable.accessLevel, "sales")))
      .limit(20);
    const matchedObjection = objections.find(o => {
      const haystack = `${o.objectionName} ${o.objectionType}`.toLowerCase();
      return (
        (intent !== "general" && o.objectionType === intent) ||
        msgLower.includes(o.objectionType)
      );
    });

    // 3. Proof assets (sorted by priority asc + objection tag match)
    const proofConds = [eq(kbProofAssetsTable.isPublished, true)];
    if (product) proofConds.push(eq(kbProofAssetsTable.product, product));
    const proofAssets = await db.select().from(kbProofAssetsTable)
      .where(and(...proofConds))
      .orderBy(kbProofAssetsTable.priority)
      .limit(10);
    const matchedProofs = proofAssets
      .filter(p => {
        const tags = p.objectionTags ? (JSON.parse(p.objectionTags) as string[]) : [];
        return intent === "general" || tags.includes(intent);
      })
      .slice(0, 2);

    // 4. Success stories matching audience/objection
    const storyConds = [eq(kbSuccessStoriesTable.isPublished, true), eq(kbSuccessStoriesTable.isVerified, true)];
    if (product) storyConds.push(eq(kbSuccessStoriesTable.product, product));
    const stories = await db.select().from(kbSuccessStoriesTable)
      .where(and(...storyConds))
      .orderBy(desc(kbSuccessStoriesTable.successScore))
      .limit(10);
    const matchedStories = stories
      .filter(s => {
        const objTags = s.objectionTags ? (JSON.parse(s.objectionTags) as string[]) : [];
        return intent === "general" || objTags.includes(intent);
      })
      .slice(0, 2);

    // 5. General knowledge items
    const itemConds = [eq(kbKnowledgeItemsTable.isPublished, true)];
    if (accessLevel !== "all") {
      itemConds.push(
        or(eq(kbKnowledgeItemsTable.accessLevel, accessLevel), eq(kbKnowledgeItemsTable.accessLevel, "sales"))!,
      );
    }
    const items = await db.select().from(kbKnowledgeItemsTable)
      .where(and(...itemConds))
      .orderBy(kbKnowledgeItemsTable.priority)
      .limit(30);
    const matchedItems = items
      .filter(item => {
        const haystack = `${item.title} ${item.keywords ?? ""} ${item.tags ?? ""} ${item.content.slice(0, 100)}`.toLowerCase();
        return msgLower.split(/\s+/).some(word => word.length > 2 && haystack.includes(word));
      })
      .slice(0, 2);

    // Build the context block
    const parts: string[] = [];

    if (matchedFaqs.length) {
      parts.push("سوالات متداول مرتبط:");
      for (const f of matchedFaqs) {
        parts.push(`س: ${f.question}\nج: ${f.shortAnswer}`);
      }
    }

    if (matchedObjection) {
      parts.push(`پاسخ اعتراض "${matchedObjection.objectionName}":\n${matchedObjection.responseFramework}`);
    }

    if (matchedProofs.length) {
      parts.push("مدارک اعتمادسازی:");
      for (const p of matchedProofs) {
        parts.push(`• ${p.title}${p.description ? ": " + p.description : ""}`);
      }
    }

    if (matchedStories.length) {
      parts.push("داستان‌های موفقیت مرتبط:");
      for (const s of matchedStories) {
        parts.push(`• ${s.studentName}${s.product ? " (" + s.product + ")" : ""}: ${s.results}`);
      }
    }

    if (matchedItems.length) {
      parts.push("اطلاعات مرتبط:");
      for (const item of matchedItems) {
        parts.push(`[${item.title}]\n${item.content.slice(0, 300)}`);
      }
    }

    return parts.length ? parts.join("\n\n") : "";
  } catch (err) {
    logger.warn({ err }, "[KB] retrieveKBContext failed");
    return "";
  }
}

// ── Stats endpoint ───────────────────────────────────────────────────────────

router.get("/admin/kb/stats", requireAdmin, async (_req, res) => {
  const [faqs, objections, proofs, stories, items] = await Promise.all([
    db.select().from(kbFaqsTable),
    db.select().from(kbObjectionsTable),
    db.select().from(kbProofAssetsTable),
    db.select().from(kbSuccessStoriesTable),
    db.select().from(kbKnowledgeItemsTable),
  ]);
  res.json({
    faqs: { total: faqs.length, published: faqs.filter(r => r.isPublished).length },
    objections: { total: objections.length, published: objections.filter(r => r.isPublished).length },
    proofAssets: { total: proofs.length, published: proofs.filter(r => r.isPublished).length },
    successStories: { total: stories.length, verified: stories.filter(r => r.isVerified).length, published: stories.filter(r => r.isPublished).length },
    knowledgeItems: { total: items.length, published: items.filter(r => r.isPublished).length },
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function computeSuccessScore(story: Partial<typeof kbSuccessStoriesTable.$inferInsert>): number {
  let score = 0;
  // Proof quality
  if (story.proofQuality === "platinum") score += 40;
  else if (story.proofQuality === "gold") score += 30;
  else if (story.proofQuality === "silver") score += 20;
  else score += 10;
  // Has objection tags (useful for sales)
  const objTags = story.objectionTags ? (JSON.parse(story.objectionTags) as string[]) : [];
  score += Math.min(30, objTags.length * 10);
  // Is verified
  if (story.isVerified) score += 20;
  // Has results text
  if (story.results && story.results.length > 50) score += 10;
  return Math.min(100, score);
}

export default router;
