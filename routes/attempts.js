import { Router } from "express";
import Attempt from "../models/Attempt.js";
import Question from "../models/Question.js";
import User from "../models/User.js";
import { ymd, dayDiff } from "../helpers/date.js";

const r = Router();

/**
 * POST /attempts
 * body: { userId?, question_id, answerPayload, timeTakenSec? }
 * Scores the answer server-side, logs attempt, returns correctness & explanation.
 */
r.post("/", async (req, res) => {
const { question_id, answerPayload, timeTakenSec = 0 } = req.body;
const userId = req.user?.id || "guest";  // single declaration
  const q = await Question.findOne({ question_id });
  if (!q) return res.status(404).json({ error: "Question not found" });

  // Score by type
  let isCorrect = false;

  if (q.type === "mcq") {
    const picked = (answerPayload?.choiceId || "").toUpperCase();
    const correct = q.choices.find(c => c.is_correct);
    isCorrect = !!correct && correct.id.toUpperCase() === picked;
  } else if (q.type === "true_false") {
    isCorrect = String(q.answer).toLowerCase() === String(answerPayload?.value).toLowerCase();
  } else if (q.type === "fill_blank") {
    const canon = String(q.answer ?? "").trim().toLowerCase();
    const userA = String(answerPayload?.value ?? "").trim().toLowerCase();
    isCorrect = canon === userA;
  } else if (q.type === "matching") {
    // MVP: exact structure match
    isCorrect = JSON.stringify(q.answer) === JSON.stringify(answerPayload?.pairs);
  }

  // Points: base + quick-answer bonus if correct
const base = q.points ?? 10;
const timeLimitSec = q.time_limit_sec ?? 60;
const bonus = Math.max(0, Math.ceil((timeLimitSec - (timeTakenSec || 0)) / 10));
const awardedPoints = (isCorrect ? base : 0) + (isCorrect ? bonus : 0);

await Attempt.create({ userId, question_id, isCorrect, timeTakenSec, answerPayload, awardedPoints });

  // Prefer MCQ choice explanation; else fall back to solution
  const mcqExpl = q.type === "mcq" ? (q.choices.find(c => c.is_correct)?.explanation) : null;

let newXp = null, newStreak = null;
if (req.user && isCorrect) {
  const user = await User.findById(req.user.id);
  if (user) {
    user.xp = (user.xp || 0) + (awardedPoints || 0);
    const now = new Date();
    if (!user.lastCorrectAt) {
      user.streak = 1;
    } else {
      const today = new Date(now.toISOString().slice(0,10));
      const last  = new Date(user.lastCorrectAt.toISOString().slice(0,10));
      const diffDays = Math.round((today - last) / (1000*60*60*24));
      if (diffDays === 1) user.streak = (user.streak || 0) + 1;
      else if (diffDays > 1) user.streak = 1;
    }
    user.lastCorrectAt = new Date();
    await user.save();
    newXp = user.xp;
    newStreak = user.streak;
  }
}

res.json({
  isCorrect,
  awardedPoints,
  explanation: mcqExpl || q.solution || "",
  nextHint: q.hints?.[0] ?? null,
  newXp,
  newStreak
});


await Attempt.create({ userId, question_id, isCorrect, timeTakenSec, answerPayload, awardedPoints });

// 🪙 XP / Streak updates
if (req.user && isCorrect) {
  const user = await User.findById(req.user.id);
  if (user) {
    // XP
    user.xp = (user.xp || 0) + (awardedPoints || 0);

    // Streak logic: +1 day if lastCorrectAt was yesterday, keep if today, reset to 1 otherwise
    const now = new Date();
    if (!user.lastCorrectAt) {
      user.streak = 1;
    } else {
      // simple robust diff w/o helper:
      const today = new Date(now.toISOString().slice(0,10));
      const last = new Date(user.lastCorrectAt.toISOString().slice(0,10));
      const diffDays = Math.round((today - last) / (1000*60*60*24));
      if (diffDays === 0) {
        // already had a correct today → keep streak as is
        user.streak = Math.max(1, user.streak || 1);
      } else if (diffDays === 1) {
        user.streak = (user.streak || 0) + 1;
      } else {
        user.streak = 1; // broke the chain
      }
    }
    user.lastCorrectAt = new Date();
    await user.save();
  }
}

});

export default r;
