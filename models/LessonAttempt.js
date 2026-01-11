import mongoose from "mongoose";

const { Schema } = mongoose;

const LessonAttemptSchema = new Schema(
  {
    lessonId: { type: String, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true, default: null },

    correct: { type: Number, required: true, default: 0, min: 0 },
    total: { type: Number, required: true, default: 0, min: 0 },

    points: { type: Number, default: null }
  },
  { timestamps: true }
);

const LessonAttempt =
  mongoose.models.LessonAttempt ||
  mongoose.model("LessonAttempt", LessonAttemptSchema);

export default LessonAttempt;
