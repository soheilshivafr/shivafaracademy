import { Router } from "express";
import { db } from "@workspace/db";
import {
  assessmentsTable,
  assessmentIndicesTable,
  assessmentQuestionsTable,
  assessmentSessionsTable,
  assessmentContactLeadsTable,
  assessmentRulesTable,
  ordersTable,
  usersTable,
  productsTable,
  userLeadProfilesTable,
  leadEventsTable,
  advisorRequestsTable,
  assessmentAiReportConfigsTable,
} from "@workspace/db";
import { eq, and, desc, asc, sql, isNull } from "drizzle-orm";
import { requireUser, requireAdmin, optionalAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import type { QuestionOption } from "@workspace/db";
import { ScoringEngine } from "../lib/scoring-engine";
import { RulesEngine } from "../lib/rules-engine";
import { RecommendationEngine } from "../lib/recommendation-engine";
import {
  buildAssessmentScoringInput,
  evaluateAssessmentRecommendations,
  hydrateCatalogTargets,
} from "../lib/recommendation-service";
import { buildGrowthRoadmap } from "../lib/growth-roadmap";
import type { Recommendation } from "@workspace/db";
import {
  buildProfessionalReportInput,
  buildProfessionalReportPrompt,
  buildRuleBasedProfessionalReport,
  getEffectiveProfessionalReportConfig,
  getProfessionalReportConfig,
  getStoredProfessionalReport,
} from "../lib/professional-report";

const router = Router();

// ─── Professional AI Report data layer (v58) ─────────────────────────────────
// These endpoints only read/configure data and build deterministic prompts.
// They intentionally do not call OpenAI and do not create purchases.
router.get("/assessments/:id/professional-report/config", async (req, res) => {
  const assessmentId = parseInt(req.params.id);
  if (isNaN(assessmentId)) {
    res.status(400).json({ error: "شناسه نامعتبر" });
    return;
  }

  const config = await getProfessionalReportConfig(assessmentId);
  if (!config) {
    res.status(404).json({ error: "تست یافت نشد" });
    return;
  }

  res.json({
    assessmentId: config.assessmentId,
    isEnabled: config.isEnabled,
    title: config.title,
    salesDescription: config.salesDescription,
    valueDescription: config.valueDescription,
    features: config.features,
    price: config.price,
  });
});

router.get("/admin/assessments/:id/professional-report-config", requireAdmin, async (req, res) => {
  const assessmentId = parseInt(req.params.id);
  if (isNaN(assessmentId)) {
    res.status(400).json({ error: "شناسه نامعتبر" });
    return;
  }

  const config = await getProfessionalReportConfig(assessmentId);
  if (!config) {
    res.status(404).json({ error: "تست یافت نشد" });
    return;
  }
  res.json(config);
});

router.put("/admin/assessments/:id/professional-report-config", requireAdmin, async (req, res) => {
  const assessmentId = parseInt(req.params.id);
  if (isNaN(assessmentId)) {
    res.status(400).json({ error: "شناسه نامعتبر" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const stringField = (key: string, fallback: string): string =>
    typeof body[key] === "string" ? body[key] as string : fallback;
  const integerField = (key: string, fallback: number): number =>
    typeof body[key] === "number" && Number.isInteger(body[key]) ? body[key] as number : fallback;
  const numberField = (key: string, fallback: number): number =>
    typeof body[key] === "number" && Number.isFinite(body[key]) ? body[key] as number : fallback;
  const features = Array.isArray(body.features)
    ? body.features.filter((feature): feature is string => typeof feature === "string")
    : [];

  if (typeof body.isEnabled !== "boolean") {
    res.status(400).json({ error: "isEnabled الزامی است" });
    return;
  }

  const existing = await getProfessionalReportConfig(assessmentId);
  if (!existing) {
    res.status(404).json({ error: "تست یافت نشد" });
    return;
  }

  const values = {
    assessmentId,
    isEnabled: body.isEnabled,
    title: stringField("title", existing.title),
    salesDescription: stringField("salesDescription", existing.salesDescription),
    valueDescription: stringField("valueDescription", existing.valueDescription),
    features,
    price: Math.max(0, integerField("price", existing.price)),
    prompt: stringField("prompt", existing.prompt),
    model: stringField("model", existing.model),
    maxTokens: Math.max(1, integerField("maxTokens", existing.maxTokens)),
    temperature: Math.min(2, Math.max(0, numberField("temperature", existing.temperature))),
    tone: stringField("tone", existing.tone),
    language: stringField("language", existing.language),
    promptVersion: stringField("promptVersion", existing.promptVersion),
    updatedAt: new Date(),
  };

  const [saved] = await db
    .insert(assessmentAiReportConfigsTable)
    .values(values)
    .onConflictDoUpdate({
      target: assessmentAiReportConfigsTable.assessmentId,
      set: values,
    })
    .returning();

  res.json(getEffectiveProfessionalReportConfig(
    { id: assessmentId, hasAiReport: saved.isEnabled, aiReportPrice: saved.price },
    saved,
  ));
});

router.post("/admin/assessments/professional-report/prompt", requireAdmin, async (req, res) => {
  const sessionId = Number((req.body as { sessionId?: unknown }).sessionId);
  if (!Number.isInteger(sessionId)) {
    res.status(400).json({ error: "sessionId الزامی است" });
    return;
  }

  const prepared = await buildProfessionalReportInput(sessionId);
  if (!prepared) {
    res.status(404).json({ error: "تست تکمیل‌شده یافت نشد" });
    return;
  }

  res.json({
    sessionId,
    config: prepared.config,
    input: prepared.input,
    prompt: buildProfessionalReportPrompt(prepared.config, prepared.input),
    preview: buildRuleBasedProfessionalReport(prepared.input),
  });
});

router.get("/assessments/professional-report/preview/:sessionId", optionalAuth, async (req, res) => {
  const sessionId = parseInt(req.params.sessionId);
  if (isNaN(sessionId)) {
    res.status(400).json({ error: "شناسه نامعتبر" });
    return;
  }

  const prepared = await buildProfessionalReportInput(sessionId);
  if (!prepared) {
    res.status(404).json({ error: "نتیجه تکمیل‌شده یافت نشد" });
    return;
  }

  res.json({
    sessionId,
    assessmentId: prepared.input.assessment.id,
    config: {
      title: prepared.config.title,
      valueDescription: prepared.config.valueDescription,
      features: prepared.config.features,
      price: prepared.config.price,
    },
    preview: buildRuleBasedProfessionalReport(prepared.input),
  });
});

router.get("/assessments/professional-report/:sessionId", requireUser, async (req, res) => {
  const sessionId = parseInt(req.params.sessionId);
  if (isNaN(sessionId)) {
    res.status(400).json({ error: "شناسه نامعتبر" });
    return;
  }

  const [session] = await db
    .select({ userId: assessmentSessionsTable.userId })
    .from(assessmentSessionsTable)
    .where(eq(assessmentSessionsTable.id, sessionId))
    .limit(1);
  if (!session || session.userId !== req.user!.userId) {
    res.status(404).json({ error: "گزارش یافت نشد" });
    return;
  }

  const report = await getStoredProfessionalReport(sessionId);
  if (!report) {
    res.status(404).json({ error: "گزارش هنوز ایجاد نشده است" });
    return;
  }
  res.json(report);
});

// ─── Rate limit para generación de AI report ─────────────────────────────────
const aiReportRateMap = new Map<string, { count: number; resetAt: number }>();
function checkAiRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = aiReportRateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    aiReportRateMap.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

// ─── Score Calculator (v56 — ScoringEngine) ─────────────────────────────────
// منطق امتیازدهی به artifacts/api-server/src/lib/scoring-engine.ts منتقل شده
// از ScoringEngine.compute() در submit endpoint استفاده کنید

// ─── Public: List assessments ─────────────────────────────────────────────────
router.get("/assessments", async (_req, res) => {
  const items = await db
    .select({
      id: assessmentsTable.id,
      title: assessmentsTable.title,
      slug: assessmentsTable.slug,
      shortDescription: assessmentsTable.shortDescription,
      coverImage: assessmentsTable.coverImage,
      estimatedMinutes: assessmentsTable.estimatedMinutes,
      category: assessmentsTable.category,
      requiresAuth: assessmentsTable.requiresAuth,
      hasAiReport: assessmentsTable.hasAiReport,
      aiReportPrice: assessmentsTable.aiReportPrice,
      participantCount: assessmentsTable.participantCount,
      sortOrder: assessmentsTable.sortOrder,
      productId: assessmentsTable.productId,
      productTitle: productsTable.title,
    })
    .from(assessmentsTable)
    .leftJoin(productsTable, eq(assessmentsTable.productId, productsTable.id))
    .where(eq(assessmentsTable.isPublished, true))
    .orderBy(asc(assessmentsTable.sortOrder));

  // attach questionCount
  const counts = await db
    .select({
      assessmentId: assessmentQuestionsTable.assessmentId,
      cnt: sql<number>`count(*)::int`,
    })
    .from(assessmentQuestionsTable)
    .where(eq(assessmentQuestionsTable.isActive, true))
    .groupBy(assessmentQuestionsTable.assessmentId);

  const countMap: Record<number, number> = {};
  for (const c of counts) countMap[c.assessmentId] = c.cnt;

  res.json(items.map((a) => ({ ...a, questionCount: countMap[a.id] ?? 0 })));
});

// ─── Public: Get single assessment with questions ─────────────────────────────
router.get("/assessments/:slug", optionalAuth, async (req, res) => {
  const { slug } = req.params;
  const [assessment] = await db
    .select()
    .from(assessmentsTable)
    .where(and(eq(assessmentsTable.slug, slug), eq(assessmentsTable.isPublished, true)))
    .limit(1);

  if (!assessment) { res.status(404).json({ error: "تست یافت نشد" }); return; }

  // If requires auth and user not logged in, return meta only
  if (assessment.requiresAuth && !req.user) {
    res.json({ ...assessment, questions: null, requiresLogin: true });
    return;
  }

  const questions = await db
    .select()
    .from(assessmentQuestionsTable)
    .where(and(
      eq(assessmentQuestionsTable.assessmentId, assessment.id),
      eq(assessmentQuestionsTable.isActive, true),
    ))
    .orderBy(asc(assessmentQuestionsTable.sortOrder));

  // Strip scoring data (scores, weights, leadScore, questionGoal) before sending to frontend
  const safeQuestions = questions.map((q) => {
    const opts = (q.options as QuestionOption[] || []).map(({ id, label }) => ({ id, label }));
    return {
      id: q.id,
      type: q.type,
      title: q.title,
      description: q.description,
      image: q.image,
      sortOrder: q.sortOrder,
      isRequired: q.isRequired,
      options: opts,
      conditionalLogic: q.conditionalLogic,
      specialMessage: q.specialMessage,
      answerLabel: q.answerLabel,
      scaleMinLabel: q.scaleMinLabel,
      scaleMaxLabel: q.scaleMaxLabel,
      // questionGoal is intentionally NOT included — admin-only
    };
  });

  const indices = await db
    .select({ id: assessmentIndicesTable.id, name: assessmentIndicesTable.name })
    .from(assessmentIndicesTable)
    .where(eq(assessmentIndicesTable.assessmentId, assessment.id))
    .orderBy(asc(assessmentIndicesTable.sortOrder));

  res.json({ ...assessment, questions: safeQuestions, indices, requiresLogin: false });
});

// ─── Public: Start session ────────────────────────────────────────────────────
router.post("/assessments/:slug/start", optionalAuth, async (req, res) => {
  const { slug } = req.params;
  const [assessment] = await db
    .select({ id: assessmentsTable.id, requiresAuth: assessmentsTable.requiresAuth })
    .from(assessmentsTable)
    .where(and(eq(assessmentsTable.slug, slug), eq(assessmentsTable.isPublished, true)))
    .limit(1);

  if (!assessment) { res.status(404).json({ error: "تست یافت نشد" }); return; }
  if (assessment.requiresAuth && !req.user) {
    res.status(401).json({ error: "برای شروع این تست باید وارد حساب کاربری خود شوید" });
    return;
  }

  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "";
  const { deviceFingerprint } = req.body as { deviceFingerprint?: string };

  const [session] = await db
    .insert(assessmentSessionsTable)
    .values({
      assessmentId: assessment.id,
      userId: req.user?.userId ?? null,
      deviceFingerprint: deviceFingerprint ?? null,
      ipAddress: ip,
    })
    .returning({ id: assessmentSessionsTable.id });

  res.json({ sessionId: session.id });
});

// ─── Public: Submit answers ───────────────────────────────────────────────────
router.post("/assessments/:slug/submit", optionalAuth, async (req, res) => {
  const { slug } = req.params;
  const { sessionId, answers, contactInfo } = req.body as {
    sessionId: number;
    answers: Record<string, unknown>;
    contactInfo?: { name: string; phone: string };
  };

  const [assessment] = await db
    .select()
    .from(assessmentsTable)
    .where(and(eq(assessmentsTable.slug, slug), eq(assessmentsTable.isPublished, true)))
    .limit(1);

  if (!assessment) { res.status(404).json({ error: "تست یافت نشد" }); return; }

  // Validate session
  const [session] = await db
    .select()
    .from(assessmentSessionsTable)
    .where(eq(assessmentSessionsTable.id, sessionId))
    .limit(1);

  if (!session || session.assessmentId !== assessment.id) {
    res.status(400).json({ error: "نشست نامعتبر" });
    return;
  }
  if (session.completedAt) {
    res.status(400).json({ error: "این تست قبلاً ارسال شده است" });
    return;
  }

  const questions = await db
    .select()
    .from(assessmentQuestionsTable)
    .where(and(
      eq(assessmentQuestionsTable.assessmentId, assessment.id),
      eq(assessmentQuestionsTable.isActive, true),
    ));

  const indices = await db
    .select()
    .from(assessmentIndicesTable)
    .where(eq(assessmentIndicesTable.assessmentId, assessment.id));

  // موتور امتیازدهی v56
  const globalLevels = ScoringEngine.parseLevels((assessment as Record<string, unknown>).globalLevels);
  const scoringResult = ScoringEngine.compute(questions, indices, answers, globalLevels.length ? globalLevels : null);
  const indexScores = ScoringEngine.toLegacyIndexScores(scoringResult);
  const leadScoreImpact = scoringResult.leadScoreImpact;

  // Update session
  await db.update(assessmentSessionsTable)
    .set({
      completedAt: new Date(),
      answers,
      indexScores,
      totalLeadScoreImpact: leadScoreImpact,
      finalScore: scoringResult.finalScore,
      scoringVersion: scoringResult.scoringVersion,
      userId: req.user?.userId ?? session.userId,
    })
    .where(eq(assessmentSessionsTable.id, sessionId));

  // Increment participant count
  await db.update(assessmentsTable)
    .set({ participantCount: sql`${assessmentsTable.participantCount} + 1` })
    .where(eq(assessmentsTable.id, assessment.id));

  // Save contact lead if provided
  if (assessment.collectContactInfo && contactInfo?.name && contactInfo?.phone) {
    await db.insert(assessmentContactLeadsTable).values({
      assessmentId: assessment.id,
      sessionId: sessionId,
      userId: req.user?.userId ?? null,
      name: contactInfo.name,
      phone: contactInfo.phone,
      interestedProductId: assessment.productId ?? null,
    });

    // Also add to advisor_requests for call center visibility
    await db.insert(advisorRequestsTable).values({
      userId: req.user?.userId ?? null,
      name: contactInfo.name,
      phone: contactInfo.phone,
      interestedProduct: assessment.title,
      source: "assessment",
      status: "new",
    });
  }

  // Update user lead score if authenticated
  if (req.user?.userId && leadScoreImpact !== 0) {
    try {
      const uid = req.user.userId;
      const [existing] = await db
        .select({ leadScore: userLeadProfilesTable.leadScore })
        .from(userLeadProfilesTable)
        .where(eq(userLeadProfilesTable.userId, uid))
        .limit(1);

      if (existing) {
        const newScore = Math.min(100, Math.max(0, (existing.leadScore ?? 0) + leadScoreImpact));
        await db.update(userLeadProfilesTable)
          .set({ leadScore: newScore, updatedAt: new Date() })
          .where(eq(userLeadProfilesTable.userId, uid));
      } else {
        await db.insert(userLeadProfilesTable).values({
          userId: uid,
          leadScore: Math.min(100, Math.max(0, leadScoreImpact)),
        });
      }

      await db.insert(leadEventsTable).values({
        userId: uid,
        eventType: "ASSESSMENT_COMPLETED",
        productName: assessment.title,
        metadata: JSON.stringify({ assessmentId: assessment.id, sessionId, leadScoreImpact }),
      });
    } catch (err) {
      logger.error({ err }, "assessment: lead score update error");
    }
  }

  // Rules Engine v57 — ارزیابی قوانین
  let rulesResult: { matchedRules: unknown[]; merged: unknown } | null = null;
  let recommendations: Recommendation[] = [];
  try {
    const rules = await db
      .select()
      .from(assessmentRulesTable)
      .where(and(
        eq(assessmentRulesTable.assessmentId, assessment.id),
        eq(assessmentRulesTable.isActive, true),
      ))
      .orderBy(asc(assessmentRulesTable.sortOrder));

    if (rules.length > 0) {
      const evaluation = RecommendationEngine.evaluate(rules, {
        scoringResult,
        answers,
        currentLeadScore: 0,
      });
      rulesResult = evaluation.rulesResult;
      recommendations = await hydrateCatalogTargets(evaluation.recommendations);
    }
  } catch (err) {
    logger.error({ err }, "rules engine evaluation error");
  }

  res.json({
    sessionId,
    indexScores,
    finalScore: scoringResult.finalScore,
    finalLevel: scoringResult.finalLevel,
    indexResults: scoringResult.indexResults,
    hasAiReport: assessment.hasAiReport,
    aiReportPrice: assessment.aiReportPrice,
    endText: assessment.endText,
    // Rules Engine results (null اگر قانونی تعریف نشده)
    rulesResult: rulesResult ?? null,
    // Recommendation Engine output is always an array. No matched rule means
    // no recommendations; there is no fallback catalog or hard-coded CTA.
    recommendations,
  });
});

// ─── Public: Get result ───────────────────────────────────────────────────────
router.get("/assessments/result/:sessionId", optionalAuth, async (req, res) => {
  const sid = parseInt(req.params.sessionId);
  if (isNaN(sid)) { res.status(400).json({ error: "شناسه نامعتبر" }); return; }

  const [session] = await db
    .select()
    .from(assessmentSessionsTable)
    .where(eq(assessmentSessionsTable.id, sid))
    .limit(1);

  if (!session || !session.completedAt) {
    res.status(404).json({ error: "نتیجه یافت نشد" }); return;
  }

  const [assessment] = await db
    .select({
      id: assessmentsTable.id,
      title: assessmentsTable.title,
      slug: assessmentsTable.slug,
      endText: assessmentsTable.endText,
      globalLevels: assessmentsTable.globalLevels,
      hasAiReport: assessmentsTable.hasAiReport,
      aiReportPrice: assessmentsTable.aiReportPrice,
      productId: assessmentsTable.productId,
      productTitle: productsTable.title,
      productImage: productsTable.image,
    })
    .from(assessmentsTable)
    .leftJoin(productsTable, eq(assessmentsTable.productId, productsTable.id))
    .where(eq(assessmentsTable.id, session.assessmentId))
    .limit(1);

  const indices = await db
    .select()
    .from(assessmentIndicesTable)
    .where(eq(assessmentIndicesTable.assessmentId, session.assessmentId))
    .orderBy(asc(assessmentIndicesTable.sortOrder));

  const indexScores = session.indexScores as Record<string, number> || {};

  const indicesWithLevel = indices.map((idx) => {
    const score = indexScores[String(idx.id)] ?? 0;
    const levels = (idx.levels as Array<{ label: string; minPct: number; maxPct: number; description: string; suggestion: string }>) || [];
    const level = levels.find((l) => score >= l.minPct && score <= l.maxPct) ?? levels[0] ?? null;
    return { ...idx, score, level };
  });

  // امتیاز نهایی ترکیبی
  const finalScore = (session.finalScore as number | null) ?? null;

  // سطح نهایی — از globalLevels تست یا شاخص با بیشترین وزن
  let finalLevel: { label: string; description: string; suggestion: string; minPct: number; maxPct: number } | null = null;
  const storedGlobalLevels = ScoringEngine.parseLevels((assessment as Record<string, unknown>).globalLevels);
  if (finalScore !== null) {
    if (storedGlobalLevels.length > 0) {
      finalLevel = ScoringEngine.matchLevel(finalScore, storedGlobalLevels);
    } else if (indicesWithLevel.length > 0) {
      const primary = [...indicesWithLevel].sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1))[0];
      const pLevels = ScoringEngine.parseLevels(primary.levels);
      finalLevel = ScoringEngine.matchLevel(finalScore, pLevels);
    }
  }

  // Rules Engine — بارگذاری نتایج قوانین برای نمایش در صفحه نتیجه
  let rulesResult: { matchedRules: unknown[]; merged: unknown } | null = null;
  let recommendations: Recommendation[] = [];
  try {
    const rules = await db
      .select()
      .from(assessmentRulesTable)
      .where(and(
        eq(assessmentRulesTable.assessmentId, session.assessmentId),
        eq(assessmentRulesTable.isActive, true),
      ))
      .orderBy(asc(assessmentRulesTable.sortOrder));

    if (rules.length > 0 && finalScore !== null) {
      const indices2 = await db
        .select()
        .from(assessmentIndicesTable)
        .where(eq(assessmentIndicesTable.assessmentId, session.assessmentId))
        .orderBy(asc(assessmentIndicesTable.sortOrder));

      const questions2 = await db
        .select()
        .from(assessmentQuestionsTable)
        .where(and(
          eq(assessmentQuestionsTable.assessmentId, session.assessmentId),
          eq(assessmentQuestionsTable.isActive, true),
        ));

      const storedAnswers = (session.answers as Record<string, unknown>) ?? {};
      const gLevels2 = ScoringEngine.parseLevels((assessment as Record<string, unknown>).globalLevels);
      const scoringResult2 = ScoringEngine.compute(questions2, indices2, storedAnswers, gLevels2.length ? gLevels2 : null);

      const evaluation = RecommendationEngine.evaluate(rules, {
        scoringResult: scoringResult2,
        answers: storedAnswers,
        currentLeadScore: 0,
      });
      rulesResult = evaluation.rulesResult;
      recommendations = await hydrateCatalogTargets(evaluation.recommendations);
    }
  } catch (err) {
    logger.error({ err }, "rules engine result evaluation error");
  }

  res.json({
    sessionId: sid,
    assessment,
    indicesWithLevel,
    finalScore,
    finalLevel,
    aiReportPurchased: session.aiReportPurchased,
    aiReport: session.aiReportPurchased ? session.aiReport : null,
    rulesResult: rulesResult ?? null,
    recommendations,
    growthRoadmap: buildGrowthRoadmap(indicesWithLevel, recommendations),
  });
});

// ─── Public: Get only dynamic recommendations for a completed session ─────────
router.get("/assessments/recommendations/:sessionId", optionalAuth, async (req, res) => {
  const sessionId = parseInt(req.params.sessionId);
  if (isNaN(sessionId)) {
    res.status(400).json({ error: "شناسه نامعتبر" });
    return;
  }

  const [session] = await db
    .select({
      id: assessmentSessionsTable.id,
      assessmentId: assessmentSessionsTable.assessmentId,
      answers: assessmentSessionsTable.answers,
      completedAt: assessmentSessionsTable.completedAt,
    })
    .from(assessmentSessionsTable)
    .where(eq(assessmentSessionsTable.id, sessionId))
    .limit(1);

  if (!session || !session.completedAt) {
    res.status(404).json({ error: "نتیجه یافت نشد" });
    return;
  }

  const input = await buildAssessmentScoringInput(
    session.assessmentId,
    (session.answers as Record<string, unknown>) ?? {},
  );
  if (!input) {
    res.status(404).json({ error: "تست یافت نشد" });
    return;
  }

  const evaluation = await evaluateAssessmentRecommendations(
    session.assessmentId,
    input,
  );

  res.json({
    sessionId,
    assessmentId: session.assessmentId,
    recommendations: evaluation.recommendations,
  });
});

// ─── Public: Submit contact info only (without full submission) ───────────────
router.post("/assessments/contact", optionalAuth, async (req, res) => {
  const { assessmentId, name, phone, sessionId } = req.body as {
    assessmentId: number; name: string; phone: string; sessionId?: number;
  };
  if (!assessmentId || !name || !phone) {
    res.status(400).json({ error: "اطلاعات ناقص است" }); return;
  }

  await db.insert(assessmentContactLeadsTable).values({
    assessmentId,
    sessionId: sessionId ?? null,
    userId: req.user?.userId ?? null,
    name,
    phone,
  });

  await db.insert(advisorRequestsTable).values({
    userId: req.user?.userId ?? null,
    name,
    phone,
    source: "assessment",
    status: "new",
  });

  res.json({ ok: true });
});

// ─── Authenticated: Purchase AI Report ───────────────────────────────────────
router.post("/assessments/report/purchase", requireUser, async (req, res) => {
  const { sessionId } = req.body as { sessionId: number };
  const userId = req.user!.userId;

  const [session] = await db
    .select()
    .from(assessmentSessionsTable)
    .where(and(eq(assessmentSessionsTable.id, sessionId), eq(assessmentSessionsTable.userId, userId)))
    .limit(1);

  if (!session) { res.status(404).json({ error: "نشست یافت نشد" }); return; }
  if (session.aiReportPurchased) { res.json({ alreadyPurchased: true, aiReport: session.aiReport }); return; }

  const [assessment] = await db
    .select({ hasAiReport: assessmentsTable.hasAiReport, aiReportPrice: assessmentsTable.aiReportPrice, title: assessmentsTable.title })
    .from(assessmentsTable)
    .where(eq(assessmentsTable.id, session.assessmentId))
    .limit(1);

  if (!assessment?.hasAiReport) { res.status(400).json({ error: "این تست گزارش AI ندارد" }); return; }

  const price = assessment.aiReportPrice ?? 0;

  if (price === 0) {
    // Free AI report — generate immediately
    const report = await generateAiReport(session, userId, res);
    if (!report) return; // error already sent
    await db.update(assessmentSessionsTable)
      .set({ aiReportPurchased: true, aiReport: report, aiReportGeneratedAt: new Date() })
      .where(eq(assessmentSessionsTable.id, sessionId));
    res.json({ free: true, aiReport: report });
    return;
  }

  // Paid: create order (Zarinpal flow via /payment/create with itemType ai_report)
  res.json({ requiresPayment: true, price, sessionId });
});

// ─── Authenticated: Get AI Report ────────────────────────────────────────────
router.get("/assessments/report/:sessionId", requireUser, async (req, res) => {
  const sid = parseInt(req.params.sessionId);
  const userId = req.user!.userId;

  const [session] = await db
    .select()
    .from(assessmentSessionsTable)
    .where(and(eq(assessmentSessionsTable.id, sid), eq(assessmentSessionsTable.userId, userId)))
    .limit(1);

  if (!session) { res.status(404).json({ error: "نشست یافت نشد" }); return; }
  if (!session.aiReportPurchased) { res.status(403).json({ error: "گزارش AI خریداری نشده است" }); return; }

  // Generate if purchased but not yet generated
  if (!session.aiReport) {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "";
    if (!checkAiRateLimit(ip)) {
      res.status(429).json({ error: "درخواست‌های زیادی ارسال شده. لطفاً کمی صبر کنید" });
      return;
    }
    const report = await generateAiReport(session, userId, res);
    if (!report) return;
    await db.update(assessmentSessionsTable)
      .set({ aiReport: report, aiReportGeneratedAt: new Date() })
      .where(eq(assessmentSessionsTable.id, sid));
    res.json({ aiReport: report });
    return;
  }

  res.json({ aiReport: session.aiReport });
});

// ─── AI Report Core (no HTTP dependency) ─────────────────────────────────────
/** Generates the AI report text. Returns null if OpenAI key is missing or an error occurs. */
export async function generateAiReportText(
  session: typeof assessmentSessionsTable.$inferSelect,
): Promise<string | null> {
  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return null;

    const [assessment] = await db
      .select({ title: assessmentsTable.title })
      .from(assessmentsTable)
      .where(eq(assessmentsTable.id, session.assessmentId))
      .limit(1);

    const indices = await db
      .select()
      .from(assessmentIndicesTable)
      .where(eq(assessmentIndicesTable.assessmentId, session.assessmentId))
      .orderBy(asc(assessmentIndicesTable.sortOrder));

    const indexScores = (session.indexScores as Record<string, number>) || {};

    const indexSummary = indices
      .map((idx) => {
        const score = indexScores[String(idx.id)] ?? 0;
        const levels =
          (idx.levels as Array<{
            label: string;
            minPct: number;
            maxPct: number;
            description: string;
            suggestion: string;
          }>) || [];
        const level = levels.find((l) => score >= l.minPct && score <= l.maxPct);
        return `- ${idx.name}: ${score}/100${level ? ` (${level.label}): ${level.description}` : ""}`;
      })
      .join("\n");

    const prompt = `تو یک مشاور حرفه‌ای شیوافر آکادمی هستی. کاربر تست "${assessment?.title ?? "ارزیابی"}" را با نتایج زیر تکمیل کرده:

${indexSummary}

یک گزارش شخصی‌سازی‌شده و حرفه‌ای به زبان فارسی بنویس که:
۱. نقاط قوت اصلی کاربر را برجسته کند
۲. زمینه‌های رشد را با دلسوزی نشان دهد  
۳. ۳ تا ۵ پیشنهاد عملی و قابل اجرا ارائه دهد
۴. با انگیزه‌بخشی پایان یابد

گزارش باید صمیمی، دلگرم‌کننده و کاملاً شخصی باشد. از عنوان‌بندی استفاده کن. حدود ۴۰۰ تا ۶۰۰ کلمه.`;

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1500,
        temperature: 0.7,
      }),
    });

    if (!resp.ok) {
      logger.error({ status: resp.status }, "openai API error for assessment report");
      return null;
    }

    const data = (await resp.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0]?.message?.content ?? null;
  } catch (err) {
    logger.error({ err }, "generateAiReportText error");
    return null;
  }
}

// ─── AI Report Generator (HTTP wrapper) ──────────────────────────────────────
async function generateAiReport(
  session: typeof assessmentSessionsTable.$inferSelect,
  _userId: number,
  res: import("express").Response,
): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: "سرویس AI در دسترس نیست" });
    return null;
  }
  const text = await generateAiReportText(session);
  if (!text) {
    res.status(500).json({ error: "خطا در تولید گزارش AI" });
    return null;
  }
  return text;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── ADMIN ROUTES ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// GET /admin/assessments
router.get("/admin/assessments", requireAdmin, async (_req, res) => {
  const items = await db
    .select({
      id: assessmentsTable.id,
      title: assessmentsTable.title,
      slug: assessmentsTable.slug,
      shortDescription: assessmentsTable.shortDescription,
      coverImage: assessmentsTable.coverImage,
      isPublished: assessmentsTable.isPublished,
      sortOrder: assessmentsTable.sortOrder,
      category: assessmentsTable.category,
      estimatedMinutes: assessmentsTable.estimatedMinutes,
      requiresAuth: assessmentsTable.requiresAuth,
      collectContactInfo: assessmentsTable.collectContactInfo,
      hasAiReport: assessmentsTable.hasAiReport,
      aiReportPrice: assessmentsTable.aiReportPrice,
      participantCount: assessmentsTable.participantCount,
      productId: assessmentsTable.productId,
      productTitle: productsTable.title,
      createdAt: assessmentsTable.createdAt,
      updatedAt: assessmentsTable.updatedAt,
    })
    .from(assessmentsTable)
    .leftJoin(productsTable, eq(assessmentsTable.productId, productsTable.id))
    .orderBy(asc(assessmentsTable.sortOrder), desc(assessmentsTable.createdAt));

  // Question counts
  const counts = await db
    .select({
      assessmentId: assessmentQuestionsTable.assessmentId,
      cnt: sql<number>`count(*)::int`,
    })
    .from(assessmentQuestionsTable)
    .groupBy(assessmentQuestionsTable.assessmentId);

  const countMap: Record<number, number> = {};
  for (const c of counts) countMap[c.assessmentId] = c.cnt;

  // Lead counts
  const leadCounts = await db
    .select({
      assessmentId: assessmentContactLeadsTable.assessmentId,
      cnt: sql<number>`count(*)::int`,
    })
    .from(assessmentContactLeadsTable)
    .groupBy(assessmentContactLeadsTable.assessmentId);

  const leadMap: Record<number, number> = {};
  for (const l of leadCounts) leadMap[l.assessmentId] = l.cnt;

  res.json(items.map((a) => ({
    ...a,
    questionCount: countMap[a.id] ?? 0,
    leadCount: leadMap[a.id] ?? 0,
  })));
});

// GET /admin/assessments/:id — single assessment detail for builder edit mode
router.get("/admin/assessments/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "شناسه نامعتبر" }); return; }
  const [item] = await db.select().from(assessmentsTable).where(eq(assessmentsTable.id, id)).limit(1);
  if (!item) { res.status(404).json({ error: "یافت نشد" }); return; }
  res.json(item);
});

// POST /admin/assessments
router.post("/admin/assessments", requireAdmin, async (req, res) => {
  const {
    title, slug, shortDescription, description, coverImage, productId,
    category, estimatedMinutes, startText, endText, isPublished, sortOrder,
    requiresAuth, collectContactInfo, hasAiReport, aiReportPrice, disclaimer,
  } = req.body as Partial<typeof assessmentsTable.$inferInsert>;

  if (!title || !slug) { res.status(400).json({ error: "عنوان و slug الزامی است" }); return; }

  const [existing] = await db
    .select({ id: assessmentsTable.id })
    .from(assessmentsTable)
    .where(eq(assessmentsTable.slug, slug!))
    .limit(1);
  if (existing) { res.status(400).json({ error: "این slug قبلاً استفاده شده است" }); return; }

  const [item] = await db.insert(assessmentsTable).values({
    title: title!, slug: slug!, shortDescription, description, coverImage,
    productId: productId ?? null, category, estimatedMinutes: estimatedMinutes ?? 10,
    startText, endText, isPublished: isPublished ?? false,
    sortOrder: sortOrder ?? 0, requiresAuth: requiresAuth ?? false,
    collectContactInfo: collectContactInfo ?? false,
    hasAiReport: hasAiReport ?? false, aiReportPrice: aiReportPrice ?? 0,
    disclaimer,
  }).returning();

  res.json(item);
});

// PUT /admin/assessments/questions/:qid  — MUST be before /:id to prevent route shadowing
router.put("/admin/assessments/questions/:qid", requireAdmin, async (req, res) => {
  const qid = parseInt(req.params.qid);
  if (isNaN(qid)) { res.status(400).json({ error: "شناسه نامعتبر" }); return; }
  const updates = { ...req.body, updatedAt: new Date() };
  delete updates.id; delete updates.assessmentId; delete updates.createdAt;
  const [q] = await db.update(assessmentQuestionsTable).set(updates).where(eq(assessmentQuestionsTable.id, qid)).returning();
  if (!q) { res.status(404).json({ error: "یافت نشد" }); return; }
  res.json(q);
});

// PUT /admin/assessments/indices/:iid  — MUST be before /:id to prevent route shadowing
router.put("/admin/assessments/indices/:iid", requireAdmin, async (req, res) => {
  const iid = parseInt(req.params.iid);
  if (isNaN(iid)) { res.status(400).json({ error: "شناسه نامعتبر" }); return; }
  const updates = { ...req.body };
  delete updates.id; delete updates.assessmentId; delete updates.createdAt;
  const [idx] = await db.update(assessmentIndicesTable).set(updates).where(eq(assessmentIndicesTable.id, iid)).returning();
  if (!idx) { res.status(404).json({ error: "یافت نشد" }); return; }
  res.json(idx);
});

// PUT /admin/assessments/:id
router.put("/admin/assessments/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "شناسه نامعتبر" }); return; }

  const updates: Partial<typeof assessmentsTable.$inferInsert> = { ...req.body, updatedAt: new Date() };
  delete (updates as Record<string, unknown>).id;
  delete (updates as Record<string, unknown>).createdAt;
  delete (updates as Record<string, unknown>).participantCount;

  const [item] = await db.update(assessmentsTable)
    .set(updates)
    .where(eq(assessmentsTable.id, id))
    .returning();
  if (!item) { res.status(404).json({ error: "یافت نشد" }); return; }
  res.json(item);
});

// DELETE /admin/assessments/:id
router.delete("/admin/assessments/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "شناسه نامعتبر" }); return; }
  await db.delete(assessmentsTable).where(eq(assessmentsTable.id, id));
  res.json({ ok: true });
});

// POST /admin/assessments/:id/duplicate
router.post("/admin/assessments/:id/duplicate", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "شناسه نامعتبر" }); return; }

  const [src] = await db.select().from(assessmentsTable).where(eq(assessmentsTable.id, id)).limit(1);
  if (!src) { res.status(404).json({ error: "یافت نشد" }); return; }

  const newSlug = `${src.slug}-copy-${Date.now()}`;
  const [copy] = await db.insert(assessmentsTable).values({
    ...src, id: undefined as unknown as number,
    slug: newSlug, title: `${src.title} (کپی)`,
    isPublished: false, participantCount: 0,
    createdAt: undefined as unknown as Date, updatedAt: undefined as unknown as Date,
  }).returning();

  // Duplicate questions
  const questions = await db.select().from(assessmentQuestionsTable)
    .where(eq(assessmentQuestionsTable.assessmentId, id));
  if (questions.length > 0) {
    await db.insert(assessmentQuestionsTable).values(
      questions.map((q) => ({
        ...q, id: undefined as unknown as number, assessmentId: copy.id,
        createdAt: undefined as unknown as Date, updatedAt: undefined as unknown as Date,
      }))
    );
  }

  // Duplicate indices
  const indices = await db.select().from(assessmentIndicesTable)
    .where(eq(assessmentIndicesTable.assessmentId, id));
  if (indices.length > 0) {
    await db.insert(assessmentIndicesTable).values(
      indices.map((idx) => ({
        ...idx, id: undefined as unknown as number, assessmentId: copy.id,
        createdAt: undefined as unknown as Date,
      }))
    );
  }

  res.json(copy);
});

// ─── Questions CRUD ───────────────────────────────────────────────────────────

router.get("/admin/assessments/:id/questions", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const questions = await db.select().from(assessmentQuestionsTable)
    .where(eq(assessmentQuestionsTable.assessmentId, id))
    .orderBy(asc(assessmentQuestionsTable.sortOrder));
  res.json(questions);
});

router.post("/admin/assessments/:id/questions", requireAdmin, async (req, res) => {
  const assessmentId = parseInt(req.params.id);
  const {
    type, title, description, image, sortOrder, isRequired,
    indexIds, options, conditionalLogic, specialMessage, answerLabel,
    scaleMinLabel, scaleMaxLabel,
    // v54 new fields
    questionWeight, questionCategory, questionGoal,
  } = req.body;
  if (!type || !title) { res.status(400).json({ error: "نوع و عنوان سوال الزامی است" }); return; }

  const [q] = await db.insert(assessmentQuestionsTable).values({
    assessmentId, type, title, description, image,
    sortOrder: sortOrder ?? 0, isRequired: isRequired ?? true,
    indexIds: indexIds ?? [], options: options ?? [],
    conditionalLogic: conditionalLogic ?? null,
    specialMessage, answerLabel, scaleMinLabel, scaleMaxLabel,
    // v54
    questionWeight: questionWeight ?? 1,
    questionCategory: questionCategory ?? null,
    questionGoal: questionGoal ?? null,
  }).returning();
  res.json(q);
});

router.delete("/admin/assessments/questions/:qid", requireAdmin, async (req, res) => {
  const qid = parseInt(req.params.qid);
  await db.delete(assessmentQuestionsTable).where(eq(assessmentQuestionsTable.id, qid));
  res.json({ ok: true });
});

router.put("/admin/assessments/:id/questions/reorder", requireAdmin, async (req, res) => {
  const { ids } = req.body as { ids: number[] };
  if (!Array.isArray(ids)) { res.status(400).json({ error: "ids باید آرایه باشد" }); return; }
  await Promise.all(ids.map((id, idx) =>
    db.update(assessmentQuestionsTable).set({ sortOrder: idx }).where(eq(assessmentQuestionsTable.id, id))
  ));
  res.json({ ok: true });
});

// ─── Indices CRUD ─────────────────────────────────────────────────────────────

router.get("/admin/assessments/:id/indices", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const indices = await db.select().from(assessmentIndicesTable)
    .where(eq(assessmentIndicesTable.assessmentId, id))
    .orderBy(asc(assessmentIndicesTable.sortOrder));
  res.json(indices);
});

router.post("/admin/assessments/:id/indices", requireAdmin, async (req, res) => {
  const assessmentId = parseInt(req.params.id);
  const { name, description, weight, minScore, maxScore, levels, sortOrder } = req.body;
  if (!name) { res.status(400).json({ error: "نام شاخص الزامی است" }); return; }
  const [idx] = await db.insert(assessmentIndicesTable).values({
    assessmentId, name, description, weight: weight ?? 1,
    minScore: minScore ?? 0, maxScore: maxScore ?? 100,
    levels: levels ?? [], sortOrder: sortOrder ?? 0,
  }).returning();
  res.json(idx);
});

router.delete("/admin/assessments/indices/:iid", requireAdmin, async (req, res) => {
  const iid = parseInt(req.params.iid);
  await db.delete(assessmentIndicesTable).where(eq(assessmentIndicesTable.id, iid));
  res.json({ ok: true });
});

// ─── Admin Stats (enhanced) ───────────────────────────────────────────────────

router.get("/admin/assessments/:id/stats", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "شناسه نامعتبر" }); return; }

  const [assessment] = await db.select().from(assessmentsTable).where(eq(assessmentsTable.id, id)).limit(1);
  if (!assessment) { res.status(404).json({ error: "یافت نشد" }); return; }

  const [totals] = await db
    .select({
      total:       sql<number>`count(*)::int`,
      completed:   sql<number>`count(case when completed_at is not null then 1 end)::int`,
      aiPurchased: sql<number>`count(case when ai_report_purchased then 1 end)::int`,
    })
    .from(assessmentSessionsTable)
    .where(eq(assessmentSessionsTable.assessmentId, id));

  const [leadRow] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(assessmentContactLeadsTable)
    .where(eq(assessmentContactLeadsTable.assessmentId, id));

  const aiRevenue   = (totals?.aiPurchased ?? 0) * (assessment.aiReportPrice ?? 0);
  const completionRate = totals?.total > 0
    ? Math.round(((totals?.completed ?? 0) / totals.total) * 100)
    : 0;

  const completedSessions = await db
    .select({
      indexScores: assessmentSessionsTable.indexScores,
      answers:     assessmentSessionsTable.answers,
      completedAt: assessmentSessionsTable.completedAt,
    })
    .from(assessmentSessionsTable)
    .where(and(
      eq(assessmentSessionsTable.assessmentId, id),
      isNull(assessmentSessionsTable.completedAt) ? undefined : sql`completed_at is not null`,
    ));

  const done = completedSessions.filter((s) => s.completedAt != null);

  const indices = await db
    .select({ id: assessmentIndicesTable.id, name: assessmentIndicesTable.name })
    .from(assessmentIndicesTable)
    .where(eq(assessmentIndicesTable.assessmentId, id))
    .orderBy(asc(assessmentIndicesTable.sortOrder));

  const indexAverages = indices.map((idx) => {
    const scores = done
      .map((s) => (s.indexScores as Record<string, number>)?.[String(idx.id)])
      .filter((v): v is number => v != null);
    const avgScore = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;
    return { indexId: idx.id, name: idx.name, avgScore, respondents: scores.length };
  });

  const overallScores = done.map((s) => {
    const vals = Object.values((s.indexScores as Record<string, number>) || {});
    return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  });

  const buckets = ["0-20", "20-40", "40-60", "60-80", "80-100"] as const;
  const scoreDistribution = buckets.map((b) => {
    const [lo, hi] = b.split("-").map(Number);
    const count = overallScores.filter((s) => s >= lo && s < (hi === 100 ? 101 : hi)).length;
    return {
      bucket: b,
      count,
      pct: done.length > 0 ? Math.round((count / done.length) * 100) : 0,
    };
  });

  const nowMs  = Date.now();
  const dailyTrend: { date: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(nowMs - i * 86_400_000);
    const dateStr = d.toISOString().slice(0, 10);
    const count = done.filter((s) => s.completedAt?.toString().slice(0, 10) === dateStr).length;
    dailyTrend.push({ date: dateStr, count });
  }

  const choiceQs = await db
    .select({
      id:      assessmentQuestionsTable.id,
      title:   assessmentQuestionsTable.title,
      options: assessmentQuestionsTable.options,
    })
    .from(assessmentQuestionsTable)
    .where(and(
      eq(assessmentQuestionsTable.assessmentId, id),
      sql`type in ('single_choice','yes_no','dropdown')`,
    ))
    .orderBy(asc(assessmentQuestionsTable.sortOrder))
    .limit(5);

  const answerFrequency = choiceQs.map((q) => {
    const opts = (q.options as Array<{ id: string; label: string }>) ?? [];
    const freq: Record<string, number> = {};
    for (const s of done) {
      const ans = (s.answers as Record<string, unknown>)?.[String(q.id)];
      if (typeof ans === "string") freq[ans] = (freq[ans] ?? 0) + 1;
    }
    const total = Object.values(freq).reduce((a, b) => a + b, 0);
    return {
      questionId: q.id,
      title:      q.title,
      options: opts
        .map((o) => ({
          label: o.label,
          count: freq[o.id] ?? 0,
          pct:   total > 0 ? Math.round(((freq[o.id] ?? 0) / total) * 100) : 0,
        }))
        .sort((a, b) => b.count - a.count),
    };
  });

  res.json({
    total:              totals?.total        ?? 0,
    completed:          totals?.completed    ?? 0,
    abandoned:          (totals?.total ?? 0) - (totals?.completed ?? 0),
    completionRate,
    leadCount:          leadRow?.cnt         ?? 0,
    aiReportsPurchased: totals?.aiPurchased  ?? 0,
    aiRevenue,
    participantCount:   assessment.participantCount,
    indexAverages,
    scoreDistribution,
    dailyTrend,
    answerFrequency,
  });
});

// ─── Admin: Export leads as CSV ───────────────────────────────────────────────
router.get("/admin/assessments/:id/leads/export", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "شناسه نامعتبر" }); return; }

  const leads = await db
    .select()
    .from(assessmentContactLeadsTable)
    .where(eq(assessmentContactLeadsTable.assessmentId, id))
    .orderBy(desc(assessmentContactLeadsTable.createdAt));

  const rows = [
    "نام,موبایل,تاریخ",
    ...leads.map((l) =>
      `"${(l.name ?? "").replace(/"/g, '""')}","${(l.phone ?? "").replace(/"/g, '""')}","${new Date(l.createdAt).toLocaleDateString("fa-IR")}"`
    ),
  ].join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="leads-assessment-${id}.csv"`);
  res.send("\ufeff" + rows); // UTF-8 BOM for Excel
});

router.get("/admin/assessments/:id/sessions", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const page = parseInt((req.query.page as string) || "1");
  const limit = 50;
  const offset = (page - 1) * limit;

  const sessions = await db
    .select({
      id: assessmentSessionsTable.id,
      userId: assessmentSessionsTable.userId,
      guestPhone: assessmentSessionsTable.guestPhone,
      startedAt: assessmentSessionsTable.startedAt,
      completedAt: assessmentSessionsTable.completedAt,
      aiReportPurchased: assessmentSessionsTable.aiReportPurchased,
      totalLeadScoreImpact: assessmentSessionsTable.totalLeadScoreImpact,
      userName: usersTable.name,
      userPhone: usersTable.phone,
    })
    .from(assessmentSessionsTable)
    .leftJoin(usersTable, eq(assessmentSessionsTable.userId, usersTable.id))
    .where(eq(assessmentSessionsTable.assessmentId, id))
    .orderBy(desc(assessmentSessionsTable.startedAt))
    .limit(limit)
    .offset(offset);

  res.json(sessions);
});

router.get("/admin/assessments/:id/leads", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const leads = await db
    .select()
    .from(assessmentContactLeadsTable)
    .where(eq(assessmentContactLeadsTable.assessmentId, id))
    .orderBy(desc(assessmentContactLeadsTable.createdAt));
  res.json(leads);
});

// ─── Admin: Recalculate scores for a single session ─────────────────────────
// POST /admin/assessments/sessions/:sessionId/recalculate
router.post("/admin/assessments/sessions/:sessionId/recalculate", requireAdmin, async (req, res) => {
  const sid = parseInt(req.params.sessionId);
  if (isNaN(sid)) { res.status(400).json({ error: "شناسه نامعتبر" }); return; }

  const [session] = await db
    .select()
    .from(assessmentSessionsTable)
    .where(eq(assessmentSessionsTable.id, sid))
    .limit(1);

  if (!session || !session.completedAt) {
    res.status(404).json({ error: "نشست یافت نشد یا هنوز تکمیل نشده است" }); return;
  }

  const [assessment] = await db
    .select()
    .from(assessmentsTable)
    .where(eq(assessmentsTable.id, session.assessmentId))
    .limit(1);

  if (!assessment) { res.status(404).json({ error: "تست یافت نشد" }); return; }

  const questions = await db
    .select()
    .from(assessmentQuestionsTable)
    .where(and(
      eq(assessmentQuestionsTable.assessmentId, assessment.id),
      eq(assessmentQuestionsTable.isActive, true),
    ));

  const indices = await db
    .select()
    .from(assessmentIndicesTable)
    .where(eq(assessmentIndicesTable.assessmentId, assessment.id));

  const answers = (session.answers as Record<string, unknown>) || {};
  const globalLevels = ScoringEngine.parseLevels((assessment as Record<string, unknown>).globalLevels);
  const result = ScoringEngine.compute(questions, indices, answers, globalLevels.length ? globalLevels : null);
  const indexScores = ScoringEngine.toLegacyIndexScores(result);

  await db.update(assessmentSessionsTable)
    .set({
      indexScores,
      totalLeadScoreImpact: result.leadScoreImpact,
      finalScore: result.finalScore,
      scoringVersion: result.scoringVersion,
    })
    .where(eq(assessmentSessionsTable.id, sid));

  logger.info({ sessionId: sid, finalScore: result.finalScore }, "admin: session scores recalculated");

  res.json({
    sessionId: sid,
    indexScores,
    finalScore: result.finalScore,
    finalLevel: result.finalLevel,
    indexResults: result.indexResults,
    scoringVersion: result.scoringVersion,
  });
});

// ─── Admin: Recalculate scores for ALL sessions of an assessment ──────────────
// POST /admin/assessments/:id/recalculate-all
router.post("/admin/assessments/:id/recalculate-all", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "شناسه نامعتبر" }); return; }

  const [assessment] = await db
    .select()
    .from(assessmentsTable)
    .where(eq(assessmentsTable.id, id))
    .limit(1);

  if (!assessment) { res.status(404).json({ error: "تست یافت نشد" }); return; }

  const questions = await db
    .select()
    .from(assessmentQuestionsTable)
    .where(and(
      eq(assessmentQuestionsTable.assessmentId, id),
      eq(assessmentQuestionsTable.isActive, true),
    ));

  const indices = await db
    .select()
    .from(assessmentIndicesTable)
    .where(eq(assessmentIndicesTable.assessmentId, id));

  const globalLevels = ScoringEngine.parseLevels((assessment as Record<string, unknown>).globalLevels);

  // دریافت همهٔ session‌های تکمیل‌شده
  const sessions = await db
    .select({ id: assessmentSessionsTable.id, answers: assessmentSessionsTable.answers })
    .from(assessmentSessionsTable)
    .where(and(
      eq(assessmentSessionsTable.assessmentId, id),
      sql`${assessmentSessionsTable.completedAt} IS NOT NULL`,
    ));

  let updated = 0;
  let failed = 0;

  for (const s of sessions) {
    try {
      const answers = (s.answers as Record<string, unknown>) || {};
      const result = ScoringEngine.compute(questions, indices, answers, globalLevels.length ? globalLevels : null);
      const indexScores = ScoringEngine.toLegacyIndexScores(result);

      await db.update(assessmentSessionsTable)
        .set({
          indexScores,
          totalLeadScoreImpact: result.leadScoreImpact,
          finalScore: result.finalScore,
          scoringVersion: result.scoringVersion,
        })
        .where(eq(assessmentSessionsTable.id, s.id));

      updated++;
    } catch (err) {
      logger.error({ err, sessionId: s.id }, "recalculate-all: session failed");
      failed++;
    }
  }

  logger.info({ assessmentId: id, updated, failed }, "admin: bulk recalculate complete");
  res.json({ total: sessions.length, updated, failed });
});

// ─── Admin: Score preview (dry-run, بدون ذخیره) ──────────────────────────────
// POST /admin/assessments/:id/score-preview
// body: { answers: Record<string, unknown> }
router.post("/admin/assessments/:id/score-preview", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "شناسه نامعتبر" }); return; }

  const { answers } = req.body as { answers: Record<string, unknown> };
  if (!answers || typeof answers !== "object") {
    res.status(400).json({ error: "answers الزامی است" }); return;
  }

  const [assessment] = await db
    .select()
    .from(assessmentsTable)
    .where(eq(assessmentsTable.id, id))
    .limit(1);

  if (!assessment) { res.status(404).json({ error: "تست یافت نشد" }); return; }

  const questions = await db
    .select()
    .from(assessmentQuestionsTable)
    .where(and(
      eq(assessmentQuestionsTable.assessmentId, id),
      eq(assessmentQuestionsTable.isActive, true),
    ));

  const indices = await db
    .select()
    .from(assessmentIndicesTable)
    .where(eq(assessmentIndicesTable.assessmentId, id));

  const globalLevels = ScoringEngine.parseLevels((assessment as Record<string, unknown>).globalLevels);
  const result = ScoringEngine.compute(questions, indices, answers, globalLevels.length ? globalLevels : null);

  res.json({
    ...result,
    indexScores: ScoringEngine.toLegacyIndexScores(result),
    dryRun: true,
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// ─── ADMIN: Rules Engine CRUD — v57 ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// GET /admin/assessments/:id/rules — لیست قوانین یک تست
router.get("/admin/assessments/:id/rules", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "شناسه نامعتبر" }); return; }

  const rules = await db
    .select()
    .from(assessmentRulesTable)
    .where(eq(assessmentRulesTable.assessmentId, id))
    .orderBy(asc(assessmentRulesTable.sortOrder), asc(assessmentRulesTable.id));

  res.json(rules);
});

// POST /admin/assessments/:id/rules — ایجاد قانون جدید
router.post("/admin/assessments/:id/rules", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "شناسه نامعتبر" }); return; }

  const { name, description, isActive, sortOrder, conditionMode, conditions, actions } = req.body as {
    name: string;
    description?: string;
    isActive?: boolean;
    sortOrder?: number;
    conditionMode?: string;
    conditions: unknown[];
    actions: Record<string, unknown>;
  };

  if (!name?.trim()) { res.status(400).json({ error: "نام قانون الزامی است" }); return; }

  const [rule] = await db
    .insert(assessmentRulesTable)
    .values({
      assessmentId: id,
      name: name.trim(),
      description: description ?? null,
      isActive: isActive ?? true,
      sortOrder: sortOrder ?? 0,
      conditionMode: (conditionMode ?? "all") as "all" | "any",
      conditions: (conditions ?? []) as never,
      actions: (actions ?? {}) as never,
    })
    .returning();

  res.json(rule);
});

// PUT /admin/assessments/rules/:ruleId — ویرایش قانون
router.put("/admin/assessments/rules/:ruleId", requireAdmin, async (req, res) => {
  const ruleId = parseInt(req.params.ruleId);
  if (isNaN(ruleId)) { res.status(400).json({ error: "شناسه نامعتبر" }); return; }

  const { name, description, isActive, sortOrder, conditionMode, conditions, actions } = req.body as {
    name?: string;
    description?: string;
    isActive?: boolean;
    sortOrder?: number;
    conditionMode?: string;
    conditions?: unknown[];
    actions?: Record<string, unknown>;
  };

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name.trim();
  if (description !== undefined) updates.description = description;
  if (isActive !== undefined) updates.isActive = isActive;
  if (sortOrder !== undefined) updates.sortOrder = sortOrder;
  if (conditionMode !== undefined) updates.conditionMode = conditionMode;
  if (conditions !== undefined) updates.conditions = conditions;
  if (actions !== undefined) updates.actions = actions;

  const [updated] = await db
    .update(assessmentRulesTable)
    .set(updates as never)
    .where(eq(assessmentRulesTable.id, ruleId))
    .returning();

  if (!updated) { res.status(404).json({ error: "قانون یافت نشد" }); return; }
  res.json(updated);
});

// DELETE /admin/assessments/rules/:ruleId — حذف قانون
router.delete("/admin/assessments/rules/:ruleId", requireAdmin, async (req, res) => {
  const ruleId = parseInt(req.params.ruleId);
  if (isNaN(ruleId)) { res.status(400).json({ error: "شناسه نامعتبر" }); return; }

  await db.delete(assessmentRulesTable).where(eq(assessmentRulesTable.id, ruleId));
  res.json({ ok: true });
});

// PUT /admin/assessments/:id/rules/reorder — تغییر ترتیب قوانین
router.put("/admin/assessments/:id/rules/reorder", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "شناسه نامعتبر" }); return; }

  const { orderedIds } = req.body as { orderedIds: number[] };
  if (!Array.isArray(orderedIds)) { res.status(400).json({ error: "orderedIds الزامی است" }); return; }

  await Promise.all(
    orderedIds.map((rid, idx) =>
      db.update(assessmentRulesTable)
        .set({ sortOrder: idx, updatedAt: new Date() })
        .where(and(
          eq(assessmentRulesTable.id, rid),
          eq(assessmentRulesTable.assessmentId, id),
        ))
    )
  );

  res.json({ ok: true });
});

// POST /admin/assessments/rules/:ruleId/preview — پیش‌نمایش ارزیابی قانون (dry-run)
router.post("/admin/assessments/rules/:ruleId/preview", requireAdmin, async (req, res) => {
  const ruleId = parseInt(req.params.ruleId);
  if (isNaN(ruleId)) { res.status(400).json({ error: "شناسه نامعتبر" }); return; }

  const [rule] = await db
    .select()
    .from(assessmentRulesTable)
    .where(eq(assessmentRulesTable.id, ruleId))
    .limit(1);

  if (!rule) { res.status(404).json({ error: "قانون یافت نشد" }); return; }

  const { answers } = req.body as { answers?: Record<string, unknown> };
  if (!answers) { res.status(400).json({ error: "answers الزامی است" }); return; }

  const questions = await db
    .select()
    .from(assessmentQuestionsTable)
    .where(and(
      eq(assessmentQuestionsTable.assessmentId, rule.assessmentId),
      eq(assessmentQuestionsTable.isActive, true),
    ));

  const indices = await db
    .select()
    .from(assessmentIndicesTable)
    .where(eq(assessmentIndicesTable.assessmentId, rule.assessmentId));

  const [assessment] = await db
    .select({ globalLevels: assessmentsTable.globalLevels })
    .from(assessmentsTable)
    .where(eq(assessmentsTable.id, rule.assessmentId))
    .limit(1);

  const globalLevels = ScoringEngine.parseLevels((assessment as Record<string, unknown>)?.globalLevels);
  const scoringResult = ScoringEngine.compute(questions, indices, answers, globalLevels.length ? globalLevels : null);

  const preview = RulesEngine.previewRule(rule, { scoringResult, answers, currentLeadScore: 0 });

  res.json({
    ...preview,
    scoringResult: {
      finalScore: scoringResult.finalScore,
      finalLevel: scoringResult.finalLevel,
      indexResults: scoringResult.indexResults.map((r) => ({
        indexId: r.indexId,
        name: r.name,
        normalizedScore: r.normalizedScore,
        level: r.level,
      })),
    },
  });
});

// ─── Admin: Grant AI report after successful payment ──────────────────────────
// Called internally by payment route after order confirmed
export async function grantAiReportAccess(orderId: number): Promise<void> {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  if (!order || order.itemType !== "ai_report") return;

  const sessionId = order.itemId;
  const [session] = await db.select().from(assessmentSessionsTable)
    .where(eq(assessmentSessionsTable.id, sessionId)).limit(1);
  if (!session) return;

  await db.update(assessmentSessionsTable)
    .set({ aiReportPurchased: true, aiReportOrderId: orderId })
    .where(eq(assessmentSessionsTable.id, sessionId));

  // Background: generate the AI report immediately after purchase so it's ready when user arrives
  generateAiReportText(session)
    .then(async (report) => {
      if (report) {
        await db
          .update(assessmentSessionsTable)
          .set({ aiReport: report, aiReportGeneratedAt: new Date() })
          .where(eq(assessmentSessionsTable.id, sessionId));
        logger.info({ sessionId }, "background AI report generated after payment");
      }
    })
    .catch((err) => logger.error({ err, sessionId }, "background AI report generation failed"));
}

export default router;
