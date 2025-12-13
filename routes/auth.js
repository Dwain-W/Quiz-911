import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const r = Router();
const cookieOpts = {
  httpOnly: true, sameSite: "lax",
  secure: false, // set true in prod https
  maxAge: 1000 * 60 * 60 * 24 * 7
};

r.get("/login", (_req, res)=> res.render("auth_login", { title:"Sign in" }));
r.get("/register", (_req, res)=> res.render("auth_register", { title:"Create account" }));

r.post("/register", async (req, res) => {
  const { email, password, displayName } = req.body;
  if (!email || !password || !displayName) return res.status(400).send("Missing fields");
  const exists = await User.findOne({ email });
  if (exists) return res.status(409).send("Email already registered");
  const hash = await bcrypt.hash(password, 10);
  const user = await User.create({ email, displayName, hash });
  const token = jwt.sign({ id: user._id, email, displayName }, process.env.JWT_SECRET, { expiresIn: "7d" });
  res.cookie("token", token, cookieOpts);
  res.redirect("/learn");
});

r.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(401).send("Invalid credentials");
  const ok = await bcrypt.compare(password, user.hash);
  if (!ok) return res.status(401).send("Invalid credentials");
  const token = jwt.sign({ id: user._id, email, displayName: user.displayName }, process.env.JWT_SECRET, { expiresIn: "7d" });
  res.cookie("token", token, cookieOpts);
  res.redirect("/learn");
});

r.post("/logout", (req, res) => {
  res.clearCookie("token", { httpOnly: true, sameSite: "lax", secure: false });
  res.redirect("/");
});

r.get("/me", async (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: req.user });
});

export default r;
