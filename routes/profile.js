import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import Attempt from "../models/Attempt.js";
import Lesson from "../models/Lesson.js";

const r = Router();

r.get("/", requireAuth, async (req, res) => {
  const userId = req.user.id;

  const [total, correct] = await Promise.all([
    Attempt.countDocuments({ userId }),
    Attempt.countDocuments({ userId, isCorrect: true })
  ]);

  // per-lesson accuracy (latest attempts)
  const lessons = await Lesson.find({}).lean();
  const perLesson = [];
  for (const L of lessons) {
    const latest = await Attempt.aggregate([
      { $match: { userId, question_id: { $in: L.questionIds } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$question_id", doc: { $first: "$$ROOT" } } }
    ]);
    const totalQ = L.questionIds.length;
    const correctQ = latest.filter(x => x.doc.isCorrect).length;
    perLesson.push({ slug: L.slug, title: L.title, correctQ, totalQ });
  }

  res.render("profile", {
    title: "Your Profile",
    user: req.user,
    stats: {
      totalAttempts: total,
      correctAttempts: correct,
      accuracy: total ? Math.round(100 * correct / total) : 0
    },
    lessons: perLesson
  });
});

export default r;
