import { Router } from "express";
import fs from "fs";
import path from "path";
import Question from "../models/Question.js";
import Lesson from "../models/Lesson.js";

const r = Router();

/**
 * GET /admin/import
 * Simple form page (EJS) to import JSON by path and create a lesson.
 */
r.get("/import", (req, res) => {
  res.render("admin_import", {
    title: "Import",
    ok: req.query.ok === "1",
    slug: req.query.slug || null,
    message: req.query.message || null,
    error: null,
    form: {
      jsonPath: req.query.jsonPath || "",
      lessonSlug: req.query.lessonSlug || "",
      lessonTitle: req.query.lessonTitle || "",
      topic: req.query.topic || ""
    }
  });
});

r.get("/debug/lesson/:slug", async (req, res) => {
  const lesson = await Lesson.findOne({ slug: req.params.slug });
  if (!lesson) return res.json({ foundLesson: false });

  const count = await Question.countDocuments({
    question_id: { $in: lesson.questionIds }
  });

  res.json({
    foundLesson: true,
    slug: lesson.slug,
    title: lesson.title,
    questionIdCount: lesson.questionIds.length,
    existingQuestionsInDB: count,
    sampleIds: lesson.questionIds.slice(0, 5)
  });
});

/**
 * POST /admin/import
 * body: { jsonPath, lessonSlug?, lessonTitle?, topic? }
 * Upserts questions from the JSON. Optionally creates/updates a Lesson using all IDs.
 */
r.post("/import", async (req, res) => {
  try {
    const { jsonPath, lessonSlug, lessonTitle, topic } = req.body;

    if (!jsonPath || !String(jsonPath).trim()) {
      throw new Error("jsonPath is required (example: seeds/911-intake-basics.json)");
    }

    // Allow relative paths like "seeds/scientific-method.json"
    const fullPath = path.isAbsolute(jsonPath)
      ? jsonPath
      : path.join(process.cwd(), jsonPath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found at path: ${fullPath}`);
    }

    const fileContent = fs.readFileSync(fullPath, "utf8");
    const payload = JSON.parse(fileContent);

    // Handle two possible shapes:
    // 1) [ {question...}, {question...} ]
    // 2) { lesson: {...}, questions: [ ... ] }
    const questions = Array.isArray(payload) ? payload : payload.questions;
    let lesson = Array.isArray(payload) ? null : payload.lesson;

    if (!Array.isArray(questions)) {
      throw new Error(
        'Expected the JSON file to be either an array of questions or an object with a "questions" array.'
      );
    }

    // If the JSON doesn't include a lesson object, build one from the form fields
    if (!lesson) {
      const slug = lessonSlug && lessonSlug.trim() ? lessonSlug.trim() : "imported-lesson";
      lesson = {
        slug,
        title: lessonTitle && lessonTitle.trim() ? lessonTitle.trim() : "Imported Lesson",
        topic: topic && topic.trim() ? topic.trim() : "911",
        order: 1,
        objectives: [],
        questionIds: questions.map((q) => q.question_id)
      };
    } else {
      // Ensure lesson.questionIds is populated
      if (!lesson.questionIds || !lesson.questionIds.length) {
        lesson.questionIds = questions.map((q) => q.question_id);
      }
    }
    // If order is missing, try to infer it from the title like "P103 – Call Answering Procedure"
    if (lesson.order === undefined || lesson.order === null) {
      const m = String(lesson.title || "").match(/\bP(\d{3})\b/i);
      if (m) lesson.order = Number(m[1]);
    }


    // Basic validation: every question should have question_id
    const missingIds = questions.filter((q) => !q.question_id).length;
    if (missingIds > 0) {
      throw new Error(`Found ${missingIds} question(s) missing "question_id".`);
    }

    // Upsert questions
    await Question.bulkWrite(
      questions.map((q) => ({
        updateOne: {
          filter: { question_id: q.question_id },
          update: q,
          upsert: true
        }
      }))
    );

    // Upsert lesson
    await Lesson.findOneAndUpdate({ slug: lesson.slug }, lesson, { upsert: true, new: true });

    const msg = `Imported ${questions.length} questions for lesson "${lesson.slug}".`;

    // Redirect back to GET so EJS always has ok/slug/message defined
    return res.redirect(
      `/admin/import?ok=1&slug=${encodeURIComponent(lesson.slug)}&message=${encodeURIComponent(msg)}`
    );
  } catch (err) {
    console.error("Import error:", err);

    // Render with ok/error defined so EJS never throws ReferenceError
    return res.status(400).render("admin_import", {
      title: "Import",
      ok: false,
      slug: null,
      message: null,
      error: err.message || String(err),
      form: {
        jsonPath: req.body?.jsonPath || "",
        lessonSlug: req.body?.lessonSlug || "",
        lessonTitle: req.body?.lessonTitle || "",
        topic: req.body?.topic || ""
      }
    });
  }
});

export default r;
