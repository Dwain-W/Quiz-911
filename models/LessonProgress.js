import mongoose from "mongoose";

const LessonProgressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    lessonSlug: { type: String, required: true, index: true },

    // 0 = easy, 1 = medium, 2 = hard
    stage: { type: Number, default: 0 },

    // optional: track completed stages like [0,1]
    completedStages: { type: [Number], default: [] }
  },
  { timestamps: true }
);

LessonProgressSchema.index({ userId: 1, lessonSlug: 1 }, { unique: true });

export default mongoose.model("LessonProgress", LessonProgressSchema);
