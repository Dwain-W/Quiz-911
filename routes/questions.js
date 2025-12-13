import { Router } from "express";
import Question from "../models/Question.js";
const r = Router();

/**
 * GET /questions?topic=&type=&difficulty=&limit=
 * Returns a JSON list of questions (for admin/tools/debug).
 */
r.get("/", async (req, res) => {
  const { topic, type, difficulty, limit = 10 } = req.query;
  const q = {};
  if (topic) q.topic = topic;
  if (type) q.type = type;
  if (difficulty) q.difficulty = difficulty;

  const items = await Question.find(q).limit(Number(limit));
  res.json(items);
});

export default r;
