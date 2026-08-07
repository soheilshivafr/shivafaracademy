import { and, asc, eq, inArray } from "drizzle-orm";
import {
  assessmentIndicesTable,
  assessmentQuestionsTable,
  assessmentRulesTable,
  assessmentsTable,
  coursesTable,
  db,
  productsTable,
} from "@workspace/db";
import type {
  Recommendation,
  RecommendationTargetType,
} from "@workspace/db";
import type { RuleEvalInput } from "./rules-engine";
import {
  RecommendationEngine,
  type RecommendationEvaluationResult,
} from "./recommendation-engine";

export async function evaluateAssessmentRecommendations(
  assessmentId: number,
  input: RuleEvalInput,
): Promise<RecommendationEvaluationResult & { recommendations: Recommendation[] }> {
  const rules = await db
    .select()
    .from(assessmentRulesTable)
    .where(and(
      eq(assessmentRulesTable.assessmentId, assessmentId),
      eq(assessmentRulesTable.isActive, true),
    ))
    .orderBy(asc(assessmentRulesTable.sortOrder));

  const evaluation = RecommendationEngine.evaluate(rules, input);
  const recommendations = await hydrateCatalogTargets(evaluation.recommendations);
  return { ...evaluation, recommendations };
}

export async function buildAssessmentScoringInput(
  assessmentId: number,
  answers: Record<string, unknown>,
): Promise<RuleEvalInput | null> {
  const [assessment] = await db
    .select({ globalLevels: assessmentsTable.globalLevels })
    .from(assessmentsTable)
    .where(eq(assessmentsTable.id, assessmentId))
    .limit(1);
  if (!assessment) return null;

  const [questions, indices] = await Promise.all([
    db
      .select()
      .from(assessmentQuestionsTable)
      .where(and(
        eq(assessmentQuestionsTable.assessmentId, assessmentId),
        eq(assessmentQuestionsTable.isActive, true),
      )),
    db
      .select()
      .from(assessmentIndicesTable)
      .where(eq(assessmentIndicesTable.assessmentId, assessmentId)),
  ]);

  const { ScoringEngine } = await import("./scoring-engine");
  const globalLevels = ScoringEngine.parseLevels(assessment.globalLevels);
  return {
    scoringResult: ScoringEngine.compute(
      questions,
      indices,
      answers,
      globalLevels.length ? globalLevels : null,
    ),
    answers,
    currentLeadScore: 0,
  };
}

export async function hydrateCatalogTargets(
  recommendations: Recommendation[],
): Promise<Recommendation[]> {
  const idsByType = new Map<RecommendationTargetType, number[]>();
  for (const recommendation of recommendations) {
    if (typeof recommendation.targetId !== "number") continue;
    const ids = idsByType.get(recommendation.targetType) ?? [];
    ids.push(recommendation.targetId);
    idsByType.set(recommendation.targetType, ids);
  }

  const productIds = idsByType.get("Product") ?? [];
  const courseIds = idsByType.get("Course") ?? [];
  const assessmentIds = idsByType.get("Next Test") ?? [];

  const [products, courses, assessments] = await Promise.all([
    productIds.length
      ? db
          .select({ id: productsTable.id, title: productsTable.title, description: productsTable.description })
          .from(productsTable)
          .where(inArray(productsTable.id, productIds))
      : Promise.resolve([]),
    courseIds.length
      ? db
          .select({ id: coursesTable.id, title: coursesTable.title, description: coursesTable.description })
          .from(coursesTable)
          .where(inArray(coursesTable.id, courseIds))
      : Promise.resolve([]),
    assessmentIds.length
      ? db
          .select({
            id: assessmentsTable.id,
            title: assessmentsTable.title,
            description: assessmentsTable.description,
            slug: assessmentsTable.slug,
          })
          .from(assessmentsTable)
          .where(inArray(assessmentsTable.id, assessmentIds))
      : Promise.resolve([]),
  ]);

  const catalogs = new Map<string, { title: string; description: string | null; slug?: string }>();
  for (const item of products) catalogs.set(`Product:${item.id}`, item);
  for (const item of courses) catalogs.set(`Course:${item.id}`, item);
  for (const item of assessments) catalogs.set(`Next Test:${item.id}`, item);

  return recommendations.map((recommendation) => {
    if (typeof recommendation.targetId !== "number") return recommendation;
    const catalog = catalogs.get(`${recommendation.targetType}:${recommendation.targetId}`);
    if (!catalog) return recommendation;
    return {
      ...recommendation,
      title: recommendation.title ?? catalog.title,
      description: recommendation.description ?? catalog.description ?? undefined,
      targetSlug: recommendation.targetSlug ?? catalog.slug,
    };
  });
}