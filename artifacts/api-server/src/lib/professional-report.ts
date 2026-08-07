import { and, asc, eq } from "drizzle-orm";
import {
  aiAssessmentReportsTable,
  assessmentAiReportConfigsTable,
  assessmentIndicesTable,
  assessmentQuestionsTable,
  assessmentRulesTable,
  assessmentSessionsTable,
  assessmentsTable,
  db,
  productsTable,
  type AssessmentAiReportConfig,
  type ProfessionalReportContent,
  type Recommendation,
} from "@workspace/db";
import { RecommendationEngine } from "./recommendation-engine";
import { ScoringEngine, type LevelDefinition, type ScoringResult } from "./scoring-engine";
import { hydrateCatalogTargets } from "./recommendation-service";
import { buildGrowthRoadmap, type GrowthRoadmap } from "./growth-roadmap";

export interface ProfessionalReportInput {
  assessment: {
    id: number;
    title: string;
    description: string | null;
  };
  overall: {
    score: number | null;
    level: string | null;
    levelDescription: string | null;
  };
  indices: Array<{
    id: number;
    name: string;
    score: number | null;
    level: string | null;
    description: string | null;
  }>;
  strengths: string[];
  improvements: string[];
  roadmap: GrowthRoadmap;
  recommendations: Recommendation[];
  importantAnswers: Array<{
    questionId: number;
    question: string;
    answer: unknown;
  }>;
  suggestedProduct: {
    id: number;
    title: string;
    description: string | null;
  } | null;
}

export interface EffectiveProfessionalReportConfig {
  assessmentId: number;
  isEnabled: boolean;
  title: string;
  salesDescription: string;
  valueDescription: string;
  features: string[];
  price: number;
  prompt: string;
  model: string;
  maxTokens: number;
  temperature: number;
  tone: string;
  language: string;
  promptVersion: string;
  source: "config" | "legacy";
}

export interface ProfessionalReportPrompt {
  system: string;
  user: string;
  promptVersion: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

const DEFAULT_CONFIG = {
  title: "گزارش حرفه‌ای AI",
  salesDescription: "",
  valueDescription: "",
  features: [] as string[],
  price: 0,
  prompt: "",
  model: "gpt-4o-mini",
  maxTokens: 1500,
  temperature: 0.7,
  tone: "professional",
  language: "fa",
  promptVersion: "v1",
} as const;

function asAnswer(value: unknown): unknown {
  if (typeof value === "string" && value.length > 1000) return value.slice(0, 1000);
  return value;
}

function levelForScore(score: number | null, levels: unknown): LevelDefinition | null {
  if (score === null) return null;
  const parsed = ScoringEngine.parseLevels(levels);
  return (
    parsed.find((level) => score >= level.minPct && score <= level.maxPct) ??
    parsed[parsed.length - 1] ??
    null
  );
}

export function getEffectiveProfessionalReportConfig(
  assessment: Pick<
    typeof assessmentsTable.$inferSelect,
    "id" | "hasAiReport" | "aiReportPrice"
  >,
  config: AssessmentAiReportConfig | null,
): EffectiveProfessionalReportConfig {
  if (config) {
    return {
      assessmentId: config.assessmentId,
      isEnabled: config.isEnabled,
      title: config.title,
      salesDescription: config.salesDescription,
      valueDescription: config.valueDescription,
      features: config.features ?? [],
      price: config.price,
      prompt: config.prompt,
      model: config.model,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      tone: config.tone,
      language: config.language,
      promptVersion: config.promptVersion,
      source: "config",
    };
  }

  return {
    assessmentId: assessment.id,
    ...DEFAULT_CONFIG,
    isEnabled: assessment.hasAiReport,
    price: assessment.aiReportPrice ?? 0,
    source: "legacy",
  };
}

export async function getProfessionalReportConfig(
  assessmentId: number,
): Promise<EffectiveProfessionalReportConfig | null> {
  const [assessment] = await db
    .select({
      id: assessmentsTable.id,
      hasAiReport: assessmentsTable.hasAiReport,
      aiReportPrice: assessmentsTable.aiReportPrice,
    })
    .from(assessmentsTable)
    .where(eq(assessmentsTable.id, assessmentId))
    .limit(1);
  if (!assessment) return null;

  const [config] = await db
    .select()
    .from(assessmentAiReportConfigsTable)
    .where(eq(assessmentAiReportConfigsTable.assessmentId, assessmentId))
    .limit(1);

  return getEffectiveProfessionalReportConfig(assessment, config ?? null);
}

export async function buildProfessionalReportInput(
  sessionId: number,
): Promise<{
  session: typeof assessmentSessionsTable.$inferSelect;
  config: EffectiveProfessionalReportConfig;
  input: ProfessionalReportInput;
} | null> {
  const [session] = await db
    .select()
    .from(assessmentSessionsTable)
    .where(eq(assessmentSessionsTable.id, sessionId))
    .limit(1);
  if (!session || !session.completedAt) return null;

  const [assessment] = await db
    .select({
      id: assessmentsTable.id,
      title: assessmentsTable.title,
      description: assessmentsTable.description,
      globalLevels: assessmentsTable.globalLevels,
      hasAiReport: assessmentsTable.hasAiReport,
      aiReportPrice: assessmentsTable.aiReportPrice,
      productId: assessmentsTable.productId,
      productTitle: productsTable.title,
      productDescription: productsTable.description,
    })
    .from(assessmentsTable)
    .leftJoin(productsTable, eq(assessmentsTable.productId, productsTable.id))
    .where(eq(assessmentsTable.id, session.assessmentId))
    .limit(1);
  if (!assessment) return null;

  const [configRow] = await db
    .select()
    .from(assessmentAiReportConfigsTable)
    .where(eq(assessmentAiReportConfigsTable.assessmentId, assessment.id))
    .limit(1);
  const config = getEffectiveProfessionalReportConfig(
    {
      id: assessment.id,
      hasAiReport: assessment.hasAiReport,
      aiReportPrice: assessment.aiReportPrice,
    },
    configRow ?? null,
  );

  const [indices, questions, rules] = await Promise.all([
    db
      .select()
      .from(assessmentIndicesTable)
      .where(eq(assessmentIndicesTable.assessmentId, assessment.id))
      .orderBy(asc(assessmentIndicesTable.sortOrder)),
    db
      .select()
      .from(assessmentQuestionsTable)
      .where(eq(assessmentQuestionsTable.assessmentId, assessment.id))
      .orderBy(asc(assessmentQuestionsTable.sortOrder)),
    db
      .select()
      .from(assessmentRulesTable)
      .where(
        and(
          eq(assessmentRulesTable.assessmentId, assessment.id),
          eq(assessmentRulesTable.isActive, true),
        ),
      )
      .orderBy(asc(assessmentRulesTable.sortOrder)),
  ]);

  const answers = (session.answers as Record<string, unknown> | null) ?? {};
  const globalLevels = ScoringEngine.parseLevels(assessment.globalLevels);
  let scoringResult: ScoringResult | null = null;
  if (questions.length > 0) {
    scoringResult = ScoringEngine.compute(
      questions,
      indices,
      answers,
      globalLevels.length > 0 ? globalLevels : null,
    );
  }

  const finalScore = session.finalScore ?? scoringResult?.finalScore ?? null;
  const finalLevel =
    (finalScore === scoringResult?.finalScore ? scoringResult?.finalLevel : null) ??
    levelForScore(finalScore, assessment.globalLevels);
  const indexScores = (session.indexScores as Record<string, number> | null) ?? {};

  const indexInputs = indices.map((index) => {
    const score = indexScores[String(index.id)] ?? null;
    const level = levelForScore(score, index.levels);
    return {
      id: index.id,
      name: index.name,
      score,
      level: level?.label ?? null,
      description: level?.description ?? index.description,
      rawLevel: level,
    };
  });

  let recommendations: Recommendation[] = [];
  if (rules.length > 0 && scoringResult) {
    const evaluation = RecommendationEngine.evaluate(rules, {
      scoringResult,
      answers,
      currentLeadScore: 0,
    });
    recommendations = await hydrateCatalogTargets(evaluation.recommendations);
  }

  const roadmap = buildGrowthRoadmap(
    indexInputs.map(({ rawLevel: _rawLevel, ...index }) => ({
      ...index,
      level: index.level ? { label: index.level, description: index.description ?? undefined } : null,
    })),
    recommendations,
  );

  const strengths = indexInputs
    .filter((index) => (index.score ?? 0) >= 70)
    .map((index) => `${index.name}: ${index.score}٪${index.description ? ` — ${index.description}` : ""}`);
  const improvements = indexInputs
    .filter((index) => (index.score ?? 0) < 70)
    .map((index) => `${index.name}: ${index.score ?? 0}٪${index.description ? ` — ${index.description}` : ""}`);

  const importantAnswers = questions
    .filter((question) => {
      const answer = answers[String(question.id)];
      return question.type !== "info_section" && answer !== undefined && answer !== null && answer !== "";
    })
    .slice(0, 10)
    .map((question) => ({
      questionId: question.id,
      question: question.title,
      answer: asAnswer(answers[String(question.id)]),
    }));

  return {
    session,
    config,
    input: {
      assessment: {
        id: assessment.id,
        title: assessment.title,
        description: assessment.description,
      },
      overall: {
        score: finalScore,
        level: finalLevel?.label ?? null,
        levelDescription: finalLevel?.description ?? null,
      },
      indices: indexInputs.map(({ rawLevel: _rawLevel, ...index }) => index),
      strengths,
      improvements,
      roadmap,
      recommendations,
      importantAnswers,
      suggestedProduct: assessment.productId && assessment.productTitle
        ? {
            id: assessment.productId,
            title: assessment.productTitle,
            description: assessment.productDescription,
          }
        : null,
    },
  };
}

export function buildProfessionalReportPrompt(
  config: EffectiveProfessionalReportConfig,
  input: ProfessionalReportInput,
): ProfessionalReportPrompt {
  const system = [
    "You generate a structured professional assessment report.",
    "Return JSON only. Do not use markdown fences.",
    "The report must follow the requested language and tone.",
    "Never change, reinterpret, or contradict any score, level, rule-based recommendation, roadmap, or suggested product.",
    "Never promise income, success, or guaranteed outcomes.",
    "Use only the supplied assessment data.",
    "Required JSON shape: {summary:string,strengths:string[],improvements:string[],recommendations:{title:string,description:string}[],roadmap:{title:string,description:string}[],closing:string}.",
  ].join("\n");

  const user = [
    `Assessment title: ${input.assessment.title}`,
    `Language: ${config.language}`,
    `Tone: ${config.tone}`,
    config.prompt ? `Assessment-specific instructions:\n${config.prompt}` : "",
    "Immutable rule-based assessment data:",
    JSON.stringify(input, null, 2),
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    system,
    user,
    promptVersion: config.promptVersion,
    model: config.model,
    maxTokens: config.maxTokens,
    temperature: config.temperature,
  };
}

/** Builds the free preview without any AI call. */
export function buildRuleBasedProfessionalReport(
  input: ProfessionalReportInput,
): ProfessionalReportContent {
  const strengths = input.strengths.length > 0
    ? input.strengths
    : ["نتیجه شما یک نقطه شروع مشخص برای برنامه‌ریزی رشد فراهم می‌کند."];
  const improvements = input.improvements.length > 0
    ? input.improvements
    : ["با حفظ روند فعلی، یک هدف کوچک و قابل‌اندازه‌گیری برای ادامه مسیر انتخاب کنید."];
  const recommendations = input.recommendations.slice(0, 5).map((recommendation) => ({
    title: recommendation.title ?? `پیشنهاد ${recommendation.priority}`,
    description:
      recommendation.reason ??
      recommendation.description ??
      "این پیشنهاد بر اساس قوانین فعال این ارزیابی انتخاب شده است.",
  }));
  const roadmap = input.roadmap.weeklyPlan.slice(0, 4).map((week) => ({
    title: week.title,
    description: week.actions.join(" "),
  }));

  return {
    summary: `در ارزیابی «${input.assessment.title}»، امتیاز کلی شما ${input.overall.score ?? "ثبت‌نشده"}٪ و سطح کلی شما «${input.overall.level ?? "مشخص‌نشده"}» است.`,
    strengths,
    improvements,
    recommendations: recommendations.length > 0
      ? recommendations
      : input.roadmap.suggestedSteps.slice(0, 5).map((step) => ({
          title: step.title,
          description: step.description,
        })),
    roadmap: roadmap.length > 0
      ? roadmap
      : [{ title: input.roadmap.nextAction.title, description: input.roadmap.nextAction.description }],
    closing: "این نتیجه یک راهنمای Rule Based برای انتخاب قدم بعدی است؛ پیشرفت شما با اقدام‌های کوچک و پیوسته ساخته می‌شود.",
  };
}

/** Runtime contract guard for a future AI response before persistence. */
export function validateProfessionalReportContent(
  value: unknown,
): ProfessionalReportContent | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const isStringArray = (item: unknown): item is string[] =>
    Array.isArray(item) && item.every((entry) => typeof entry === "string");
  const isEntryArray = (
    item: unknown,
  ): item is Array<{ title: string; description: string }> =>
    Array.isArray(item) &&
    item.every(
      (entry) =>
        !!entry &&
        typeof entry === "object" &&
        typeof (entry as Record<string, unknown>).title === "string" &&
        typeof (entry as Record<string, unknown>).description === "string",
    );

  if (
    typeof candidate.summary !== "string" ||
    !isStringArray(candidate.strengths) ||
    !isStringArray(candidate.improvements) ||
    !isEntryArray(candidate.recommendations) ||
    !isEntryArray(candidate.roadmap) ||
    typeof candidate.closing !== "string"
  ) {
    return null;
  }

  return {
    summary: candidate.summary,
    strengths: candidate.strengths,
    improvements: candidate.improvements,
    recommendations: candidate.recommendations,
    roadmap: candidate.roadmap,
    closing: candidate.closing,
  };
}

export async function getStoredProfessionalReport(
  sessionId: number,
): Promise<typeof aiAssessmentReportsTable.$inferSelect | null> {
  const [report] = await db
    .select()
    .from(aiAssessmentReportsTable)
    .where(eq(aiAssessmentReportsTable.attemptId, sessionId))
    .limit(1);
  return report ?? null;
}