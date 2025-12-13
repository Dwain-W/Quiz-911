import mongoose from "mongoose";

const ChoiceSchema = new mongoose.Schema(
  { id: String, text: String, is_correct: Boolean, explanation: String },
  { _id: false }
);

const ReferenceSchema = new mongoose.Schema(
  { source: String, chapter: String, section: String, pages: String },
  { _id: false }
);

const QuestionSchema = new mongoose.Schema(
  {
    question_id: { type: String, unique: true, index: true, required: true },
    domain: { type: String, default: "physics" },
    topic: { type: String, required: true },
    subtopic: String,
    difficulty: { type: String, enum: ["easy", "medium", "hard"], required: true },
    type: { type: String, enum: ["mcq", "true_false", "fill_blank", "matching"], required: true },
    stem: { type: String, required: true },
    choices: [ChoiceSchema],               // for MCQ
    answer: mongoose.Schema.Types.Mixed,   // string/bool/list for non-MCQ
    hints: [String],
    solution: String,
    time_limit_sec: { type: Number, default: 60 },
    points: { type: Number, default: 10 },
    tags: [String],
    references: [ReferenceSchema],
    randomization: mongoose.Schema.Types.Mixed
  },
  { timestamps: true }
);

export default mongoose.model("Question", QuestionSchema);
