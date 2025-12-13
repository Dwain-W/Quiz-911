import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import Lesson from "../models/Lesson.js";
import Attempt from "../models/Attempt.js";

const r = Router();
r.get("/:slug", requireAuth, async (req, res) => {
  const lesson = await Lesson.findOne({ slug: req.params.slug }).lean();
  if (!lesson) return res.status(404).send("Lesson not found");
  const latest = await Attempt.aggregate([
    { $match: { userId: req.user.id, question_id: { $in: lesson.questionIds } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: "$question_id", doc: { $first: "$$ROOT" } } }
  ]);
  res.render("analytics", { title: `Analytics • ${lesson.title}`, lesson, latest });
});
export default r;
