import mongoose from "mongoose";

const { Schema } = mongoose;

const LessonProgressSchema = new Schema(
  {
    // Lesson identifier (we’ll use lesson.slug or lessonId consistently later)
    lessonId: { type: String, required: true, index: true },

    // Optional now, required later if you enforce login
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true, default: null },

    // Progress stats (we’ll define what “correct” means in controller step)
    correct: { type: Number, required: true, default: 0, min: 0 },
    total: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true } // adds createdAt + updatedAt automatically
);

// Helpful uniqueness rule once login exists:
// one progress doc per (userId, lessonId)
LessonProgressSchema.index({ userId: 1, lessonId: 1 }, { unique: false });

const LessonProgress =
  mongoose.models.LessonProgress ||
  mongoose.model("LessonProgress", LessonProgressSchema);

export default LessonProgress;
