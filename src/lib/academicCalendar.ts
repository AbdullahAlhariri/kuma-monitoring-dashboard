/**
 * TU/e academic calendar 2026-2027, transcribed from the official PDF
 * (Calendar_EN_2026-2027, "lect. wk" and "cal. Wk" columns).
 *
 * The lecture-week number restarts at 1 each quartile and is blank during
 * recesses — holidays do not consume a lecture week, so Q2 runs 1-6, skips the
 * Christmas recess, then resumes at 7 in January.
 *
 * Keyed by ISO week-year + ISO week number, which is what the "cal. Wk" column
 * holds. To move to a new academic year, replace this table.
 */
export interface AcademicWeek {
  /** ISO week-year the calendar week belongs to */
  year: number
  /** ISO week number ("cal. Wk") */
  week: number
  /** "lect. wk", or null for a recess week that is not a teaching week */
  lect: number | null
  quartile: 1 | 2 | 3 | 4 | null
  note?: string
}

/** First teaching week: Monday 31 August 2026 = ISO 2026-W36. */
export const FIRST_TEACHING_YEAR = 2026
export const FIRST_TEACHING_WEEK = 36

export const ACADEMIC_WEEKS: AcademicWeek[] = [
  // Quartile 1 — courses 31 Aug to 23 Oct, exams 26 Oct to 7 Nov
  { year: 2026, week: 36, lect: 1, quartile: 1 },
  { year: 2026, week: 37, lect: 2, quartile: 1 },
  { year: 2026, week: 38, lect: 3, quartile: 1 },
  { year: 2026, week: 39, lect: 4, quartile: 1 },
  { year: 2026, week: 40, lect: 5, quartile: 1 },
  { year: 2026, week: 41, lect: 6, quartile: 1 },
  { year: 2026, week: 42, lect: 7, quartile: 1 },
  { year: 2026, week: 43, lect: 8, quartile: 1 },
  { year: 2026, week: 44, lect: 9, quartile: 1 },
  { year: 2026, week: 45, lect: 10, quartile: 1 },

  // Quartile 2 — courses 9 Nov to 15 Jan, exams 18 to 30 Jan
  { year: 2026, week: 46, lect: 1, quartile: 2 },
  { year: 2026, week: 47, lect: 2, quartile: 2 },
  { year: 2026, week: 48, lect: 3, quartile: 2 },
  { year: 2026, week: 49, lect: 4, quartile: 2 },
  { year: 2026, week: 50, lect: 5, quartile: 2 },
  { year: 2026, week: 51, lect: 6, quartile: 2 },
  { year: 2026, week: 52, lect: null, quartile: 2, note: 'Christmas recess' },
  { year: 2026, week: 53, lect: null, quartile: 2, note: 'Christmas recess' },
  { year: 2027, week: 1, lect: 7, quartile: 2 },
  { year: 2027, week: 2, lect: 8, quartile: 2 },
  { year: 2027, week: 3, lect: 9, quartile: 2 },
  { year: 2027, week: 4, lect: 10, quartile: 2 },

  // Quartile 3 — courses 1 Feb to 2 Apr, exams 5 to 17 Apr
  { year: 2027, week: 5, lect: 1, quartile: 3 },
  { year: 2027, week: 6, lect: null, quartile: 3, note: 'Carnival holiday' },
  { year: 2027, week: 7, lect: 2, quartile: 3 },
  { year: 2027, week: 8, lect: 3, quartile: 3 },
  { year: 2027, week: 9, lect: 4, quartile: 3 },
  { year: 2027, week: 10, lect: 5, quartile: 3 },
  { year: 2027, week: 11, lect: 6, quartile: 3 },
  { year: 2027, week: 12, lect: 7, quartile: 3 },
  { year: 2027, week: 13, lect: 8, quartile: 3 },
  { year: 2027, week: 14, lect: 9, quartile: 3 },
  { year: 2027, week: 15, lect: 10, quartile: 3 },

  // Quartile 4 — courses 19 Apr to 18 Jun, exams 21 Jun to 3 Jul
  { year: 2027, week: 16, lect: 1, quartile: 4 },
  { year: 2027, week: 17, lect: 2, quartile: 4 },
  { year: 2027, week: 18, lect: 3, quartile: 4 },
  { year: 2027, week: 19, lect: 4, quartile: 4 },
  { year: 2027, week: 20, lect: 5, quartile: 4 },
  { year: 2027, week: 21, lect: 6, quartile: 4 },
  { year: 2027, week: 22, lect: 7, quartile: 4 },
  { year: 2027, week: 23, lect: 8, quartile: 4 },
  { year: 2027, week: 24, lect: 9, quartile: 4 },
  { year: 2027, week: 25, lect: 10, quartile: 4 },
  { year: 2027, week: 26, lect: 11, quartile: 4 },
]

/** ISO-8601 week number plus the week-year it belongs to. */
export function isoWeekOf(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const year = d.getUTCFullYear()
  const yearStart = new Date(Date.UTC(year, 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return { year, week }
}

/** Monday of the ISO week containing `date`, at UTC midnight. */
function isoMonday(date: Date): Date {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d
}

/** Monday of a given ISO week-year + week (week 1 always contains Jan 4). */
function mondayOfIsoWeek(year: number, week: number): Date {
  const monday = isoMonday(new Date(year, 0, 4))
  monday.setUTCDate(monday.getUTCDate() + (week - 1) * 7)
  return monday
}

export interface SchoolWeek {
  /** Lecture week, negative while counting down to the first teaching week */
  value: number | null
  quartile: 1 | 2 | 3 | 4 | null
  /** Recess name when the week is not a teaching week */
  note?: string
  /** Ready-to-render text, e.g. "SW 3", "SW -4", "SW —" */
  label: string
}

/**
 * Lecture week for a date, straight from the calendar table. Recess weeks
 * inside the year are not teaching weeks, so they carry no number. Before the
 * year opens it counts down: -1 is the week before the first teaching week.
 */
export function schoolWeekOf(date: Date): SchoolWeek {
  const { year, week } = isoWeekOf(date)
  const entry = ACADEMIC_WEEKS.find((w) => w.year === year && w.week === week)

  if (entry) {
    return entry.lect === null
      ? { value: null, quartile: entry.quartile, note: entry.note, label: 'SW —' }
      : { value: entry.lect, quartile: entry.quartile, label: `SW ${String(entry.lect)}` }
  }

  // Outside the table: count down to the opening week, otherwise nothing to show
  const start = mondayOfIsoWeek(FIRST_TEACHING_YEAR, FIRST_TEACHING_WEEK)
  const current = isoMonday(date)
  if (current.getTime() < start.getTime()) {
    const weeks = Math.round((current.getTime() - start.getTime()) / (7 * 86400000))
    return { value: weeks, quartile: null, label: `SW ${String(weeks)}` }
  }

  return { value: null, quartile: null, note: 'Summer recess', label: 'SW —' }
}
