// helpers/questions.js

import { normDiff, stageToDifficulty, difficultyToStage, DIFFICULTIES } from "./difficulty.js";

/**
 * Count questions per difficulty for a given list.
 * Returns object { easy, medium, hard }.
 */
export function computeTierCounts(questions = []) {
  const counts = { easy: 0, medium: 0, hard: 0 };

  for (const q of questions) {
    const d = normDiff(q.difficulty);
    if (counts[d] != null) counts[d] += 1;
  }

  return counts;
}

/**
 * Filter questions by difficulty ("easy" | "medium" | "hard").
 */
export function filterQuestionsByDifficulty(questions = [], difficulty) {
  const d = normDiff(difficulty);
  if (!d) return [];
  return questions.filter(q => normDiff(q.difficulty) === d);
}




/**
 * Given a lesson's questions and user's progression,
 * choose which difficulty to serve and which questions to send.
 *
 * @param {Object} opts
 * @param {Array}  opts.questions       - all questions for lesson in order
 * @param {number} opts.stage           - user's current stage (0 easy / 1 medium / 2 hard)
 * @param {Array}  opts.unlockedStages  - array of unlocked numeric stages (e.g., [0,1])
 * @param {string|null} opts.requestedDifficulty - optional difficulty from query
 *
 * @returns {{
 *   servedDifficulty: string,
 *   selected: Array,
 *   tierCounts: {easy:number, medium:number, hard:number},
 *   tierEmpty: boolean,
 *   fallbackFrom: string|null,
 *   fallbackTo: string|null
 * }}
 */
export function selectQuestionsForStageWithFallback({
  questions = [],
  stage = 0,
  unlockedStages = [],
  requestedDifficulty = null
}) {
  const tierCounts = computeTierCounts(questions);

  // If no questions at all, return empty result
  if (!questions.length) {
    return {
      servedDifficulty: stageToDifficulty(stage),
      selected: [],
      tierCounts,
      tierEmpty: false,
      fallbackFrom: null,
      fallbackTo: null
    };
  }

  const reqDiff = requestedDifficulty ? normDiff(requestedDifficulty) : null;
  const requestedStage = reqDiff ? difficultyToStage(reqDiff) : stage;

  // Determine maximum unlocked stage
  const maxUnlocked = Math.max(0, stage, ...(unlockedStages || []));
  const allowedStage = requestedStage <= maxUnlocked ? requestedStage : stage;
  const targetDiff = stageToDifficulty(allowedStage);

  // Try target difficulty first
  let servedDifficulty = targetDiff;
  let selected = filterQuestionsByDifficulty(questions, servedDifficulty);

  let tierEmpty = false;
  let fallbackFrom = null;
  let fallbackTo = null;

  if (!selected.length) {
    tierEmpty = true;
    fallbackFrom = servedDifficulty;

    // 1) Search unlocked stages downward: allowedStage → 0
    let found = null;
    for (let s = allowedStage; s >= 0; s--) {
      if (!unlockedStages.includes(s)) continue;
      const d = stageToDifficulty(s);
      const tmp = filterQuestionsByDifficulty(questions, d);
      if (tmp.length) {
        found = { d, tmp };
        break;
      }
    }

    // 2) If still nothing, search any tier (easy/medium/hard)
    if (!found) {
      for (const d of DIFFICULTIES) {
        const tmp = filterQuestionsByDifficulty(questions, d);
        if (tmp.length) {
          found = { d, tmp };
          break;
        }
      }
    }

    if (found) {
      servedDifficulty = found.d;
      selected = found.tmp;
      fallbackTo = found.d;
    }
  }

  return {
    servedDifficulty,
    selected,
    tierCounts,
    tierEmpty,
    fallbackFrom,
    fallbackTo
  };

  

}
