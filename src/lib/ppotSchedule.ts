/** Calendar-day offsets from the original request, not delays between reminders. */
export function validPpotSchedule(value: unknown): value is number[] {
  return Array.isArray(value) && value.length <= 12 && value.every((day, i) =>
    Number.isInteger(day) && day >= 1 && day <= 365 && (i === 0 || day > value[i - 1]));
}

export function ppotAge(sent: string, today: string): number {
  const valid = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
  return valid(sent) && valid(today) ? Math.floor((Date.parse(today) - Date.parse(sent)) / 86400000) : -1;
}

export interface PpotScheduleProgress {
  followupCoveredThroughDay?: unknown;
  followupAttemptDate?: unknown;
  followupDate?: unknown;
  reminderDate?: unknown;
  reminderSentAt?: unknown;
}

/** Return only the latest outstanding milestone; skip older missed milestones. */
export function ppotDueMilestone(sent: string, today: string, schedule: number[], progress: PpotScheduleProgress): number | null {
  const age = ppotAge(sent, today);
  if (age < 0 || !validPpotSchedule(schedule)) return null;
  let covered = typeof progress.followupCoveredThroughDay === 'number' ? progress.followupCoveredThroughDay : -1;
  for (const date of [progress.followupAttemptDate, progress.followupDate, progress.reminderDate]) {
    if (typeof date === 'string') covered = Math.max(covered, ppotAge(sent, date));
  }
  // Older failed automatic reminders have a stamp but no submission date.
  // Treat their first milestone as attempted, while allowing later milestones.
  if (progress.reminderSentAt && covered < 0) covered = schedule[0] ?? -1;
  return schedule.filter(day => day <= age && day > covered).at(-1) ?? null;
}
