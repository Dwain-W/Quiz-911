import { Router } from "express";
import User from "../models/User.js";

const r = Router();

r.get("/", async (req, res) => {
  const top = await User.find({})
    .sort({ xp: -1, streak: -1 })
    .limit(20)
    .select("displayName xp streak")
    .lean();
  res.render("leaderboard", { title: "Leaderboard", top });
});

export default r;
