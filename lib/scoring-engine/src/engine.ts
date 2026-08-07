import type {
  ScoringQuestion,
  ScoringIndex,
  ScoringLevel,
  IndexScoreResult,
  ScoreResult,
  ScoreMeta,
} from "./types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Clamp a number to [min, max] */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Round to N decimal places */
function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Normalize a raw score into the 0–100 range using the index's theoretical
 * min/max.  When minScore === maxScore the function returns 0.
 */
function normalize(raw: number, minScore: number, maxScore: number): number {
  if (maxScore === minScore) return 0;
  return clamp(((raw - minScore) / (maxScore - minScore)) * 100, 0, 100);
}

/**
 * Find the matching level for a percentage score.
 * Levels are checked inclusively on both ends.
 * The first matching level wins (important: define levels in ascending order).
 */
export function matchLevel(pct: number, levels: ScoringLevel[]): ScoringLevel | null {
  if (!levels || levels.length === 0) return null;
  for (const lvl of levels) {
    if (pct >= lvl.minPct && pct <= lvl.maxPct) return lvl;
  }
  // Fallback: return the last level when score exceeds all defined ranges
  return levels[levels.length - 1] ?? null;
}

// ─── Per-question contribution accumulator ────────────────────────────────────

interface IndexAccumulator {
  weightedRaw: number;
  totalWeight: number;
  respondedQuestions: number;
}

function makeAccumulators(indices: ScoringIndex[]): Record<number, IndexAccumulator> {
  const acc: Record<number, IndexAccumulator> = {};
  for (const idx of indices) {
    acc[idx.id] = { weightedRaw: 0, totalWeight: 0, respondedQuestions: 0 };
  }
  return acc;
}

/**
 * Accumulate a single option's contribution into the relevant indices.
 *
 * Scoring priority (per option):
 *   1. `option.indexScores` non-empty → new v54 per-index system
 *   2. else → legacy `option.score * option.weight` spread across `option.indexIds`
 *      (falls back to `question.indexIds` when `option.indexIds` is empty)
 *
 * In both cases the final contribution is further scaled by `questionWeight`.
 */
function accumulateOption(
  acc: Record<number, IndexAccumulator>,
  questionWeight: number,
  questionIndexIds: number[],
  option: { score: number; weight: number; indexIds: number[]; indexScores?: Record<string, number> },
): void {
  if (option.indexScores && Object.keys(option.indexScores).length > 0) {
    // ── v54 new system ────────────────────────────────────────────────────────
    for (const [idStr, score] of Object.entries(option.indexScores)) {
      const iid = parseInt(idStr, 10);
      if (isNaN(iid) || acc[iid] === undefined) continue;
      acc[iid].weightedRaw += score * questionWeight;
      acc[iid].totalWeight += questionWeight;
      acc[iid].respondedQuestions += 1;
    }
  } else {
    // ── Legacy system ─────────────────────────────────────────────────────────
    const targetIds = option.indexIds?.length ? option.indexIds : questionIndexIds;
    const optWeight = option.weight ?? 1;
    for (const iid of targetIds) {
      if (acc[iid] === undefined) continue;
      acc[iid].weightedRaw += option.score * optWeight * questionWeight;
      acc[iid].totalWeight += optWeight * questionWeight;
      acc[iid].respondedQuestions += 1;
    }
  }
}

// ─── Main Engine Function ─────────────────────────────────────────────────────

/**
 * `computeScores` — the core, fully-generic scoring engine.
 *
 * Supports all question types present in Shivafer Academy assessments:
 * - single_choice / yes_no / dropdown — single selected option
 * - multi_choice — multiple selected options
 * - scale_5 / scale_10 — numeric scale, mapped linearly to the index range
 *
 * All other types (text, number, info_section) are treated as non-scoring
 * and counted only in the completion stats.
 *
 * @param questions  Active questions in sort order
 * @param indices    Assessment indices (scoring dimensions)
 * @param answers    { [questionId]: selectedOptionId | optionId[] | number }
 * @returns          Full `ScoreResult` — index breakdown + final score + levels
 */
export function computeScores(
  questions: ScoringQuestion[],
  indices: ScoringIndex[],
  answers: Record<string, unknown>,
): ScoreResult {
  const acc = makeAccumulators(indices);
  let leadScoreDelta = 0;

  // ── Meta counters ──────────────────────────────────────────────────────────
  const activeQuestions = questions.filter((q) => q.isActive);
  let answeredCount = 0;
  let scoringCount = 0;

  // ── Per-question scoring loop ─────────────────────────────────────────────
  for (const q of activeQuestions) {
    const answer = answers[String(q.id)];
    if (answer == null || answer === "") continue;
    answeredCount++;

    // Ensure questionWeight is always at least 1
    const qw = Math.max(1, q.questionWeight ?? 1);

    const type = q.type as string;

    if (
      type === "single_choice" ||
      type === "yes_no" ||
      type === "dropdown"
    ) {
      const opt = q.options.find((o) => o.id === answer);
      if (!opt) continue;
      accumulateOption(acc, qw, q.indexIds ?? [], opt);
      leadScoreDelta += opt.leadScore ?? 0;
      scoringCount++;

    } else if (type === "multi_choice") {
      const chosen = Array.isArray(answer) ? (answer as string[]) : [];
      if (!chosen.length) continue;
      let contributed = false;
      for (const cid of chosen) {
        const opt = q.options.find((o) => o.id === cid);
        if (!opt) continue;
        accumulateOption(acc, qw, q.indexIds ?? [], opt);
        leadScoreDelta += opt.leadScore ?? 0;
        contributed = true;
      }
      if (contributed) scoringCount++;

    } else if (type === "scale_5" || type === "scale_10") {
      const val = Number(answer);
      if (isNaN(val)) continue;
      const scaleMax = type === "scale_5" ? 5 : 10;
      // Map scale answer linearly onto each target index's [minScore, maxScore]
      const targetIds = q.indexIds?.length ? q.indexIds : [];
      if (!targetIds.length) continue;
      for (const iid of targetIds) {
        const idx = indices.find((i) => i.id === iid);
        if (!idx || acc[iid] === undefined) continue;
        const maxRaw = idx.maxScore ?? 100;
        // Convert: 1–scaleMax → 0–maxRaw
        const mapped = ((val - 1) / (scaleMax - 1)) * maxRaw;
        acc[iid].weightedRaw += mapped * qw;
        acc[iid].totalWeight += qw;
        acc[iid].respondedQuestions += 1;
      }
      scoringCount++;

    }
    // short_text / long_text / number / info_section → non-scoring, skip
  }

  // ── Build per-index results ───────────────────────────────────────────────
  const indexResults: Record<string, IndexScoreResult> = {};
  let weightedScoreSum = 0;
  let totalIndexWeight = 0;

  for (const idx of indices) {
    const a = acc[idx.id] ?? { weightedRaw: 0, totalWeight: 0, respondedQuestions: 0 };
    const averageRaw = a.totalWeight > 0 ? a.weightedRaw / a.totalWeight : 0;
    const normalized = round(normalize(averageRaw, idx.minScore ?? 0, idx.maxScore ?? 100));
    const level = matchLevel(normalized, idx.levels ?? []);

    indexResults[String(idx.id)] = {
      indexId: idx.id,
      name: idx.name,
      description: idx.description ?? "",
      weightedRaw: round(a.weightedRaw),
      totalWeight: round(a.totalWeight),
      averageRaw: round(averageRaw),
      normalizedScore: normalized,
      indexWeight: idx.weight ?? 1,
      respondedQuestions: a.respondedQuestions,
      level,
    };

    // Contribute to final score (weight by index weight)
    weightedScoreSum += normalized * (idx.weight ?? 1);
    totalIndexWeight += idx.weight ?? 1;
  }

  // ── Final score ───────────────────────────────────────────────────────────
  const finalScore =
    totalIndexWeight > 0
      ? round(clamp(weightedScoreSum / totalIndexWeight, 0, 100))
      : 0;

  // ── Final level — from the highest-weight index's levels (or first with levels) ──
  let finalLevel = null;
  if (indices.length > 0) {
    const primary =
      [...indices].sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1)).find(
        (i) => (i.levels ?? []).length > 0
      );
    if (primary) {
      finalLevel = matchLevel(finalScore, primary.levels);
    }
  }

  // ── Meta ──────────────────────────────────────────────────────────────────
  const meta: ScoreMeta = {
    totalActiveQuestions: activeQuestions.length,
    answeredQuestions: answeredCount,
    completionPct: activeQuestions.length > 0
      ? round((answeredCount / activeQuestions.length) * 100)
      : 0,
    scoringQuestions: scoringCount,
    hasData: scoringCount > 0,
  };

  return {
    indexResults,
    finalScore,
    finalLevel,
    leadScoreImpact: Math.round(leadScoreDelta),
    meta,
  };
}

// ─── Convenience: extract flat indexScores map ────────────────────────────────

/**
 * Returns `{ [indexId]: normalizedScore }` — the flat map stored in
 * `assessment_sessions.index_scores`.
 */
export function extractIndexScoresMap(result: ScoreResult): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, r] of Object.entries(result.indexResults)) {
    out[id] = r.normalizedScore;
  }
  return out;
}
