// helpers/score.js

/**
 * Score a single question attempt based on type and answer payload.
 *
 * @param {Object} q - Question document from MongoDB
 * @param {Object} answerPayload - The payload sent by the client for this question
 * @returns {{ isCorrect: boolean }}
 */
export function scoreQuestion(q, answerPayload = {}) {
  let isCorrect = false;

  if (q.type === "mcq") {
    const picked = String(answerPayload.choiceId || "").toUpperCase();
    const correct = (q.choices || []).find(c => c.is_correct);
    const correctId = correct ? String(correct.id || "").toUpperCase() : "";
    isCorrect = !!correct && picked === correctId;
  } else if (q.type === "true_false") {
    const canon = String(q.answer).trim().toLowerCase();
    const userA = String(answerPayload.value ?? "").trim().toLowerCase();
    isCorrect = canon === userA;
  } else if (q.type === "fill_blank") {
    const canon = String(q.answer ?? "").trim().toLowerCase();
    const userA = String(answerPayload.value ?? "").trim().toLowerCase();
    isCorrect = canon === userA;
  } else if (q.type === "matching") {
    // Simple MVP: exact structure match
    const expected = q.answer ?? null;
    const given = answerPayload.pairs ?? null;
    isCorrect = JSON.stringify(expected) === JSON.stringify(given);
  }

  return { isCorrect };
}

/**
 * Compute awarded points, including a quick-answer bonus if correct.
 *
 * @param {Object} q - Question
 * @param {boolean} isCorrect
 * @param {number} timeTakenSec
 * @returns {number} awardedPoints
 */
export function computeAwardedPoints(q, isCorrect, timeTakenSec = 0) {
  const base = q.points ?? 10;
  const timeLimitSec = q.time_limit_sec ?? 60;

  const rawBonus = Math.ceil((timeLimitSec - (timeTakenSec || 0)) / 10);
  const bonus = Math.max(0, rawBonus);

  return (isCorrect ? base : 0) + (isCorrect ? bonus : 0);
}

/**
 * Extract explanation and next hint for the user from the question.
 *
 * @param {Object} q - Question
 * @returns {{ explanation: string, nextHint: any }}
 */
export function getExplanationAndHint(q) {
  let explanation = "";
  let nextHint = null;

  if (q.type === "mcq" && Array.isArray(q.choices)) {
    const correct = q.choices.find(c => c.is_correct);
    if (correct?.explanation) {
      explanation = correct.explanation;
    }
  }

  if (!explanation && q.solution) {
    explanation = q.solution;
  }

  if (Array.isArray(q.hints) && q.hints.length > 0) {
    nextHint = q.hints[0];
  }

  return { explanation, nextHint };
}
