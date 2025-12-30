import { Router } from "express";
import Lesson from "../models/Lesson.js";
import Question from "../models/Question.js";
import LessonProgress from "../models/LessonProgress.js";


const r = Router();

function stageToDifficulty(stage) {
  if (stage === 1) return "medium";
  if (stage === 2) return "hard";
  return "easy";
}

function normDiff(d) {
  if (d === undefined || d === null) return null;
  const s = String(d).trim().toLowerCase();
  return s || null;
}

function difficultyToStage(diff) {
  const d = normDiff(diff);
  if (d === "medium") return 1;
  if (d === "hard") return 2;
  return 0; // easy/default
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
 * returns { lesson: {...}, questions: [...] }
 */
// returns { lesson: {...}, questions: [...], stageInfo: {...} }

r.get("/:slug.json", async (req, res) => {
  try {
    const lesson = await Lesson.findOne({ slug: req.params.slug }).lean();
    if (!lesson) return res.status(404).json({ error: "Lesson not found" });

    const questionIds = Array.isArray(lesson.questionIds) ? lesson.questionIds : [];
    if (questionIds.length === 0) {
      return res.json({
        lesson: { slug: lesson.slug, title: lesson.title, order: lesson.order },
        stageInfo: { stage: 0, difficulty: "easy", unlockedStages: [0] },
        questions: []
      });
    }

    // Load all questions, keep lesson order
    const qs = await Question.find({ question_id: { $in: questionIds } }).lean();
    const byId = new Map(qs.map(q => [q.question_id, q]));
    const orderedAll = questionIds.map(id => byId.get(id)).filter(Boolean);

    // Count questions per tier for this procedure (used by UI to disable empty tiers)
    const tierCounts = { easy: 0, medium: 0, hard: 0 };
    for (const q of orderedAll) {
      const d = normDiff(q.difficulty);
      if (tierCounts[d] != null) tierCounts[d] += 1;
    }


    // Determine user's progress
    const userId = req.user?.id || req.user?._id || null;
    let stage = 0;              // current progression stage (0 easy, 1 medium, 2 hard)
    let completedStages = [];   // stages you've completed

    if (userId) {
      const prog = await LessonProgress.findOneAndUpdate(
        { userId, lessonSlug: lesson.slug },
        { $setOnInsert: { stage: 0, completedStages: [] } },
        { upsert: true, new: true }
      ).lean();

      stage = prog?.stage ?? 0;
      completedStages = Array.isArray(prog?.completedStages) ? prog.completedStages : [];
    }

    // Highest tier you've unlocked is the max of: stage + completed stages (and always at least 0)
    const maxUnlocked = Math.max(0, stage, ...(completedStages || []));

    // Unlock = all tiers up to maxUnlocked (so if you're on medium, easy stays unlocked)
    const unlockedStages = Array.from({ length: maxUnlocked + 1 }, (_, i) => i);


    // Requested difficulty (optional)
    const requestedDifficulty = normDiff(req.query.difficulty);
    const requestedStage = requestedDifficulty ? difficultyToStage(requestedDifficulty) : stage;

    // Enforce lock: you can only request <= maxUnlocked
    const allowedStage = (requestedStage <= maxUnlocked) ? requestedStage : stage;
    const targetDiff = stageToDifficulty(allowedStage);

    // Try the selected/allowed tier first
    let servedDifficulty = targetDiff;
    let ordered = orderedAll.filter(q => normDiff(q.difficulty) === servedDifficulty);

    let tierEmpty = false;
    let fallbackFrom = null;

// If tier has no questions, fall back to the nearest tier that DOES have questions.
// Prefer unlocked tiers first (downward), then any tier (to avoid a broken page).
if (ordered.length === 0 && orderedAll.length > 0) {
  tierEmpty = true;
  fallbackFrom = servedDifficulty;

  // 1) check unlocked tiers downward: allowedStage -> 0
  let found = null;
  for (let s = allowedStage; s >= 0; s--) {
    if (!unlockedStages.includes(s)) continue;
    const d = stageToDifficulty(s);
    const tmp = orderedAll.filter(q => normDiff(q.difficulty) === d);
    if (tmp.length) { found = { d, tmp }; break; }
  }

  // 2) if still nothing, check any tier (easy/medium/hard)
  if (!found) {
    for (const d of ["easy", "medium", "hard"]) {
      const tmp = orderedAll.filter(q => normDiff(q.difficulty) === d);
      if (tmp.length) { found = { d, tmp }; break; }
    }
  }

  if (found) {
    servedDifficulty = found.d;
    ordered = found.tmp;
  }
}

return res.json({
  lesson: { slug: lesson.slug, title: lesson.title, order: lesson.order },
  stageInfo: {
    stage,
    difficulty: stageToDifficulty(stage),
    unlockedStages,
    tierCounts,
    requestedDifficulty: requestedDifficulty || null,
    servedDifficulty,
    locked: requestedStage > maxUnlocked,
    tierEmpty,
    fallbackFrom,
    fallbackTo: tierEmpty ? servedDifficulty : null
  },
  questions: ordered
});

  } catch (e) {
    console.error("[LESSON JSON ERROR]", req.params.slug, e);
    return res.status(500).json({ error: "Lesson JSON failed", message: e.message });
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

      const diffById = new Map(qs.map(q => [q.question_id, normDiff(q.difficulty)]));

      for (const l of lessons) {
        const counts = { easy: 0, medium: 0, hard: 0 };
        const ids = Array.isArray(l.questionIds) ? l.questionIds : [];
        for (const id of ids) {
          const d = diffById.get(id);
          if (counts[d] != null) counts[d] += 1;
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
r.post("/:slug/advance-stage", async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) return res.status(401).json({ error: "Login required" });

    const lesson = await Lesson.findOne({ slug: req.params.slug });
    if (!lesson) return res.status(404).json({ error: "Lesson not found" });

    // Count available questions by difficulty for this lesson
    const qs = await Question.find({ question_id: { $in: lesson.questionIds } })
      .select("difficulty")
      .lean();

    const counts = { easy: 0, medium: 0, hard: 0 };
    for (const q of qs) {
      const d = normDiff(q.difficulty);
      if (counts[d] != null) counts[d] += 1;
    }

    // Ensure progress doc exists
    const prog0 = await LessonProgress.findOneAndUpdate(
      { userId, lessonSlug: lesson.slug },
      { $setOnInsert: { stage: 0, completedStages: [] } },
      { upsert: true, new: true }
    ).lean();

    const currentStage = prog0?.stage ?? 0;

    // Find next stage that actually has questions
    let nextStage = currentStage;
    for (let candidate = currentStage + 1; candidate <= 2; candidate++) {
      const diff = stageToDifficulty(candidate);
      if ((counts[diff] || 0) > 0) {
        nextStage = candidate;
        break;
      }
    }

    // No further tiers available
    if (nextStage === currentStage) {
      return res.json({
        ok: true,
        advanced: false,
        stage: currentStage,
        difficulty: stageToDifficulty(currentStage),
        counts
      });
    }

    const prog = await LessonProgress.findOneAndUpdate(
      { userId, lessonSlug: lesson.slug },
      {
        $set: { stage: nextStage },
        $addToSet: { completedStages: currentStage }
      },
      { new: true }
    ).lean();

    return res.json({
      ok: true,
      advanced: true,
      stage: prog.stage,
      difficulty: stageToDifficulty(prog.stage),
      counts
    });
  } catch (e) {
    console.error("[advance-stage] error", e);
    res.status(500).json({ error: "Server error" });
  }
});



/**
 * GET /lessons/:slug
 * Renders the quiz UI (EJS)
 */
r.get("/:slug", async (req, res) => {
  const lesson = await Lesson.findOne({ slug: req.params.slug }).lean();
  if (!lesson) return res.status(404).send("Lesson not found");
  res.render("quiz", { title: lesson.title, lesson });
});

export default r;
