// scripts/createAdmin.js
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcrypt";

// adjust this path if your User model lives somewhere else
import User from "../models/User.js";

dotenv.config();

async function run() {
  try {
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) {
      console.error("❌ No MONGO_URI / MONGODB_URI set.");
      process.exit(1);
    }

    console.log("Connecting to Mongo:", uri.replace(/\/\/[^@]+@/, "//<redacted>@"));
    await mongoose.connect(uri);
    console.log("✅ Connected");

    // 👉 Pick whatever you want here
    const email = "magusblockbully@gmail.com";
    const password = "maneoman9"; // choose a strong password you’ll remember

    // ⚠️ Check your models/User.js – if it uses "username" instead of "email",
    // or "password" instead of "passwordHash", tweak this object to match.
    const existing = await User.findOne({ email });
    if (existing) {
      console.log("User already exists:", existing.email);
      process.exit(0);
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = new User({
      email,
      passwordHash: hashed,
      role: "admin"
    });

    await user.save();
    console.log("🎉 Admin user created:");
    console.log("  email   :", email);
    console.log("  password:", password);
    process.exit(0);
  } catch (err) {
    console.error("Error creating admin:", err);
    process.exit(1);
  }
}

run();
