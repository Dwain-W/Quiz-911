import { Router } from "express";
import fs from "fs";
import path from "path";
import Question from "../models/Question.js";
import Lesson from "../models/Lesson.js";
import LessonProgress from "../models/LessonProgress.js";
import LessonAttempt from "../models/LessonAttempt.js";
import ImportLog from "../models/ImportLog.js";



const r = Router();


// List of admin emails from env (comma-separated)
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);



// Simple admin guard.
// In development: allows access but logs a warning.
// In production: requires user email to be in ADMIN_EMAILS.
function isAdmin(req, res, next) {
  const isProd = process.env.NODE_ENV === "production";
  const user = req.user || null;
  const email = (user?.email || "").toLowerCase();

  // If user is in the admin list, allow
  if (email && ADMIN_EMAILS.includes(email)) {
    return next();
  }

  // Dev mode – allow anyone, but warn loudly
  if (!isProd) {
    console.warn(
      "[admin] Access without authenticated admin user (DEV MODE). req.user=",
      req.user
    );
    return next();
  }

  // Production fallback – block access
  return res.status(403).render("error", {
    message: "Admin access only."
  });
}



// All routes in this file require admin
r.use(isAdmin);


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


// GET /admin/lessons
// Simple “view all lessons” page
r.get("/lessons", async (req, res) => {
  try {
    const lessons = await Lesson.find({})
      .sort({ order: 1, slug: 1 })
      .lean();

    res.render("admin_lessons", {
      title: "All Lessons",
      lessons
    });
  } catch (err) {
    console.error("GET /admin/lessons error:", err);
    res.status(500).render("error", { message: "Failed to load lessons" });
  }
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


// GET /admin/lessons/:slug/edit
// Show reconstructed seed-style JSON for this lesson
r.get("/lessons/:slug/edit", async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.redirect("/admin/lessons");

    const lessons = await Lesson.find({})
      .sort({ updatedAt: -1 })
      .lean();

    if (!lesson) return res.redirect("/admin/lessons");

    const ids = Array.isArray(lesson.questionIds) ? lesson.questionIds : [];

    // Pull all questions for this lesson
    const questions = await Question.find({ question_id: { $in: ids } }).lean();

    // Preserve original order of questionIds
    const questionsById = new Map(questions.map(q => [q.question_id, q]));
    const orderedQuestions = ids
      .map(id => questionsById.get(id))
      .filter(Boolean);

    const payload = {
      lesson: {
        slug: lesson.slug,
        title: lesson.title,
        topic: lesson.topic,
        order: lesson.order,
        objectives: lesson.objectives || [],
        questionIds: ids
      },
      questions: orderedQuestions
    };

    const json = JSON.stringify(payload, null, 2);

    return res.render("admin_lesson_edit", {
      title: `Edit Lesson: ${lesson.slug}`,
      lesson,
      json
    });
  } catch (err) {
    console.error("GET /admin/lessons/:slug/edit error:", err);
    return res.status(500).render("error", { message: "Failed to load lesson JSON" });
  }
});


// POST /admin/lessons/:slug/delete
r.post("/lessons/:slug/delete", async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.redirect("/admin/lessons");

    const lesson = await Lesson.findOne({ slug });
    if (!lesson) return res.redirect("/admin/lessons");

    const qIds = Array.isArray(lesson.questionIds) ? lesson.questionIds : [];

    // Delete questions tied to this lesson
    if (qIds.length > 0) {
      await Question.deleteMany({ question_id: { $in: qIds } });
    }

    // Delete lesson itself
    await Lesson.deleteOne({ _id: lesson._id });

    // Delete related progress + attempts
    await LessonProgress.deleteMany({ lessonId: slug });
    await LessonAttempt.deleteMany({ lessonId: slug });

    console.log(`[admin] Deleted lesson ${slug} (questions: ${qIds.length})`);

    return res.redirect("/admin/lessons");
  } catch (err) {
    console.error("POST /admin/lessons/:slug/delete error:", err);
    return res.status(500).render("error", { message: "Failed to delete lesson" });
  }
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

    let payload;
    try {
      payload = JSON.parse(fileContent);
    } catch (parseErr) {
      throw new Error(`Invalid JSON: file is not valid JSON. Details: ${parseErr.message}`);
    }


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

    // Additional validation when using { lesson, questions } shape
    if (!Array.isArray(payload)) {
      if (!lesson || !lesson.slug || !lesson.slug.trim()) {
        throw new Error(
          'Invalid JSON: expected "lesson.slug" when using { lesson, questions } format.'
        );
      }
    }


   // Build or validate the lesson object according to the documented schema
if (!lesson) {
  // Array-only format: lesson is derived from admin form
  const slug =
    (lessonSlug && lessonSlug.trim()) ||
    "imported-lesson";

  lesson = {
    slug,
    title:
      (lessonTitle && lessonTitle.trim()) ||
      "Imported Lesson",
    topic:
      (topic && topic.trim()) ||
      "911",
    order: 1,
    objectives: [],
    questionIds: questions.map((q) => q.question_id)
  };
} else {
  // Object format: ensure slug exists, or fall back to form
  if (!lesson.slug || !String(lesson.slug).trim()) {
    if (lessonSlug && lessonSlug.trim()) {
      lesson.slug = lessonSlug.trim();
    } else {
      throw new Error(
        'Invalid JSON: expected "lesson.slug" when using { lesson, questions } format (or provide Lesson Slug in the form).'
      );
    }
  }

  // Ensure title exists (fallback to form or slug)
  if (!lesson.title || !String(lesson.title).trim()) {
    lesson.title =
      (lessonTitle && lessonTitle.trim()) ||
      lesson.slug;
  }

  // Ensure topic has some value
  if (!lesson.topic || !String(lesson.topic).trim()) {
    lesson.topic =
      (topic && topic.trim()) ||
      "911";
  }

  // Ensure lesson.questionIds is populated
  if (!Array.isArray(lesson.questionIds) || !lesson.questionIds.length) {
    lesson.questionIds = questions.map((q) => q.question_id);
  }
}

// If order is missing, try to infer it from the title like "P103 – Call Answering Procedure"
if (lesson.order === undefined || lesson.order === null) {
  const m = String(lesson.title || "").match(/\bP(\d{3})\b/i);
  if (m) lesson.order = Number(m[1]);
}


   // Schema validation: each question must have question_id, type, difficulty, stem
const missingCore = questions.filter((q) => {
  return (
    !q.question_id ||
    !q.type ||
    !q.difficulty ||
    !q.stem
  );
}).length;

if (missingCore > 0) {
  throw new Error(
    `Found ${missingCore} question(s) missing one or more required fields: "question_id", "type", "difficulty", "stem".`
  );
}

// ✅ Upsert questions into the Question collection
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
  const savedLesson = await Lesson.findOneAndUpdate(
    { slug: lesson.slug },
    lesson,
    { upsert: true, new: true }
  );

  // ✅ Log the import
  try {
    await ImportLog.create({
      jsonPath,
      lessonSlug: savedLesson.slug,
      lessonTitle: savedLesson.title,
      topic: savedLesson.topic,
      questionCount: Array.isArray(questions) ? questions.length : 0
    });
  } catch (logErr) {
    console.warn("ImportLog create failed:", logErr);
  }

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

// GET /admin/import-history
r.get("/import-history", async (req, res) => {
  try {
    const logs = await ImportLog.find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.render("admin_import_history", {
      title: "Import History",
      logs
    });
  } catch (err) {
    console.error("GET /admin/import-history error:", err);
    res.status(500).render("error", { message: "Failed to load import history" });
  }
});


export default r;
