import type {
  AssessmentRule,
  Recommendation,
  RecommendationAction,
  RuleAction,
} from "@workspace/db";
import { RulesEngine, type RuleEvalInput, type RulesEvalResult } from "./rules-engine";

export interface RecommendationEvaluationResult {
  recommendations: Recommendation[];
  matchedRules: RulesEvalResult["matchedRules"];
  rulesResult: RulesEvalResult;
}

interface Candidate {
  recommendation: Recommendation;
  ruleSortOrder: number;
  candidateOrder: number;
}

/**
 * Generic recommendation layer for Tests & Assessments.
 *
 * RulesEngine remains the only decision source. This class only normalizes
 * matched Rule actions, orders them, and removes duplicate targets.
 */
export class RecommendationEngine {
  static evaluate(
    rules: AssessmentRule[],
    input: RuleEvalInput,
  ): RecommendationEvaluationResult {
    const rulesResult = RulesEngine.evaluate(rules, input);
    return {
      recommendations: RecommendationEngine.fromRulesResult(rulesResult),
      matchedRules: rulesResult.matchedRules,
      rulesResult,
    };
  }

  static fromRulesResult(rulesResult: RulesEvalResult): Recommendation[] {
    const candidates: Candidate[] = [];

    for (const matchedRule of rulesResult.matchedRules) {
      const action = matchedRule.actions ?? {};
      const generic = Array.isArray(action.recommendations)
        ? action.recommendations
        : [];

      generic.forEach((item, index) => {
        const recommendation = RecommendationEngine.normalize(
          item,
          matchedRule.ruleId,
          matchedRule.name,
          item.priority ?? -matchedRule.sortOrder,
        );
        if (recommendation) {
          candidates.push({
            recommendation,
            ruleSortOrder: matchedRule.sortOrder,
            candidateOrder: index,
          });
        }
      });

      // Read the existing action fields through the same generic contract.
      // This keeps already-authored Rules Engine data compatible without
      // introducing a second recommendation source.
      RecommendationEngine.addLegacyTargetCandidates(
        candidates,
        action,
        matchedRule.ruleId,
        matchedRule.name,
        matchedRule.sortOrder,
        generic.length,
      );
    }

    candidates.sort((a, b) =>
      b.recommendation.priority - a.recommendation.priority ||
      a.ruleSortOrder - b.ruleSortOrder ||
      a.candidateOrder - b.candidateOrder,
    );

    const seen = new Set<string>();
    const recommendations: Recommendation[] = [];
    for (const candidate of candidates) {
      const key = RecommendationEngine.identity(candidate.recommendation);
      if (seen.has(key)) continue;
      seen.add(key);
      recommendations.push(candidate.recommendation);
    }
    return recommendations;
  }

  private static addLegacyTargetCandidates(
    candidates: Candidate[],
    action: RuleAction,
    ruleId: number,
    ruleName: string,
    ruleSortOrder: number,
    startOrder: number,
  ): void {
    const legacyTargets: Array<{
      targetType: "Product" | "Course" | "Next Test";
      ids?: number[];
    }> = [
      { targetType: "Product", ids: action.suggestedProductIds },
      { targetType: "Course", ids: action.suggestedCourseIds },
      { targetType: "Next Test", ids: action.suggestedAssessmentIds },
    ];

    let order = startOrder;
    for (const target of legacyTargets) {
      for (const targetId of target.ids ?? []) {
        const recommendation = RecommendationEngine.normalize(
          { targetType: target.targetType, targetId },
          ruleId,
          ruleName,
          -ruleSortOrder,
        );
        if (recommendation) {
          candidates.push({
            recommendation,
            ruleSortOrder,
            candidateOrder: order++,
          });
        }
      }
    }

    if (action.ctaText && (action.ctaUrl || action.ctaText)) {
      const recommendation = RecommendationEngine.normalize(
        {
          targetType: "Next Action",
          title: action.messageTitle,
          description: action.messageBody,
          reason: action.messageBody,
          ctaLabel: action.ctaText,
          ctaUrl: action.ctaUrl,
        },
        ruleId,
        ruleName,
        -ruleSortOrder,
      );
      if (recommendation) {
        candidates.push({
          recommendation,
          ruleSortOrder,
          candidateOrder: order,
        });
      }
    }
  }

  private static normalize(
    action: RecommendationAction,
    sourceRuleId: number,
    sourceRuleName: string,
    priority: number,
  ): Recommendation | null {
    if (!action || typeof action !== "object" || !action.targetType) {
      return null;
    }

    const hasTarget = action.targetId !== undefined ||
      Boolean(action.targetSlug) ||
      Boolean(action.ctaUrl) ||
      Boolean(action.ctaRoute) ||
      Boolean(action.title) ||
      Boolean(action.description) ||
      Boolean(action.reason);

    if (!hasTarget) return null;

    return {
      targetType: action.targetType,
      ...(action.targetId !== undefined ? { targetId: action.targetId } : {}),
      ...(action.targetSlug ? { targetSlug: action.targetSlug } : {}),
      priority: Number.isFinite(priority) ? priority : 0,
      ...(action.reason ? { reason: action.reason } : {}),
      ...(action.title ? { title: action.title } : {}),
      ...(action.description ? { description: action.description } : {}),
      ...(action.ctaLabel ? { ctaLabel: action.ctaLabel } : {}),
      ...(action.ctaUrl ? { ctaUrl: action.ctaUrl } : {}),
      ...(action.ctaRoute ? { ctaRoute: action.ctaRoute } : {}),
      sourceRuleId,
      sourceRuleName,
    };
  }

  private static identity(recommendation: Recommendation): string {
    const target =
      recommendation.targetId !== undefined
        ? `id:${String(recommendation.targetId)}`
        : recommendation.targetSlug
          ? `slug:${recommendation.targetSlug}`
          : `content:${[
              recommendation.ctaRoute,
              recommendation.ctaUrl,
              recommendation.title,
              recommendation.description,
              recommendation.reason,
            ].join("|")}`;
    return `${recommendation.targetType}|${target}`;
  }
}