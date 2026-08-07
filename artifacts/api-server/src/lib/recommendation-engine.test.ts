import assert from "node:assert/strict";
import test from "node:test";
import type { AssessmentRule } from "@workspace/db";
import { RecommendationEngine } from "./recommendation-engine";
import type { ScoringResult } from "./scoring-engine";

const scoringResult: ScoringResult = {
  indexResults: [],
  finalScore: 80,
  finalLevel: null,
  leadScoreImpact: 0,
  scoringVersion: "v56",
};

function rule(
  id: number,
  sortOrder: number,
  action: Record<string, unknown>,
  minimumScore = 0,
): AssessmentRule {
  return {
    id,
    assessmentId: 10,
    name: `rule-${id}`,
    description: null,
    isActive: true,
    sortOrder,
    conditionMode: "all",
    conditions: [{
      type: "finalScore",
      operator: "gte",
      value: minimumScore,
    }],
    actions: action,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  } as AssessmentRule;
}

test("multiple matched rules produce all supported recommendation types", () => {
  const result = RecommendationEngine.evaluate(
    [
      rule(1, 20, {
        recommendations: [
          { targetType: "Product", targetId: 101, priority: 20, title: "Product from rule" },
          { targetType: "Course", targetSlug: "course-a", priority: 10 },
          { targetType: "Tool", targetSlug: "tool-a", priority: 9 },
        ],
      }),
      rule(2, 10, {
        recommendations: [
          { targetType: "Next Test", targetId: "assessment-b", priority: 50 },
          { targetType: "Next Action", targetSlug: "action-a", priority: 5, ctaLabel: "Continue" },
        ],
      }),
    ],
    { scoringResult, answers: {} },
  );

  assert.deepEqual(
    result.recommendations.map(({ targetType, targetId, targetSlug }) => ({
      targetType,
      targetId,
      targetSlug,
    })),
    [
      { targetType: "Next Test", targetId: "assessment-b", targetSlug: undefined },
      { targetType: "Product", targetId: 101, targetSlug: undefined },
      { targetType: "Course", targetId: undefined, targetSlug: "course-a" },
      { targetType: "Tool", targetId: undefined, targetSlug: "tool-a" },
      { targetType: "Next Action", targetId: undefined, targetSlug: "action-a" },
    ],
  );
});

test("priority is descending and duplicate targets are emitted once", () => {
  const result = RecommendationEngine.evaluate(
    [
      rule(1, 1, {
        recommendations: [
          { targetType: "Product", targetId: 7, priority: 10, reason: "first" },
          { targetType: "Product", targetId: 7, priority: 8, reason: "duplicate" },
        ],
      }),
      rule(2, 2, {
        recommendations: [
          { targetType: "Course", targetId: 9, priority: 20 },
          { targetType: "Tool", targetSlug: "tool", priority: 1 },
        ],
      }),
    ],
    { scoringResult, answers: {} },
  );

  assert.deepEqual(
    result.recommendations.map((item) => `${item.targetType}:${item.targetId ?? item.targetSlug}`),
    ["Course:9", "Product:7", "Tool:tool"],
  );
  assert.equal(result.recommendations.find((item) => item.targetId === 7)?.reason, "first");
});

test("unmatched rules return no recommendations and no fallback content", () => {
  const result = RecommendationEngine.evaluate(
    [rule(1, 1, {
      recommendations: [
        { targetType: "Product", targetId: 99, title: "Should not appear" },
      ],
    }, 90)],
    { scoringResult, answers: {} },
  );

  assert.deepEqual(result.recommendations, []);
  assert.deepEqual(result.matchedRules, []);
});

test("legacy rule targets are normalized and deduplicated with generic targets", () => {
  const result = RecommendationEngine.evaluate(
    [rule(1, 1, {
      suggestedProductIds: [4, 4],
      suggestedCourseIds: [8],
      suggestedAssessmentIds: [12],
      recommendations: [
        { targetType: "Product", targetId: 4, priority: 10 },
      ],
    })],
    { scoringResult, answers: {} },
  );

  assert.deepEqual(
    result.recommendations.map((item) => `${item.targetType}:${item.targetId}`),
    ["Product:4", "Course:8", "Next Test:12"],
  );
});