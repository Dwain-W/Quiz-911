# 911 Quiz App – Question & Lesson JSON Schema

This document defines the JSON formats used by the 911 training quiz app for:

- **Lesson JSON files** (what you import via `/admin/import`)
- **Question objects** inside those files

The goal is to keep all lessons, seeds, and imports consistent so that:

- The **admin import** route can validate and normalize data
- The **lessons API** can serve a predictable shape to the frontend
- The **frontend quiz** (`public/js/quiz.js`) can render any lesson without special cases

---

## 1. Lesson JSON File Formats (Overview)

There are currently **two supported formats** for lesson JSON files:

1. **Full lesson object + questions array** (preferred)

   ```jsonc
   {
     "lesson": {
       "slug": "911-intake-basics",
       "title": "911 Intake Basics (Greeting, Location, Professionalism)",
       "topic": "NYPD Calltaking Fundamentals",
       "order": 1,
       "objectives": [
         "Use the required call greeting.",
         "Confirm location using cross streets."
       ],
       "questionIds": [
         "NYC911-MCQ-001",
         "NYC911-MCQ-002"
       ]
     },
     "questions": [
       {
         "question_id": "NYC911-MCQ-001",
         "...": "see question schema section"
       }
     ]
   }



## 2. Question Object Schema

Each **question** in a lesson JSON file must follow a common base structure, with some
fields varying depending on the `type` of question.

Supported types:

- `"mcq"` – multiple-choice (single correct answer)
- `"true_false"` – true/false questions
- `"fill_blank"` – short text/number answer
- `"matching"` – match pairs (left/right)

### 2.1 Common fields (all question types)

These fields **must or should** exist on **every** question object:

```jsonc
{
  "question_id": "NYC911-MCQ-001",   // REQUIRED – unique ID across all questions
  "type": "mcq",                     // REQUIRED – "mcq" | "true_false" | "fill_blank" | "matching"
  "difficulty": "easy",              // REQUIRED – "easy" | "medium" | "hard"
  "stem": "Question text shown to the user", // REQUIRED – main prompt shown by the frontend

  "topic": "Call Answering",         // RECOMMENDED – high-level topic
  "subtopic": "Greeting",            // OPTIONAL – narrower category

  "solution": "Explanation shown after answering", // OPTIONAL – fallback explanation
  "hints": [                         // OPTIONAL – hints (frontend currently uses first hint)
    "First hint (optional)",
    "Second hint (optional)"
  ],

  "points": 10,                      // OPTIONAL – base point value (default 10 if missing)
  "time_limit_sec": 60,              // OPTIONAL – time limit in seconds (default 60 if missing)

  "tags": ["greeting", "professionalism"] // OPTIONAL – free-form tags
}



{
  "question_id": "NYC911-MCQ-001",
  "type": "mcq",
  "difficulty": "easy",
  "stem": "What is the required greeting when answering a NYC 911 call?",

  "choices": [
    {
      "id": "A",                     // REQUIRED – short label used by frontend (A/B/C/D)
      "text": "Option text",         // REQUIRED – shown to the user
      "is_correct": false,           // REQUIRED – exactly one choice must be true
      "explanation": "Why this option is right/wrong (optional but recommended)"
    }
  ],

  "solution": "Fallback explanation if choice explanations are missing",
  "hints": [
    "Think about the official script.",
    "You must say it verbatim."
  ],
  "points": 10,
  "time_limit_sec": 30
}



{
  "question_id": "NYC911-TF-001",
  "type": "true_false",
  "difficulty": "easy",
  "stem": "Calltakers should always confirm cross streets to verify the location.",
  "answer": "true",                  // REQUIRED – "true" or "false" (lowercase string)

  "solution": "Explanation of why the statement is true or false.",
  "hints": [
    "Think about how we verify exact locations.",
    "Cross streets help confirm the map point."
  ],
  "points": 5,
  "time_limit_sec": 20
}



{
  "question_id": "NYC911-FB-001",
  "type": "fill_blank",
  "difficulty": "easy",
  "stem": "Always ask the caller: “What two __________ are you between?”",
  "answer": "streets",              // REQUIRED – canonical short answer

  "solution": "We always ask for the two cross streets to verify the location.",
  "hints": [
    "Think about the map.",
    "We use these to form an intersection."
  ],
  "points": 5,
  "time_limit_sec": 30
}



{
  "question_id": "NYC911-MATCH-001",
  "type": "matching",
  "difficulty": "medium",
  "stem": "Match each item to the best reason it matters.",
  "answer": [
    ["Required greeting", "Standardized opening that must be stated verbatim"],
    ["Cross streets", "Helps verify the correct location"],
    ["Professional tone", "Prevents escalation and supports information-gathering"],
    ["Apt/floor info", "Improves response accuracy within a building"],
    ["5-minute threshold", "Helps classify crimes as 'past' based on time"]
  ],

  "solution": "Each concept connects to a specific operational reason.",
  "hints": [
    "Think about why each step is in the guide.",
    "Try to pair 'what' with 'why'."
  ],
  "points": 10,
  "time_limit_sec": 60
}



## 3. Lesson Object Schema

When using the **object format**:

```jsonc
{
  "lesson": { ... },
  "questions": [ ... ]
}


{
  "lesson": {
    "slug": "911-intake-basics",
    "title": "911 Intake Basics (Greeting, Location, Professionalism)",
    "topic": "NYPD Calltaking Fundamentals",
    "order": 1,
    "objectives": [
      "Use the required call greeting.",
      "Confirm location using cross streets.",
      "Apply professional calltaker language (avoid prohibited phrasing).",
      "Understand the crimes-in-past threshold basics.",
      "Know what identifying info may/must be provided when requested."
    ],
    "questionIds": [
      "NYC911-MCQ-001",
      "NYC911-MCQ-002",
      "NYC911-TF-001",
      "NYC911-TF-002",
      "NYC911-FB-001",
      "NYC911-FB-002",
      "NYC911-MCQ-003",
      "NYC911-MCQ-004",
      "NYC911-MATCH-001"
    ]
  },
  "questions": [ /* see question schema */ ]
}


