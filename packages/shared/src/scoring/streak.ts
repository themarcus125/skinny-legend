import { eachDay, addDays, type LocalDate } from '../dates.js';
import type { ChallengeConfig, StreakResult } from './types.js';

export function computeStreak(activeDays: Set<LocalDate>, challenge: ChallengeConfig, asOf: LocalDate): StreakResult {
  const end = asOf < challenge.endDate ? asOf : challenge.endDate;
  // "Today isn't over yet" grace only applies when `end` really is today,
  // i.e. asOf hasn't already passed the challenge's endDate.
  const graceApplies = asOf <= challenge.endDate;
  // Evaluate through yesterday; today only counts if already active.
  const lastFullDay = addDays(end, -1);
  let current = 0;
  let longest = 0;
  let bonusesAwarded = 0;

  const consider = (day: LocalDate) => {
    if (activeDays.has(day)) {
      current += 1;
      if (current > longest) longest = current;
      if (current % challenge.streakLength === 0) bonusesAwarded += 1;
    } else {
      current = 0;
    }
  };

  if (lastFullDay >= challenge.startDate) {
    for (const day of eachDay(challenge.startDate, lastFullDay)) consider(day);
  }
  if (end >= challenge.startDate) {
    if (graceApplies) {
      if (activeDays.has(end)) consider(end);
    } else {
      // asOf is past endDate: `end` has already elapsed, so an inactive
      // final day resets the streak like any other elapsed day.
      consider(end);
    }
  }

  return { current, longest, bonusesAwarded, bonusPoints: bonusesAwarded * challenge.streakPoints };
}
