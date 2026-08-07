/**
 * ScoringEngine v56 — موتور امتیازدهی حرفه‌ای شیوافر آکادمی
 *
 * ویژگی‌ها:
 *  - اعمال وزن سوال (questionWeight)
 *  - اعمال وزن شاخص (index.weight) در امتیاز نهایی ترکیبی
 *  - نرمال‌سازی واقعی بر اساس حداقل/حداکثر تئوری (best/worst possible)
 *  - تعیین سطح کاربر به ازای هر شاخص و سطح کلی نهایی
 *  - کاملاً Generic — همه تست‌ها از همین موتور استفاده می‌کنند
 *  - سازگار با v54 (indexScores map) و سیستم قدیمی (score+indexIds)
 *
 * اولویت امتیازدهی گزینه:
 *   ۱. اگر option.indexScores حداقل یک entry داشته باشد → سیستم جدید v54+
 *   ۲. در غیر این صورت → fallback به option.score * option.weight * option.indexIds
 */

import type { QuestionOption } from "@workspace/db";

// ─── Input types ──────────────────────────────────────────────────────────────

export interface QuestionRow {
  id: number;
  type: string;
  isActive: boolean;
  options: unknown;
  indexIds: unknown;        // legacy: number[]
  questionWeight?: number | null; // v54+, default 1
}

export interface IndexRow {
  id: number;
  name: string;
  description: string | null;
  weight: number;           // وزن شاخص در امتیاز نهایی ترکیبی
  minScore: number;
  maxScore: number;
  levels: unknown;          // Array<LevelDefinition>
}

export type AnswerMap = Record<string, unknown>;

export interface LevelDefinition {
  label: string;
  minPct: number;
  maxPct: number;
  description: string;
  suggestion: string;
}

// ─── Output types ─────────────────────────────────────────────────────────────

export interface LevelMatch extends LevelDefinition {
  // نتیجهٔ تطبیق سطح با امتیاز
}

/** نتیجهٔ امتیازدهی برای یک شاخص */
export interface IndexScoringResult {
  indexId: number;
  name: string;
  description: string | null;
  /** وزن شاخص (از index.weight) — برای محاسبهٔ امتیاز نهایی ترکیبی */
  indexWeight: number;
  /** مجموع وزن‌دار نقاط خام (raw accumulated score) */
  rawScore: number;
  /** کمترین امتیاز خام ممکن (اگر بدترین گزینه‌ها انتخاب شوند) */
  minPossible: number;
  /** بیشترین امتیاز خام ممکن (اگر بهترین گزینه‌ها انتخاب شوند) */
  maxPossible: number;
  /** امتیاز نرمال‌شده ۰–۱۰۰ */
  normalizedScore: number;
  /** سطح تطبیق‌یافته بر اساس levels شاخص */
  level: LevelMatch | null;
}

/** نتیجهٔ کامل اجرای موتور امتیازدهی */
export interface ScoringResult {
  /** نتایج به تفکیک شاخص */
  indexResults: IndexScoringResult[];
  /** امتیاز نهایی ترکیبی ۰–۱۰۰ (میانگین وزن‌دار شاخص‌ها) */
  finalScore: number;
  /** سطح نهایی کاربر (از globalLevels تست یا شاخص اصلی) */
  finalLevel: LevelMatch | null;
  /** تأثیر بر lead score کاربر (برای CRM) */
  leadScoreImpact: number;
  /** نسخهٔ موتور — برای ردیابی */
  scoringVersion: "v56";
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export class ScoringEngine {

  /**
   * محاسبهٔ کامل امتیازدهی از سوالات، شاخص‌ها و پاسخ‌ها.
   * این تابع جایگزین computeIndexScores() و computeLeadScoreImpact() قدیمی می‌شود.
   *
   * @param questions   سوالات فعال تست (از DB)
   * @param indices     شاخص‌های تست (از DB)
   * @param answers     پاسخ‌های کاربر { questionId: value }
   * @param globalLevels سطح‌های کلی تست (اختیاری، از assessments.globalLevels)
   */
  static compute(
    questions: QuestionRow[],
    indices: IndexRow[],
    answers: AnswerMap,
    globalLevels?: LevelDefinition[] | null,
  ): ScoringResult {
    // مرحله ۱: انباشت خام امتیازها
    const accumulators = ScoringEngine.initAccumulators(indices);
    for (const q of questions) {
      if (!q.isActive) continue;
      const answer = answers[String(q.id)];
      if (answer == null) continue;
      const qWeight = ScoringEngine.resolveQuestionWeight(q);
      const options = ScoringEngine.parseOptions(q.options);
      ScoringEngine.processQuestion(q, options, qWeight, answer, accumulators);
    }

    // مرحله ۲: محاسبهٔ حداقل/حداکثر تئوری برای نرمال‌سازی
    const bounds = ScoringEngine.computeTheoreticalBounds(questions, indices);

    // مرحله ۳: ساخت نتایج به تفکیک شاخص
    const indexResults: IndexScoringResult[] = indices.map((idx) => {
      const acc = accumulators[idx.id];
      const { minBound, maxBound } = bounds[idx.id];
      const rawScore = acc.weightedSum;

      // نرمال‌سازی: (raw - min) / (max - min) × 100
      let normalizedScore: number;
      if (maxBound <= minBound) {
        // بازه‌ای وجود ندارد
        normalizedScore = acc.questionCount > 0 ? 50 : 0;
      } else {
        normalizedScore = ((rawScore - minBound) / (maxBound - minBound)) * 100;
      }
      normalizedScore = Math.round(Math.min(100, Math.max(0, normalizedScore)));

      const levels = ScoringEngine.parseLevels(idx.levels);
      const level = ScoringEngine.matchLevel(normalizedScore, levels);

      return {
        indexId: idx.id,
        name: idx.name,
        description: idx.description,
        indexWeight: idx.weight,
        rawScore: Math.round(rawScore * 100) / 100,
        minPossible: Math.round(minBound * 100) / 100,
        maxPossible: Math.round(maxBound * 100) / 100,
        normalizedScore,
        level,
      };
    });

    // مرحله ۴: امتیاز نهایی ترکیبی (میانگین وزن‌دار شاخص‌ها)
    const finalScore = ScoringEngine.computeFinalScore(indexResults);

    // مرحله ۵: تعیین سطح نهایی
    const finalLevel = ScoringEngine.resolveFinalLevel(finalScore, indexResults, indices, globalLevels);

    // مرحله ۶: تأثیر lead score
    const leadScoreImpact = ScoringEngine.computeLeadScoreImpact(questions, answers);

    return {
      indexResults,
      finalScore,
      finalLevel,
      leadScoreImpact,
      scoringVersion: "v56",
    };
  }

  /**
   * تبدیل ScoringResult به فرمت قدیمی indexScores برای backward compatibility.
   * indexScores: Record<string, number> (مقادیر ۰–۱۰۰ نرمال‌شده)
   */
  static toLegacyIndexScores(result: ScoringResult): Record<string, number> {
    const out: Record<string, number> = {};
    for (const r of result.indexResults) {
      out[String(r.indexId)] = r.normalizedScore;
    }
    return out;
  }

  // ─── Private: Accumulators ────────────────────────────────────────────────

  private static initAccumulators(
    indices: IndexRow[],
  ): Record<number, { weightedSum: number; questionCount: number }> {
    const acc: Record<number, { weightedSum: number; questionCount: number }> = {};
    for (const idx of indices) {
      acc[idx.id] = { weightedSum: 0, questionCount: 0 };
    }
    return acc;
  }

  private static resolveQuestionWeight(q: QuestionRow): number {
    const w = q.questionWeight;
    return typeof w === "number" && w > 0 ? w : 1;
  }

  private static parseOptions(raw: unknown): QuestionOption[] {
    return Array.isArray(raw) ? (raw as QuestionOption[]) : [];
  }

  // ─── Private: Question Processing ────────────────────────────────────────

  private static processQuestion(
    q: QuestionRow,
    options: QuestionOption[],
    qWeight: number,
    answer: unknown,
    acc: Record<number, { weightedSum: number; questionCount: number }>,
  ): void {
    const type = q.type;

    if (type === "single_choice" || type === "yes_no" || type === "dropdown") {
      const chosen = options.find((o) => o.id === answer);
      if (chosen) {
        ScoringEngine.applyOption(chosen, qWeight, q, acc);
      }

    } else if (type === "multi_choice") {
      const chosen = Array.isArray(answer) ? (answer as string[]) : [];
      for (const cid of chosen) {
        const opt = options.find((o) => o.id === cid);
        if (opt) ScoringEngine.applyOption(opt, qWeight, q, acc);
      }

    } else if (type === "scale_5" || type === "scale_10") {
      const val = Number(answer);
      const maxScale = type === "scale_5" ? 5 : 10;
      if (!isNaN(val) && val >= 0) {
        // تبدیل مقیاس به درصد ۰–۱۰۰، سپس اعمال وزن سوال
        const pct = (val / maxScale) * 100;
        const legacyIds = ScoringEngine.legacyIndexIds(q);
        for (const iid of legacyIds) {
          if (acc[iid] !== undefined) {
            acc[iid].weightedSum += pct * qWeight;
            acc[iid].questionCount++;
          }
        }
      }
    }
    // short_text, long_text, number, info_section, conditional → به شاخص‌ها کمک نمی‌کنند
  }

  private static applyOption(
    opt: QuestionOption,
    qWeight: number,
    q: QuestionRow,
    acc: Record<number, { weightedSum: number; questionCount: number }>,
  ): void {
    // v54+: اولویت با indexScores map
    if (opt.indexScores && Object.keys(opt.indexScores).length > 0) {
      for (const [iidStr, score] of Object.entries(opt.indexScores)) {
        const iid = parseInt(iidStr);
        if (!isNaN(iid) && acc[iid] !== undefined) {
          acc[iid].weightedSum += score * qWeight;
          acc[iid].questionCount++;
        }
      }
    } else {
      // Legacy: score × optionWeight × questionWeight → indexIds
      const optWeight = typeof opt.weight === "number" && opt.weight > 0 ? opt.weight : 1;
      const ids = Array.isArray(opt.indexIds) && opt.indexIds.length > 0
        ? opt.indexIds
        : ScoringEngine.legacyIndexIds(q);
      for (const iid of ids) {
        if (acc[iid] !== undefined) {
          acc[iid].weightedSum += (opt.score ?? 0) * optWeight * qWeight;
          acc[iid].questionCount++;
        }
      }
    }
  }

  private static legacyIndexIds(q: QuestionRow): number[] {
    return Array.isArray(q.indexIds) ? (q.indexIds as number[]) : [];
  }

  // ─── Private: Theoretical Bounds ─────────────────────────────────────────

  /**
   * محاسبهٔ حداقل و حداکثر تئوری امتیاز خام هر شاخص.
   * برای نرمال‌سازی صحیح: بهترین پاسخ → ۱۰۰، بدترین → ۰
   */
  private static computeTheoreticalBounds(
    questions: QuestionRow[],
    indices: IndexRow[],
  ): Record<number, { minBound: number; maxBound: number }> {
    const bounds: Record<number, { minBound: number; maxBound: number }> = {};
    for (const idx of indices) {
      bounds[idx.id] = { minBound: 0, maxBound: 0 };
    }

    for (const q of questions) {
      if (!q.isActive) continue;
      const qWeight = ScoringEngine.resolveQuestionWeight(q);
      const options = ScoringEngine.parseOptions(q.options);
      const type = q.type;

      if (type === "single_choice" || type === "yes_no" || type === "dropdown") {
        // Min = کمترین امتیاز گزینه‌ها برای هر شاخص
        // Max = بیشترین امتیاز گزینه‌ها برای هر شاخص
        const contribs = ScoringEngine.gatherContribs(options, qWeight, q);
        for (const [iidStr, scores] of Object.entries(contribs)) {
          const iid = parseInt(iidStr);
          if (!isNaN(iid) && bounds[iid] !== undefined && scores.length > 0) {
            bounds[iid].minBound += Math.min(...scores);
            bounds[iid].maxBound += Math.max(...scores);
          }
        }

      } else if (type === "multi_choice") {
        // Max = جمع همهٔ مشارکت‌های مثبت
        // Min = جمع همهٔ مشارکت‌های منفی
        const contribs = ScoringEngine.gatherContribs(options, qWeight, q);
        for (const [iidStr, scores] of Object.entries(contribs)) {
          const iid = parseInt(iidStr);
          if (!isNaN(iid) && bounds[iid] !== undefined) {
            bounds[iid].minBound += scores.filter((s) => s < 0).reduce((a, b) => a + b, 0);
            bounds[iid].maxBound += scores.filter((s) => s > 0).reduce((a, b) => a + b, 0);
          }
        }

      } else if (type === "scale_5" || type === "scale_10") {
        // Min = ۰ (پایین‌ترین مقدار مقیاس)، Max = ۱۰۰ × qWeight
        const legacyIds = ScoringEngine.legacyIndexIds(q);
        for (const iid of legacyIds) {
          if (bounds[iid] !== undefined) {
            bounds[iid].minBound += 0;
            bounds[iid].maxBound += 100 * qWeight;
          }
        }
      }
    }

    return bounds;
  }

  /**
   * جمع‌آوری مشارکت هر گزینه برای هر شاخص.
   * خروجی: { indexId: [score1, score2, ...] }
   */
  private static gatherContribs(
    options: QuestionOption[],
    qWeight: number,
    q: QuestionRow,
  ): Record<number, number[]> {
    const result: Record<number, number[]> = {};

    for (const opt of options) {
      if (opt.indexScores && Object.keys(opt.indexScores).length > 0) {
        for (const [iidStr, score] of Object.entries(opt.indexScores)) {
          const iid = parseInt(iidStr);
          if (!isNaN(iid)) {
            if (!result[iid]) result[iid] = [];
            result[iid].push(score * qWeight);
          }
        }
      } else {
        const optWeight = typeof opt.weight === "number" && opt.weight > 0 ? opt.weight : 1;
        const ids = Array.isArray(opt.indexIds) && opt.indexIds.length > 0
          ? opt.indexIds
          : ScoringEngine.legacyIndexIds(q);
        for (const iid of ids) {
          if (!result[iid]) result[iid] = [];
          result[iid].push((opt.score ?? 0) * optWeight * qWeight);
        }
      }
    }

    return result;
  }

  // ─── Private: Final Score ─────────────────────────────────────────────────

  private static computeFinalScore(indexResults: IndexScoringResult[]): number {
    if (indexResults.length === 0) return 0;

    const totalWeight = indexResults.reduce((s, r) => s + r.indexWeight, 0);

    if (totalWeight > 0) {
      // میانگین وزن‌دار: Σ(score_i × weight_i) / Σ(weight_i)
      const weighted = indexResults.reduce((s, r) => s + r.normalizedScore * r.indexWeight, 0);
      return Math.round(weighted / totalWeight);
    } else {
      // همهٔ وزن‌ها صفرند → میانگین ساده
      const sum = indexResults.reduce((s, r) => s + r.normalizedScore, 0);
      return Math.round(sum / indexResults.length);
    }
  }

  private static resolveFinalLevel(
    finalScore: number,
    indexResults: IndexScoringResult[],
    indices: IndexRow[],
    globalLevels?: LevelDefinition[] | null,
  ): LevelMatch | null {
    // اولویت ۱: globalLevels تست
    if (globalLevels && globalLevels.length > 0) {
      return ScoringEngine.matchLevel(finalScore, globalLevels);
    }

    // اولویت ۲: سطح‌های شاخص با بیشترین وزن
    if (indices.length === 0) return null;
    const primaryIdx = indices.reduce(
      (best, cur) => (cur.weight > best.weight ? cur : best),
      indices[0],
    );
    const primaryLevels = ScoringEngine.parseLevels(primaryIdx?.levels);
    if (primaryLevels.length > 0) {
      return ScoringEngine.matchLevel(finalScore, primaryLevels);
    }

    // اولویت ۳: اگر حتی یک indexResult دارای level باشد، اولی را برگردان
    const firstWithLevel = indexResults.find((r) => r.level !== null);
    return firstWithLevel?.level ?? null;
  }

  // ─── Private: Lead Score ──────────────────────────────────────────────────

  static computeLeadScoreImpact(
    questions: QuestionRow[],
    answers: AnswerMap,
  ): number {
    let delta = 0;
    for (const q of questions) {
      if (!q.isActive) continue;
      const answer = answers[String(q.id)];
      if (answer == null) continue;
      const options = ScoringEngine.parseOptions(q.options);

      if (q.type === "single_choice" || q.type === "yes_no" || q.type === "dropdown") {
        const chosen = options.find((o) => o.id === answer);
        if (chosen) delta += chosen.leadScore ?? 0;
      } else if (q.type === "multi_choice") {
        const chosen = Array.isArray(answer) ? (answer as string[]) : [];
        for (const cid of chosen) {
          const opt = options.find((o) => o.id === cid);
          if (opt) delta += opt.leadScore ?? 0;
        }
      }
    }
    return delta;
  }

  // ─── Public Utilities ────────────────────────────────────────────────────

  static parseLevels(raw: unknown): LevelMatch[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (l): l is LevelMatch =>
        l &&
        typeof l === "object" &&
        "label" in l &&
        "minPct" in l &&
        "maxPct" in l,
    );
  }

  /**
   * پیدا کردن سطح متناسب با امتیاز در لیست سطح‌ها.
   * Fallback: آخرین سطح (برای امتیازهای خارج از بازه)
   */
  static matchLevel(score: number, levels: LevelMatch[]): LevelMatch | null {
    if (!levels.length) return null;
    const found = levels.find((l) => score >= l.minPct && score <= l.maxPct);
    return found ?? levels[levels.length - 1];
  }
}
