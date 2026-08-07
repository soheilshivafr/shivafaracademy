import type { Recommendation } from "@workspace/db";

export interface GrowthRoadmapIndex {
  id: number;
  name: string;
  score: number | null;
  description?: string | null;
  level?: {
    label?: string;
    description?: string;
    suggestion?: string;
  } | null;
}

export interface GrowthRoadmap {
  priorities: Array<{
    rank: number;
    indexId: number | null;
    title: string;
    score: number | null;
    gap: number;
    reason: string;
  }>;
  suggestedSteps: Array<{
    id: string;
    priorityRank: number;
    title: string;
    description: string;
    indexId: number | null;
    source: "assessment" | "recommendation";
    targetType?: Recommendation["targetType"];
    targetId?: number | string;
    targetSlug?: string;
    ctaLabel?: string;
    ctaUrl?: string;
    ctaRoute?: string;
  }>;
  weeklyPlan: Array<{
    week: number;
    title: string;
    focus: string;
    actions: string[];
    expectedOutcome: string;
  }>;
  nextAction: {
    title: string;
    description: string;
    priorityRank: number;
    indexId: number | null;
    ctaLabel: string;
  };
  checklist: Array<{
    id: string;
    label: string;
    priorityRank: number;
    indexId: number | null;
  }>;
}

const clamp = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(100, Math.max(0, Math.round(value)))
    : null;

const clean = (value: string | null | undefined, fallback: string) =>
  value?.trim() || fallback;

/**
 * Builds a practical roadmap from the scored result and matched rule output.
 * It deliberately contains no catalog or fixed assessment data: every item
 * comes from the current result's indices, levels, and recommendations.
 */
export function buildGrowthRoadmap(
  indices: GrowthRoadmapIndex[],
  recommendations: Recommendation[] = [],
): GrowthRoadmap {
  const scored = indices
    .map((index) => {
      const score = clamp(index.score);
      const gap = score === null ? 100 : 100 - score;
      const description = clean(
        index.level?.suggestion || index.level?.description || index.description,
        "با یک اقدام کوچک و قابل اندازه‌گیری، این حوزه را تقویت کنید.",
      );
      return { index, score, gap, description, priorityScore: gap };
    })
    .filter(({ score }) => score === null || score < 70)
    .sort((a, b) => b.priorityScore - a.priorityScore);

  const priorities = scored.map(({ index, score, gap, description }, position) => ({
    rank: position + 1,
    indexId: index.id,
    title: index.name,
    score,
    gap,
    reason:
      score === null
        ? `برای ${index.name} هنوز امتیازی ثبت نشده است؛ ابتدا یک خط پایه بسازید.`
        : `${index.name} با امتیاز ${score}٪ بیشترین فاصله را تا سطح مطلوب دارد.`,
  }));

  const assessmentSteps = scored.slice(0, 6).map(({ index, score, description }, position) => {
    const rank = position + 1;
    const normalizedScore = score ?? 0;
    return {
      id: `index-${index.id}`,
      priorityRank: rank,
      title: `تقویت ${index.name}`,
      description:
        normalizedScore < 40
          ? `از یک تمرین ساده شروع کنید: ${description}`
          : `این هفته یک هدف کوچک برای ${index.name} انتخاب و نتیجه را ثبت کنید. ${description}`,
      indexId: index.id,
      source: "assessment" as const,
    };
  });

  const recommendationSteps = recommendations.slice(0, 6).map((recommendation, position) => ({
    id: `recommendation-${recommendation.sourceRuleId}-${position}`,
    priorityRank: Math.min(position + 1, Math.max(assessmentSteps.length, 1)),
    title: clean(recommendation.title, `پیشنهاد مرتبط ${position + 1}`),
    description: clean(
      recommendation.reason || recommendation.description,
      "این پیشنهاد بر اساس نتیجه و قوانین فعال این ارزیابی انتخاب شده است.",
    ),
    indexId: null,
    source: "recommendation" as const,
    targetType: recommendation.targetType,
    targetId: recommendation.targetId,
    targetSlug: recommendation.targetSlug,
    ctaLabel: recommendation.ctaLabel,
    ctaUrl: recommendation.ctaUrl,
    ctaRoute: recommendation.ctaRoute,
  }));

  const suggestedSteps = [...assessmentSteps, ...recommendationSteps];
  const focusTitles = priorities.slice(0, 4).map((item) => item.title);
  const fallbackFocus = "مرور نتیجه و انتخاب یک اقدام قابل اندازه‌گیری";
  const weeklyPlan = Array.from({ length: 4 }, (_, offset) => {
    const focus = focusTitles[offset] || focusTitles[focusTitles.length - 1] || fallbackFocus;
    const step = suggestedSteps[offset] || suggestedSteps[0];
    const action = step?.description || `برای «${focus}» یک اقدام کوتاه انجام دهید و نتیجه را ثبت کنید.`;
    return {
      week: offset + 1,
      title: `هفته ${offset + 1}: ${focus}`,
      focus,
      actions: [
        action,
        offset === 3
          ? "در پایان هفته، نتیجه را با خط پایه مقایسه و قدم بعدی را انتخاب کنید."
          : "در پایان هفته، پیشرفت خود را در یک جمله ثبت کنید.",
      ],
      expectedOutcome: `یک پیشرفت قابل مشاهده در ${focus} و داده‌ای برای تصمیم هفته بعد`,
    };
  });

  const firstPriority = priorities[0];
  const nextAction = firstPriority
    ? {
        title: `امروز: یک قدم برای ${firstPriority.title}`,
        description:
          firstPriority.score === null
            ? `یک وضعیت اولیه برای ${firstPriority.title} ثبت کنید تا مسیر رشد شما قابل اندازه‌گیری شود.`
            : `یک اقدام ۱۵ دقیقه‌ای برای کاهش فاصله ${firstPriority.gap}٪ در ${firstPriority.title} تعریف و انجام دهید.`,
        priorityRank: firstPriority.rank,
        indexId: firstPriority.indexId,
        ctaLabel: "شروع قدم بعدی",
      }
    : {
        title: "امروز: نتیجه را مرور کنید",
        description: "نتیجه را مرور کنید و یک اقدام مشخص برای هفته اول انتخاب کنید.",
        priorityRank: 1,
        indexId: null,
        ctaLabel: "ثبت قدم اول",
      };

  const checklist = suggestedSteps.slice(0, 8).map((step) => ({
    id: `check-${step.id}`,
    label: step.title,
    priorityRank: step.priorityRank,
    indexId: step.indexId,
  }));

  if (checklist.length === 0) {
    checklist.push({
      id: "check-review",
      label: "نتیجه را مرور و قدم اول را ثبت کنید",
      priorityRank: 1,
      indexId: null,
    });
  }

  return { priorities, suggestedSteps, weeklyPlan, nextAction, checklist };
}