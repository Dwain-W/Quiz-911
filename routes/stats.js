import { Router } from "express";
import LessonProgress from "../models/LessonProgress.js";
import LessonAttempt from "../models/LessonAttempt.js";


const r = Router();

/**
 * GET /stats
 * Step 2: Query LessonProgress records
 */
r.get("/", async (_req, res) => {
  try {
    // Anonymous mode for now (userId null)
    const attempts = await LessonAttempt.find({ userId: null })
      .sort({ createdAt: -1 })
      .lean();

    const totals = { quizzesTaken: attempts.length };

    // Group attempts by lessonId
    const grouped = new Map();

    for (const a of attempts) {
      const lessonId = a.lessonId || "unknown";
      const correct = Number(a.correct) || 0;
      const total = Number(a.total) || 0;

      const pct = total > 0 ? (correct / total) : 0;

      if (!grouped.has(lessonId)) {
        grouped.set(lessonId, {
          lessonId,
          attempts: 0,
          bestPct: 0,
          avgPct: 0,
          sumPct: 0,
          lastTakenAt: a.createdAt
        });
      }

      const g = grouped.get(lessonId);
      g.attempts += 1;
      g.sumPct += pct;
      if (pct > g.bestPct) g.bestPct = pct;

      // since attempts are sorted desc, first time we see it is the latest
      if (!g.lastTakenAt) g.lastTakenAt = a.createdAt;
    }

    // Finalize avg + format
    const rows = Array.from(grouped.values())
      .map((g) => ({
        lessonId: g.lessonId,
        attempts: g.attempts,
        bestPct: Math.round(g.bestPct * 100),
        avgPct: Math.round((g.sumPct / Math.max(g.attempts, 1)) * 100),
        lastTakenAt: g.lastTakenAt
      }))
      .sort((a, b) => b.attempts - a.attempts);

    return res.render("stats", {
      title: "Stats",
      rows,
      totals
    });
  } catch (err) {
    console.error("GET /stats error:", err);
    return res.status(500).render("error", { message: "Stats failed to load" });
  }
});

export default r;
