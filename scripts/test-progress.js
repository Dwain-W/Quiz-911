import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Always load the .env from the project root (one level above /scripts)
dotenv.config({ path: path.join(__dirname, "..", ".env") });

import mongoose from "mongoose";
import LessonProgress from "../models/LessonProgress.js";

console.log("DEBUG ENV PATH =", path.join(__dirname, "..", ".env"));
console.log("DEBUG MONGO_URI =", process.env.MONGO_URI);



async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

  if (!uri) {
    console.error("❌ Missing MONGO_URI (or MONGODB_URI) in environment variables.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("✅ Connected to MongoDB");

  const doc = await LessonProgress.create({
    lessonId: "911-intake-basics",
    userId: null,     // anonymous for now
    correct: 3,
    total: 5
  });

  console.log("✅ Inserted LessonProgress:");
  console.log({
    _id: String(doc._id),
    lessonId: doc.lessonId,
    userId: doc.userId,
    correct: doc.correct,
    total: doc.total,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  });

  await mongoose.disconnect();
  console.log("✅ Disconnected");
}

main().catch((err) => {
  console.error("❌ Test script failed:", err);
  process.exit(1);
});
