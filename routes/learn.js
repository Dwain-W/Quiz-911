import { Router } from "express";
import Lesson from "../models/Lesson.js";
import Attempt from "../models/Attempt.js";

const r = Router();

r.get("/", async (req, res) => {
  const lessons = await Lesson.find({}).sort({ createdAt: 1 }).lean();
  const progress = {};

  if (req.user) {
    // Get user's latest attempts per question across all lessons
    const allQids = lessons.flatMap(L => L.questionIds || []);
    const latest = await Attempt.aggregate([
      { $match: { userId: req.user.id, question_id: { $in: allQids } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$question_id", doc: { $first: "$$ROOT" } } }
    ]);

    const correctSet = new Set(latest.filter(x => x.doc?.isCorrect).map(x => x._id));

    for (const L of lessons) {
      const total = (L.questionIds || []).length;
      const done  = (L.questionIds || []).filter(id => correctSet.has(id)).length;

      // ✅ initialize first
      progress[L.slug] = { done, total };

      // ✅ then set completed flag
      progress[L.slug].completed = total > 0 && done === total;
    }
  } else {
    // Not signed in → initialize progress for display without crashing
    for (const L of lessons) {
      const total = (L.questionIds || []).length;
      progress[L.slug] = { done: 0, total, completed: false };
    }
  }

  res.render("learn", { title: "Learn", lessons, progress });
});

export default r;
