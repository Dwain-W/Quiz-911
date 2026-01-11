import { Router } from "express";
import Lesson from "../models/Lesson.js";
import Question from "../models/Question.js";
import Attempt from "../models/Attempt.js";
import { requireAuth } from "../middleware/auth.js";
import LessonProgress from "../models/LessonProgress.js";


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


// GET /lessons/:slug/missed
r.get("/lessons/:slug/missed", async (req, res) => {
  try {
    const { slug } = req.params;

    // 1. Load the lesson
    const lesson = await Lesson.findOne({ slug });
    if (!lesson) {
      return res.status(404).json({ ok: false, error: "Lesson not found." });
    }

    // 2. Load latest progress entry for this lesson
    const progress = await LessonProgress.findOne({ lessonId: slug })
      .sort({ createdAt: -1 })
      .lean();

    if (!progress || !progress.details || progress.details.length === 0) {
      return res.json({
        ok: true,
        slug,
        count: 0,
        questions: []
      });
    }

    // progress.details = [{ questionId, correct, chosen }]
    const incorrectIds = progress.details
      .filter(d => d.correct === false)
      .map(d => d.questionId);

    if (incorrectIds.length === 0) {
      return res.json({
        ok: true,
        slug,
        count: 0,
        questions: []
      });
    }

    // 3. Fetch actual question documents
    const questions = await Question.find({
      question_id: { $in: incorrectIds }
    }).lean();

    return res.json({
      ok: true,
      slug,
      count: questions.length,
      questions
    });

  } catch (err) {
    console.error("missed error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});


export default r;
