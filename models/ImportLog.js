import mongoose from "mongoose";

const { Schema } = mongoose;

const ImportLogSchema = new Schema(
  {
    jsonPath: { type: String, required: true },
    lessonSlug: { type: String, required: true, index: true },
    lessonTitle: { type: String },
    topic: { type: String },
    questionCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

const ImportLog =
  mongoose.models.ImportLog || mongoose.model("ImportLog", ImportLogSchema);

export default ImportLog;
