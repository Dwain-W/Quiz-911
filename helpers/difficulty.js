// helpers/difficulty.js

// Allowed difficulty values in the system
export const DIFFICULTIES = ["easy", "medium", "hard"];

/**
 * Normalize difficulty strings.
 * - Trims whitespace
 * - Lowercases
 * - Returns null if empty/invalid
 *
 * Examples:
 *   normDiff(" Easy ") -> "easy"
 *   normDiff("")       -> null
 *   normDiff(null)     -> null
 */
export function normDiff(d) {
  if (d === undefined || d === null) return null;
  const s = String(d).trim().toLowerCase();
  if (!s) return null;
  if (!DIFFICULTIES.includes(s)) return null;
  return s;
}

/**
 * Convert numeric stage to difficulty string.
 * 0 → "easy"
 * 1 → "medium"
 * 2 → "hard"
 */
export function stageToDifficulty(stage) {
  if (stage === 1) return "medium";
  if (stage === 2) return "hard";
  return "easy";
}

/**
 * Convert difficulty string to numeric stage.
 * "easy"   → 0
 * "medium" → 1
 * "hard"   → 2
 * null/unknown → 0 (default easy)
 */
export function difficultyToStage(diff) {
  const d = normDiff(diff);
  if (d === "medium") return 1;
  if (d === "hard") return 2;
  return 0;
}
