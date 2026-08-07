// ─── Input types (engine-agnostic — no drizzle dependency) ───────────────────

/**
 * A single answer option as seen by the scoring engine.
 * v54: indexScores takes priority over the legacy score+indexIds system.
 */
export interface ScoringOption {
  id: string;
  label: string;
  /** v54 NEW — per-index score map. Supersedes score+indexIds when non-empty. */
  indexScores?: Record<string, number>;
  /** Legacy — global raw score (used when indexScores is absent/empty) */
  score: number;
  /** Legacy — weight multiplier for the legacy system */
  weight: number;
  /** Legacy — which indices this option contributes to */
  indexIds: number[];
  /** Lead CRM score impact (-10 … +10) */
  leadScore: number;
}

export type QuestionType =
  | "single_choice"
  | "multi_choice"
  | "yes_no"
  | "scale_5"
  | "scale_10"
  | "short_text"
  | "long_text"
  | "number"
  | "number_range"
  | "dropdown"
  | "conditional"
  | "info_section";

/**
 * Question as consumed by the engine.
 * All fields needed for scoring must be present; the rest are ignored.
 */
export interface ScoringQuestion {
  id: number;
  type: string;
  isActive: boolean;
  /** v54 — weight multiplier applied to this question's contribution. Default 1. */
  questionWeight: number;
  /** Which indices a scale/text question directly affects (no options involved) */
  indexIds: number[];
  options: ScoringOption[];
}

/**
 * A result level band within an index.
 */
export interface ScoringLevel {
  label: string;
  /** Lower bound percentage (inclusive) */
  minPct: number;
  /** Upper bound percentage (inclusive) */
  maxPct: number;
  description: string;
  suggestion: string;
}

/**
 * Assessment index (dimension) as consumed by the engine.
 */
export interface ScoringIndex {
  id: number;
  name: string;
  description?: string;
  /**
   * Relative importance in the final weighted score.
   * Higher = contributes more to the overall score.
   */
  weight: number;
  /** Theoretical minimum raw score (for normalization baseline). Usually 0. */
  minScore: number;
  /** Theoretical maximum raw score (for normalization ceiling). Usually 100. */
  maxScore: number;
  levels: ScoringLevel[];
}

// ─── Output types ─────────────────────────────────────────────────────────────

/** Per-index scoring breakdown */
export interface IndexScoreResult {
  indexId: number;
  name: string;
  description: string;
  /** Sum of (optionScore × questionWeight) for all answered questions */
  weightedRaw: number;
  /** Total questionWeight for questions that contributed to this index */
  totalWeight: number;
  /** weightedRaw / totalWeight — the weighted average raw score */
  averageRaw: number;
  /** Normalized to 0–100 using the index's minScore/maxScore */
  normalizedScore: number;
  /** Index weight (used in final score calculation) */
  indexWeight: number;
  /** Number of questions that contributed to this index */
  respondedQuestions: number;
  /** Matched level band (null if no levels defined or no score) */
  level: ScoringLevel | null;
}

/** Full engine output */
export interface ScoreResult {
  /** Per-index breakdown keyed by string(indexId) */
  indexResults: Record<string, IndexScoreResult>;
  /**
   * Weighted average of all index normalizedScores, 0–100.
   * Formula: Σ(indexScore × indexWeight) / Σ(indexWeight)
   */
  finalScore: number;
  /** Level matched against the finalScore on the primary index's levels (or null) */
  finalLevel: ScoringLevel | null;
  /** Total CRM lead score delta */
  leadScoreImpact: number;
  /** Diagnostic stats */
  meta: ScoreMeta;
}

export interface ScoreMeta {
  totalActiveQuestions: number;
  answeredQuestions: number;
  /** answeredQuestions / totalActiveQuestions × 100 */
  completionPct: number;
  /** Number of questions whose answer actually contributed to at least one index */
  scoringQuestions: number;
  /** Were any questions answered? */
  hasData: boolean;
}
