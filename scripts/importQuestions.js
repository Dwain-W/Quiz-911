import fs from "fs";
import mongoose from "mongoose";
import dotenv from "dotenv";
import Question from "../models/Question.js";
dotenv.config();

const file = process.argv[2];
if(!file) { console.error("Usage: node scripts/importQuestions.js <path.json>"); process.exit(1); }

async function main(){
  await mongoose.connect(process.env.MONGO_URL);
  const data = JSON.parse(fs.readFileSync(file,"utf-8"));
  for(const q of data){
    await Question.findOneAndUpdate({ question_id: q.question_id }, q, { upsert:true });
  }
  console.log(`Imported ${data.length} questions.`);
  await mongoose.disconnect();
}
main();
