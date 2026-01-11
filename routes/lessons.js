import { Router } from "express";
import Lesson from "../models/Lesson.js";
import Question from "../models/Question.js";
import LessonProgress from "../models/LessonProgress.js";
import {  normDiff,  stageToDifficulty,  difficultyToStage,  DIFFICULTIES} from "../helpers/difficulty.js";
import {  computeTierCounts,  filterQuestionsByDifficulty} from "../helpers/questions.js";
import LessonAttempt from "../models/LessonAttempt.js";





const r = Router();



function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}



// Simple HTML escape for safety in the list page
function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

    /**
     * GET /lessons
     * Procedures list (sorted by lesson.order)
     */


    /**
     * GET /lessons/:slug.json
     * Returns all questions for a lesson in the order of lesson.questionIds.
     * Keeps it simple: no stage gating, no over-filtering.
     */
   r.get("/:slug.json", async (req, res) => {
  try {
    const rawSlug = req.params.slug || "";
    const slug = String(rawSlug).trim();
    if (!slug) {
      return res.status(400).json({ error: "Missing lesson slug" });
    }

    const lesson = await Lesson.findOne({ slug }).lean();
    if (!lesson) {
      return res.status(404).json({ error: "Lesson not found" });
    }

    const questionIds = Array.isArray(lesson.questionIds) ? lesson.questionIds : [];

    // If lesson has no questionIds, return early (this should NOT be the case for 101)
    if (questionIds.length === 0) {
      return res.json({
        ok: true,
        lesson: {
          slug: lesson.slug,
          title: lesson.title,
          topic: lesson.topic,
          order: lesson.order,
          objectives: lesson.objectives || [],
          questionCount: 0
        },
        questions: [],
        stageInfo: {
          difficulty: (req.query.difficulty || "easy").toLowerCase(),
          servedDifficulty: (req.query.difficulty || "easy").toLowerCase()
        }
      });
    }

    // Fetch all questions that belong to this lesson
    const docs = await Question.find({
      question_id: { $in: questionIds }
    }).lean();

    // Preserve order of lesson.questionIds
    const byId = new Map(docs.map((q) => [q.question_id, q]));
    const ordered = questionIds
      .map((id) => byId.get(id))
      .filter(Boolean);

    // Fallback in case something is off
    const source = ordered.length > 0 ? ordered : docs;

    const questionsPayload = source.map((q) => ({
      question_id: q.question_id,
      type: q.type,
      difficulty: q.difficulty || "easy",
      domain: q.domain || "911",
      topic: q.topic || null,
      subtopic: q.subtopic || null,
      stem: q.stem,
      choices: Array.isArray(q.choices) ? q.choices : [],
      answer: q.answer,
      solution: q.solution || "",
      hints: Array.isArray(q.hints) ? q.hints : [],
      tags: Array.isArray(q.tags) ? q.tags : []
    }));

    const diff = (req.query.difficulty || "easy").toLowerCase();

    // --- Difficulty filtering ---
        let filtered = questionsPayload;

        // Normalize the requested difficulty
        const norm = ["easy", "medium", "hard"];
        const requested = norm.includes(diff) ? diff : "easy";

        // Start with requested tier
        let actualTier = requested;

        filtered = questionsPayload.filter(q =>
          (q.difficulty || "easy").toLowerCase() === actualTier
        );

        // If no questions at that tier, fallback to EASY
        if (filtered.length === 0) {
          actualTier = "easy";
          filtered = questionsPayload.filter(q =>
            (q.difficulty || "easy").toLowerCase() === "easy"
          );
        }

        // If absolutely nothing matches, final fallback: all questions
        if (filtered.length === 0) {
          actualTier = requested;
          filtered = questionsPayload;
        }



        // Compute tier counts
        let tierCounts = computeTierCounts(ordered);

        // All tiers unlocked for now
        const unlockedStages = [0,1,2];

    return res.json({
      ok: true,
      lesson: {
        slug: lesson.slug,
        title: lesson.title,
        topic: lesson.topic,
        order: lesson.order,
        objectives: lesson.objectives || [],
        questionCount: filtered.length
      },
      questions: filtered,
      stageInfo: {
        difficulty: requested,      // what user asked for
        servedDifficulty: actualTier, // what they actually got,
            tierCounts,
            unlockedStages
              }
    });
  } catch (err) {
    console.error("Lesson JSON failed:", err);
    return res.status(500).json({
      error: "Lesson JSON failed",
      message: err.message || String(err)
    });
  }
});



        r.get("/", async (req, res) => {
          const lessons = await Lesson.find().sort({ order: 1 }).lean();

          // Build tierCountsBySlug: { slug: { easy: n, medium: n, hard: n } }
        const tierCountsBySlug = {};
        if (lessons.length) {
          const allIds = lessons.flatMap(l => Array.isArray(l.questionIds) ? l.questionIds : []);
          const qs = await Question.find({ question_id: { $in: allIds } })
            .select("question_id difficulty")
            .lean();

          // Normalize difficulty for all questions
            const diffById = new Map(
              qs.map(q => {
                const raw = (q.difficulty || "").toString().trim().toLowerCase();
                let d;

                if (raw === "easy") d = "easy";
                else if (raw === "medium") d = "medium";
                else if (raw === "hard") d = "hard";
                else d = "easy"; // default fallback

                return [q.question_id, d];
              })
            );

            // Build tier counts for each lesson
            for (const l of lessons) {
              const counts = { easy: 0, medium: 0, hard: 0 };
              const ids = Array.isArray(l.questionIds) ? l.questionIds : [];

              for (const id of ids) {
                const d = diffById.get(id) || "easy";
                counts[d] += 1;
              }

              tierCountsBySlug[l.slug] = counts;
            }

        }


      const userId = req.user?.id || req.user?._id || null;

      // map: { "lesson-slug": "easy" | "medium" | "hard" }
      let progressBySlug = {};
        if (userId) {
          const progs = await LessonProgress.find({ userId })
            .select("lessonSlug stage")
            .lean();

          progressBySlug = Object.fromEntries(
            progs.map(p => [p.lessonSlug, stageToDifficulty(p.stage)])
          );
        }

        res.render("procedures", {
        title: "Procedure Manual",
        lessons,
        progressBySlug,
        tierCountsBySlug
        });

    });


/**
 * POST /lessons/:slug/advance-stage
 * Advances the user's stage for this procedure (easy -> medium -> hard),
 * skipping tiers that have 0 questions.
 */

r.post("/:slug/advance-stage", async (_req, res) => {
  return res.json({
    ok: true,
    advanced: false,
    difficulty: null,
    message: "Progression disabled during schema upgrade"
  });
});



// r.post("/:slug/advance-stage", async (req, res) => {
//   try {
//     const userId = req.user?.id || req.user?._id;
//     if (!userId) return res.status(401).json({ error: "Login required" });

//     const lesson = await Lesson.findOne({ slug: req.params.slug });
//     if (!lesson) return res.status(404).json({ error: "Lesson not found" });

//     // Count available questions by difficulty for this lesson
//     const qs = await Question.find({ question_id: { $in: lesson.questionIds } })
//       .select("difficulty")
//       .lean();

//     const counts = { easy: 0, medium: 0, hard: 0 };
//     for (const q of qs) {
//       const d = normDiff(q.difficulty);
//       if (counts[d] != null) counts[d] += 1;
//     }

//     // Ensure progress doc exists
//     const prog0 = await LessonProgress.findOneAndUpdate(
//       { userId, lessonSlug: lesson.slug },
//       { $setOnInsert: { stage: 0, completedStages: [] } },
//       { upsert: true, new: true }
//     ).lean();

//     const currentStage = prog0?.stage ?? 0;

//     // Find next stage that actually has questions
//     let nextStage = currentStage;
//     for (let candidate = currentStage + 1; candidate <= 2; candidate++) {
//       const diff = stageToDifficulty(candidate);
//       if ((counts[diff] || 0) > 0) {
//         nextStage = candidate;
//         break;
//       }
//     }

//     // No further tiers available
//     if (nextStage === currentStage) {
//       return res.json({
//         ok: true,
//         advanced: false,
//         stage: currentStage,
//         difficulty: stageToDifficulty(currentStage),
//         counts
//       });
//     }

//     const prog = await LessonProgress.findOneAndUpdate(
//       { userId, lessonSlug: lesson.slug },
//       {
//         $set: { stage: nextStage },
//         $addToSet: { completedStages: currentStage }
//       },
//       { new: true }
//     ).lean();

//     return res.json({
//       ok: true,
//       advanced: true,
//       stage: prog.stage,
//       difficulty: stageToDifficulty(prog.stage),
//       counts
//     });
//   } catch (e) {
//     console.error("[advance-stage] error", e);
//     res.status(500).json({ error: "Server error" });
//   }
// });



// GET /lessons/:slug/results
r.get("/:slug/results", async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim();
    const lesson = await Lesson.findOne({ slug }).lean();
    let advanced = req.query.advanced === "true";
    let next = req.query.next || null;


    if (!lesson) return res.status(404).render("error", { message: "Lesson not found" });

    const correct = Number(req.query.correct);
    const total = Number(req.query.total);
    const points = req.query.points != null ? Number(req.query.points) : null;

    const safeCorrect = Number.isFinite(correct) ? correct : null;
    const safeTotal = Number.isFinite(total) ? total : null;
    const pct =
      safeCorrect != null && safeTotal != null && safeTotal > 0
        ? Math.round((safeCorrect / safeTotal) * 100)
        : null;

    advanced = req.query.advanced === "true";
    next = req.query.next ? String(req.query.next) : null;
    const practice = req.query.practice === "true";


    return res.render("lesson_results", {
      title: "Results",
      lesson,
      correct: safeCorrect,
      total: safeTotal,
      points,
      pct,
      advanced,
      next,
      practice
    });

  } catch (err) {
    console.error("GET /lessons/:slug/results error:", err);
    return res.status(500).render("error", { message: "Server error" });
  }
});


/**
 * GET /lessons/:slug
 * Renders the quiz UI (EJS)
 */
r.get("/:slug", async (req, res) => {
  const slug = req.params.slug;

  // Find lesson by slug (canonical identifier)
  const lessonDoc = await Lesson.findOne({ slug }).lean();

    if (!lessonDoc) {
      return res.status(404).render("lesson_not_found", {
        title: "Lesson Not Found",
        slug
      });
    }


  // Normalize the lesson metadata we pass into the view
  const lesson = {
    slug: lessonDoc.slug,
    title: lessonDoc.title,
    topic: lessonDoc.topic || null,
    order: lessonDoc.order ?? null,
    objectives: Array.isArray(lessonDoc.objectives)
      ? lessonDoc.objectives
      : []
  };

  // Page title = lesson title
  res.render("quiz", {
    title: lesson.title,
    lesson
  });
});








// ✅ POST /lessons/:slug/complete
// body: { correct, total, points? }
// Saves a final snapshot of lesson completion for anonymous user (userId = null for now)
r.post("/:slug/complete", async (req, res) => {
  try {
    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.status(400).json({ ok: false, error: "Missing lesson slug" });

    const lesson = await Lesson.findOne({ slug }).lean();
    if (!lesson) return res.status(404).json({ ok: false, error: "Lesson not found" });

    const correct = Number(req.body?.correct);
    const total = Number(req.body?.total);
    const points = req.body?.points != null ? Number(req.body.points) : null;

    if (!Number.isFinite(correct) || !Number.isFinite(total)) {
      return res.status(400).json({ ok: false, error: "correct and total must be numbers" });
    }
    if (correct < 0 || total < 0 || correct > total) {
      return res.status(400).json({ ok: false, error: "Invalid score range" });
    }

    // anonymous for now
    const userId = null;

    // ✅ Save snapshot (overwrite), not increment
    const doc = await LessonProgress.findOneAndUpdate(
      { lessonId: slug, userId },
      { $set: { lessonId: slug, userId, correct, total } },
      { upsert: true, new: true }
    );

    // ✅ Always record an attempt history entry
    await LessonAttempt.create({
      lessonId: slug,
      userId: null,
      correct,
      total,
      points: Number.isFinite(points) ? points : null
    });


    console.log(`[complete] ${slug} score ${correct}/${total} points=${points ?? "n/a"}`);

    return res.json({
      ok: true,
      progress: { lessonId: doc.lessonId, correct: doc.correct, total: doc.total },
      points
    });
  } catch (err) {
    console.error("POST /lessons/:slug/complete error:", err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});


export default r;
