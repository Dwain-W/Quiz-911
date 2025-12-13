import mongoose from "mongoose";

const AttemptSchema = new mongoose.Schema(
  {
    userId: { type: String, default: "guest" },  // keep simple for MVP
    question_id: { type: String, required: true },
    isCorrect: { type: Boolean, required: true },
    timeTakenSec: { type: Number, default: 0 },
    answerPayload: mongoose.Schema.Types.Mixed,   // whatever the client sent
    awardedPoints: { type: Number, default: 0 }
  },
  { timestamps: true }
);

AttemptSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("Attempt", AttemptSchema);
