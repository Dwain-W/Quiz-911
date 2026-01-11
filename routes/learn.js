import { Router } from "express";
import Lesson from "../models/Lesson.js";
import Attempt from "../models/Attempt.js";
import LessonProgress from "../models/LessonProgress.js";


const r = Router();

r.get("/", async (req, res) => {
  try {
    const lessons = await Lesson.find({})
      .sort({ order: 1, title: 1 })
      .lean();

    // Load all progress entries
    const progressDocs = await LessonProgress.find({}).lean();

    // Build a map by lessonId (which matches lesson.slug in your setup)
    const progressMap = {};
    for (const p of progressDocs) {
      const id = p.lessonId;
      if (!id) continue;

      if (!progressMap[id]) {
        progressMap[id] = {
          attempts: 0,
          bestPercent: 0
        };
      }

      const bucket = progressMap[id];
      bucket.attempts += 1;

      // If percent exists on this doc, track the best
      if (typeof p.percent === "number" && p.percent > bucket.bestPercent) {
        bucket.bestPercent = p.percent;
      }
    }

    res.render("learn", {
      title: "Learn 911 Procedures",
      lessons,
      lessonProgress: progressMap
    });
  } catch (err) {
    console.error("learn route error:", err);
    res.status(500).send("Error loading learn page");
  }
});

export default r;
