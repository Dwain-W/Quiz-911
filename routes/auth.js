import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const r = Router();

const cookieOpts = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production", // true on Render (https)
  maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
};

// GET /auth/login
r.get("/login", (_req, res) => {
  res.render("auth_login", {
    title: "Sign in",
    error: null,
    form: {},
  });
});

// GET /auth/register
r.get("/register", (_req, res) => {
  res.render("auth_register", {
    title: "Create account",
    error: null,
    form: {},
  });
});

// POST /auth/register
r.post("/register", async (req, res) => {
  try {
    const { email, displayName, password } = req.body || {};

    if (!email || !displayName || !password) {
      return res.status(400).render("auth_register", {
        title: "Create account",
        error: "Email, display name, and password are required.",
        form: { email, displayName },
      });
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).render("auth_register", {
        title: "Create account",
        error: "An account with that email already exists.",
        form: { email: normalizedEmail, displayName },
      });
    }

    const hash = await bcrypt.hash(password, 10);

    const user = await User.create({
      email: normalizedEmail,
      displayName: displayName.trim(),
      hash,
    });

    if (!process.env.JWT_SECRET) {
      console.error("❌ JWT_SECRET is not set in environment");
      return res.status(500).render("auth_register", {
        title: "Create account",
        error: "Server configuration error (missing JWT_SECRET).",
        form: { email: normalizedEmail, displayName },
      });
    }

    const token = jwt.sign(
      { id: user._id.toString(), email: user.email, displayName: user.displayName },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie("token", token, cookieOpts);
    return res.redirect("/learn");
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).render("auth_register", {
      title: "Create account",
      error: "Registration failed. Please try again.",
      form: {
        email: req.body?.email || "",
        displayName: req.body?.displayName || "",
      },
    });
  }
});

// POST /auth/login
r.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).render("auth_login", {
        title: "Sign in",
        error: "Email and password are required.",
        form: { email },
      });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(401).render("auth_login", {
        title: "Sign in",
        error: "Invalid email or password.",
        form: { email: normalizedEmail },
      });
    }

    const ok = await bcrypt.compare(password, user.hash);
    if (!ok) {
      return res.status(401).render("auth_login", {
        title: "Sign in",
        error: "Invalid email or password.",
        form: { email: normalizedEmail },
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error("❌ JWT_SECRET is not set in environment");
      return res.status(500).render("auth_login", {
        title: "Sign in",
        error: "Server configuration error (missing JWT_SECRET).",
        form: { email: normalizedEmail },
      });
    }

    const token = jwt.sign(
      { id: user._id.toString(), email: user.email, displayName: user.displayName },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie("token", token, cookieOpts);
    return res.redirect("/learn");
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).render("auth_login", {
      title: "Sign in",
      error: "Login failed. Please try again.",
      form: { email: req.body?.email || "" },
    });
  }
});

// POST /auth/logout
r.post("/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  res.redirect("/");
});

// GET /auth/me (debug helper)
r.get("/me", (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: req.user });
});

export default r;
