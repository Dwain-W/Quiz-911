import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  email: { type: String, unique: true, index: true, required: true },
  displayName: { type: String, required: true },
  hash: { type: String, required: true },
  xp: { type: Number, default: 0 },
  streak: { type: Number, default: 0 }
  
}, { timestamps: true });

UserSchema.index({ xp: -1, streak: -1 });

export default mongoose.model("User", UserSchema);
