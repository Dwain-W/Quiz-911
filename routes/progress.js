import { Router } from "express";
import LessonProgress from "../models/LessonProgress.js";

const r = Router();



/**
 * GET /api/progress/:lessonId
 * Anonymous for now: userId = null
 */
r.get("/:lessonId", async (req, res) => {
  try {
    const lessonId = String(req.params.lessonId || "").trim();
    if (!lessonId) {
      return res.status(400).json({ ok: false, error: "lessonId is required" });
    }

    const userId = null;

    const doc = await LessonProgress.findOne({ lessonId, userId });

    return res.json({
      ok: true,
      progress: doc
        ? {
            lessonId: doc.lessonId,
            userId: doc.userId,
            correct: doc.correct,
            total: doc.total,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt
          }
        : {
            lessonId,
            userId,
            correct: 0,
            total: 0
          }
    });
  } catch (err) {
    console.error("GET /api/progress/:lessonId error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});




/**
 * POST /api/progress
 * Body: { lessonId, correctDelta?: number, totalDelta?: number }
 * Anonymous for now: userId = null
 */
r.post("/", async (req, res) => {
  try {
    const { lessonId, correctDelta = 0, totalDelta = 0 } = req.body || {};

    if (!lessonId || !String(lessonId).trim()) {
      return res.status(400).json({ ok: false, error: "lessonId is required" });
    }

    const incCorrect = Number(correctDelta) || 0;
    const incTotal = Number(totalDelta) || 0;

    // Basic guardrails
    if (incCorrect < 0 || incTotal < 0) {
      return res.status(400).json({ ok: false, error: "Deltas must be >= 0" });
    }

    // Anonymous mode for now
    const userId = null;

    const doc = await LessonProgress.findOneAndUpdate(
      { lessonId: String(lessonId).trim(), userId },
      { $inc: { correct: incCorrect, total: incTotal } },
      { upsert: true, new: true }
    );

    return res.json({
      ok: true,
      progress: {
        lessonId: doc.lessonId,
        userId: doc.userId,
        correct: doc.correct,
        total: doc.total,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt
      }
    });
  } catch (err) {
    console.error("POST /api/progress error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});

export default r;
