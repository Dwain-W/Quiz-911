import { Router } from "express";
import Lesson from "../models/Lesson.js";
import Question from "../models/Question.js";

const r = Router();

/**
 * GET /lessons/:slug
 * Renders the quiz UI (EJS) and injects the question list.
 */

// returns { lesson: {...}, questions: [...] }
r.get("/:slug.json", async (req, res) => {
  const lesson = await Lesson.findOne({ slug: req.params.slug });
  if (!lesson) return res.status(404).json({ error: "Lesson not found" });

  const qs = await Question.find({ question_id: { $in: lesson.questionIds } });
  const byId = new Map(qs.map(q => [q.question_id, q]));
  const ordered = lesson.questionIds.map(id => byId.get(id)).filter(Boolean);

   console.log("[LESSON JSON]", req.params.slug, "found", ordered.length, "questions");
  res.json({
    lesson: { slug: lesson.slug, title: lesson.title },
    questions: ordered
  });
});

r.get("/:slug", async (req, res) => {
  const lesson = await Lesson.findOne({ slug: req.params.slug }).lean();
  if (!lesson) return res.status(404).send("Lesson not found");
  res.render("quiz", { title: lesson.title, lesson });
});

export default r;
