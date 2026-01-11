// helpers/streak.js

import { ymd, dayDiff } from "./date.js";

/**
 * Update a user's streak fields when they get a correct answer.
 *
 * Mutates the user object (but does NOT save it).
 *
 * Rules:
 * - If no lastCorrectAt → streak = 1
 * - If lastCorrectAt is today → keep streak (at least 1)
 * - If lastCorrectAt is yesterday → streak++
 * - If older → streak = 1
 *
 * @param {import("../models/User.js").default} user - Mongoose user doc
 * @param {Date} [now=new Date()]
 */
export function applyStreakForCorrect(user, now = new Date()) {
  if (!user) return;

  const todayStr = ymd(now);
  const lastStr = user.lastCorrectAt ? ymd(user.lastCorrectAt) : null;

  if (!lastStr) {
    user.streak = 1;
  } else {
    const diffDays = dayDiff(todayStr, lastStr);

    if (diffDays === 0) {
      // already had a correct today → keep at least 1
      user.streak = Math.max(1, user.streak || 1);
    } else if (diffDays === 1) {
      // yesterday → add to streak
      user.streak = (user.streak || 0) + 1;
    } else {
      // gap of 2+ days → reset streak
      user.streak = 1;
    }
  }

  user.lastCorrectAt = now;
}
