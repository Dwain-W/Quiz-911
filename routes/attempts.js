// routes/attempts.js
import { Router } from "express";
import Attempt from "../models/Attempt.js";
import Question from "../models/Question.js";
import User from "../models/User.js";

import {
  scoreQuestion,
  computeAwardedPoints,
  getExplanationAndHint,
} from "../helpers/score.js";
import { applyStreakForCorrect } from "../helpers/streak.js";

const r = Router();

/**
 * POST /attempts
 * body: { question_id, answerPayload, timeTakenSec? }
 *
 * Used by public/js/quiz.js when you click an answer.
 * Returns JSON:
 *   { isCorrect, awardedPoints, explanation, nextHint, newXp, newStreak }
 */
r.post("/", async (req, res) => {
  try {
    const { question_id, answerPayload, timeTakenSec = 0 } = req.body || {};
    if (!question_id) {
      return res.status(400).json({ error: "question_id is required" });
    }

    const userId = req.user?.id || "guest";

    // 1) Load question
    const q = await Question.findOne({ question_id });
    if (!q) {
      return res.status(404).json({ error: "Question not found" });
    }

    // 2) Score using helpers
    const { isCorrect } = scoreQuestion(q, answerPayload || {});
    const awardedPoints = computeAwardedPoints(q, isCorrect, timeTakenSec);
    const { explanation, nextHint } = getExplanationAndHint(q);

    // 3) Log Attempt
    await Attempt.create({
      userId,
      question_id,
      isCorrect,
      timeTakenSec,
      answerPayload,
      awardedPoints,
    });

    // 4) XP + streak (if logged in)
    let newXp = null;
    let newStreak = null;

    if (req.user && isCorrect) {
      const user = await User.findById(req.user.id);
      if (user) {
        user.xp = (user.xp || 0) + (awardedPoints || 0);
        applyStreakForCorrect(user);
        await user.save();
        newXp = user.xp;
        newStreak = user.streak;
      }
    }

    // 5) Send response expected by quiz.js → afterSubmit(resp)
    return res.json({
      isCorrect,
      awardedPoints,
      explanation,
      nextHint,
      newXp,
      newStreak,
    });
  } catch (err) {
    console.error("Error in POST /attempts:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default r;
