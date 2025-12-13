import mongoose from "mongoose";

const LessonSchema = new mongoose.Schema(
  {
    slug: { type: String, unique: true, index: true, required: true },
    title: { type: String, required: true },
    topic: { type: String, required: true },
    objectives: [String],
    questionIds: [{ type: String, required: true }]
  },
  { timestamps: true }
);

export default mongoose.model("Lesson", LessonSchema);
