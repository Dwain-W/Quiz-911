import { Router } from "express";
import Lesson from "../models/Lesson.js";
import Question from "../models/Question.js";
import Attempt from "../models/Attempt.js";
import { requireAuth } from "../middleware/auth.js";

const r = Router();


r.get("/:slug", requireAuth, async (req, res) => {
 const lesson = await Lesson.findOne({ slug: req.params.slug }).lean();
  if (!lesson) return res.status(404).send("Lesson not found");

  // latest attempt per question (for this user)
  const latest = await Attempt.aggregate([
    { $match: { userId: req.user.id, question_id: { $in: lesson.questionIds || [] } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: "$question_id", doc: { $first: "$$ROOT" } } }
  ]);

  const latestByQ = new Map(latest.map(x => [x._id, x.doc]));
  const qs = await Question.find({ question_id: { $in: lesson.questionIds || [] } }).lean();
  const byId = new Map(qs.map(q => [q.question_id, q]));

  // maintain lesson order
  const rows = (lesson.questionIds || []).map((qid, i) => ({
    i: i + 1,
    q: byId.get(qid),
    at: latestByQ.get(qid)
  })).filter(x => x.q);

  res.render("review", { title: `Review • ${lesson.title}`, lesson, rows });
});

export default r;
