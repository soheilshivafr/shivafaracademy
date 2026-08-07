/**
 * RulesEngine v57 — موتور قوانین داینامیک شیوافر آکادمی
 *
 * این موتور پس از تکمیل تست، شروط هر قانون را روی نتایج کاربر ارزیابی می‌کند
 * و اقدامات (پیشنهادات محصول، دوره، تست، CTA، پیام) را برمی‌گرداند.
 *
 * Generic است — برای همه تست‌ها بدون تغییر کد کار می‌کند.
 */

import type {
  RuleCondition,
  RuleAction,
  RuleOperator,
  AssessmentRule,
} from "@workspace/db";
import type { ScoringResult } from "./scoring-engine";

// ─── Input types ──────────────────────────────────────────────────────────────

export interface RuleEvalInput {
  /** نتیجه کامل موتور امتیازدهی */
  scoringResult: ScoringResult;
  /** پاسخ‌های کاربر { questionId: value } */
  answers: Record<string, unknown>;
  /** lead score فعلی کاربر (اختیاری) */
  currentLeadScore?: number;
}

export interface MatchedRule {
  ruleId: number;
  name: string;
  sortOrder: number;
  actions: RuleAction;
}

export interface RulesEvalResult {
  /** همه قوانین منطبق (مرتب بر اساس sortOrder) */
  matchedRules: MatchedRule[];
  /** اقدامات ادغام‌شده از همه قوانین منطبق */
  merged: MergedActions;
}

export interface MergedActions {
  suggestedProductIds: number[];
  suggestedCourseIds: number[];
  suggestedAssessmentIds: number[];
  ctas: Array<{ text: string; url: string; style: string }>;
  messages: Array<{
    title?: string;
    body?: string;
    badge?: string;
    badgeColor?: string;
    icon?: string;
  }>;
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export class RulesEngine {
  /**
   * ارزیابی همه قوانین فعال یک تست روی نتایج کاربر.
   *
   * @param rules    قوانین فعال تست (از DB، مرتب بر اساس sort_order)
   * @param input    نتایج امتیازدهی + پاسخ‌ها + lead score
   * @returns        قوانین منطبق و اقدامات ادغام‌شده
   */
  static evaluate(rules: AssessmentRule[], input: RuleEvalInput): RulesEvalResult {
    const activeRules = rules.filter((r) => r.isActive);
    const matchedRules: MatchedRule[] = [];

    for (const rule of activeRules) {
      const conditions = RulesEngine.parseConditions(rule.conditions);
      if (!conditions.length) continue;

      const mode = (rule.conditionMode ?? "all") as "all" | "any";
      const matched = mode === "all"
        ? conditions.every((c) => RulesEngine.evalCondition(c, input))
        : conditions.some((c) => RulesEngine.evalCondition(c, input));

      if (matched) {
        matchedRules.push({
          ruleId: rule.id,
          name: rule.name,
          sortOrder: rule.sortOrder,
          actions: (rule.actions as RuleAction) ?? {},
        });
      }
    }

    // مرتب‌سازی نهایی بر اساس sortOrder
    matchedRules.sort((a, b) => a.sortOrder - b.sortOrder);

    return {
      matchedRules,
      merged: RulesEngine.mergeActions(matchedRules.map((r) => r.actions)),
    };
  }

  // ─── Condition evaluator ─────────────────────────────────────────────────

  private static evalCondition(cond: RuleCondition, input: RuleEvalInput): boolean {
    const { scoringResult, answers, currentLeadScore } = input;

    let actual: unknown;

    switch (cond.type) {
      case "finalScore":
        actual = scoringResult.finalScore;
        break;

      case "indexScore": {
        if (!cond.indexId) return false;
        const ir = scoringResult.indexResults.find((r) => r.indexId === cond.indexId);
        actual = ir?.normalizedScore ?? 0;
        break;
      }

      case "finalLevel":
        actual = scoringResult.finalLevel?.label ?? null;
        break;

      case "indexLevel": {
        if (!cond.indexId) return false;
        const ir = scoringResult.indexResults.find((r) => r.indexId === cond.indexId);
        actual = ir?.level?.label ?? null;
        break;
      }

      case "answer":
        if (!cond.questionId) return false;
        actual = answers[String(cond.questionId)];
        break;

      case "leadScore":
        actual = currentLeadScore ?? 0;
        break;

      default:
        return false;
    }

    return RulesEngine.applyOperator(cond.operator, actual, cond.value);
  }

  // ─── Operator logic ──────────────────────────────────────────────────────

  private static applyOperator(operator: RuleOperator, actual: unknown, expected: unknown): boolean {
    switch (operator) {
      case "eq":
        return String(actual) === String(expected);

      case "neq":
        return String(actual) !== String(expected);

      case "gt":
        return Number(actual) > Number(expected);

      case "gte":
        return Number(actual) >= Number(expected);

      case "lt":
        return Number(actual) < Number(expected);

      case "lte":
        return Number(actual) <= Number(expected);

      case "in": {
        const list = Array.isArray(expected) ? expected : [expected];
        if (Array.isArray(actual)) {
          // multi_choice: هر عضو actual که در expected باشد
          return (actual as unknown[]).some((a) => list.map(String).includes(String(a)));
        }
        return list.map(String).includes(String(actual));
      }

      case "between": {
        if (!Array.isArray(expected) || expected.length < 2) return false;
        const [min, max] = expected.map(Number);
        const n = Number(actual);
        return n >= min && n <= max;
      }

      case "contains": {
        // برای پاسخ multi_choice: بررسی وجود مقدار خاص در آرایه پاسخ‌ها
        if (Array.isArray(actual)) {
          return (actual as unknown[]).some((a) => String(a) === String(expected));
        }
        if (typeof actual === "string") {
          return actual.includes(String(expected));
        }
        return false;
      }

      default:
        return false;
    }
  }

  // ─── Merge actions ───────────────────────────────────────────────────────

  /**
   * ادغام اقدامات چند قانون منطبق:
   * - آرایه‌ها (products, courses, assessments) union می‌شوند (بدون تکرار)
   * - CTAها و پیام‌ها به ترتیب اضافه می‌شوند
   */
  private static mergeActions(actions: RuleAction[]): MergedActions {
    const productSet = new Set<number>();
    const courseSet = new Set<number>();
    const assessmentSet = new Set<number>();
    const ctas: MergedActions["ctas"] = [];
    const messages: MergedActions["messages"] = [];

    for (const action of actions) {
      (action.suggestedProductIds ?? []).forEach((id) => productSet.add(id));
      (action.suggestedCourseIds ?? []).forEach((id) => courseSet.add(id));
      (action.suggestedAssessmentIds ?? []).forEach((id) => assessmentSet.add(id));

      if (action.ctaText) {
        ctas.push({
          text: action.ctaText,
          url: action.ctaUrl ?? "",
          style: action.ctaStyle ?? "primary",
        });
      }

      if (action.messageTitle || action.messageBody) {
        messages.push({
          title: action.messageTitle,
          body: action.messageBody,
          badge: action.messageBadge,
          badgeColor: action.messageBadgeColor,
          icon: action.messageIcon,
        });
      }
    }

    return {
      suggestedProductIds: [...productSet],
      suggestedCourseIds: [...courseSet],
      suggestedAssessmentIds: [...assessmentSet],
      ctas,
      messages,
    };
  }

  // ─── Utilities ───────────────────────────────────────────────────────────

  private static parseConditions(raw: unknown): RuleCondition[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (c): c is RuleCondition =>
        c && typeof c === "object" && "type" in c && "operator" in c && "value" in c,
    );
  }

  /**
   * پیش‌نمایش ارزیابی یک قانون (dry-run) — برای ادمین
   */
  static previewRule(rule: AssessmentRule, input: RuleEvalInput): {
    matched: boolean;
    conditionResults: Array<{ condition: RuleCondition; passed: boolean }>;
  } {
    const conditions = RulesEngine.parseConditions(rule.conditions);
    const conditionResults = conditions.map((c) => ({
      condition: c,
      passed: RulesEngine.evalCondition(c, input),
    }));

    const mode = (rule.conditionMode ?? "all") as "all" | "any";
    const matched = mode === "all"
      ? conditionResults.every((r) => r.passed)
      : conditionResults.some((r) => r.passed);

    return { matched, conditionResults };
  }
}
