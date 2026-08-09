import { NextResponse } from 'next/server'
import { config } from '@/lib/config'
import {
  getHabitSpec,
  loadTagConfig,
  type HabitConfigEntry,
  type HabitSpec,
  type HabitUiConfig,
  type HabitView,
  type TagConfig,
} from '@/lib/habitConfig'

export const dynamic = 'force-dynamic'

interface BeaverHabitStub {
  id: string
  name: string
  status?: string
}

interface BeaverHabitDetail {
  id: string
  name: string
  star?: boolean
  status?: string
  records?: {
    data: {
      day: string
      done: boolean
      text?: string
    }
  }[]
}

interface HistoryDay {
  date: string
  dayName: string
  dayNum: string
  /** 0 = Monday … 6 = Sunday, used as the row index of the contribution grid */
  dow: number
  monthLabel: string
  isToday: boolean
  done: boolean
  isSkipped: boolean
  color?: string | null
  tagText?: string | null
}

export interface TagOption {
  tag: string
  color: string
}

export interface ProcessedHabit {
  id: string
  name: string
  star: boolean
  todayDone: boolean
  todayColor?: string | null
  streak: number
  /** Streak that survives a single missed day */
  streakLenient: number
  /** Streak that any missed day resets */
  streakStrict: number
  /** true = habit-tags.json says a missed day resets the streak */
  strictStreak: boolean
  showStreak: boolean
  view: HabitView
  history: HistoryDay[]
  availableTags: TagOption[]
  visualization?: string | null
}

const BEAVER_COLORS: Record<string, string> = {
  red: '#ef4444',
  amber: '#f59e0b',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
  pink: '#ec4899',
  orange: '#f97316',
  cyan: '#06b6d4',
  teal: '#14b8a6',
  indigo: '#6366f1',
}

function extractHabitTags(habitCfg: HabitConfigEntry | undefined): Record<string, string> | null {
  if (!habitCfg) return null
  const obj = habitCfg as Record<string, unknown>
  if (obj.tags && typeof obj.tags === 'object') {
    return obj.tags as Record<string, string>
  }
  if (!('visualization' in obj)) {
    return habitCfg as Record<string, string>
  }
  return null
}

function getHabitVisualization(habitName: string, tagConfig: TagConfig | null): string | null {
  const habitCfg = tagConfig?.habits?.[habitName]
  if (habitCfg && 'visualization' in habitCfg && typeof habitCfg.visualization === 'string') {
    return habitCfg.visualization
  }
  return null
}

function getAvailableTags(habitName: string, tagConfig: TagConfig | null): TagOption[] {
  if (!tagConfig) return []

  const habitTags = extractHabitTags(tagConfig.habits?.[habitName])

  // ONLY return tags if this specific habit has tags defined in habit-tags.json!
  if (habitTags) {
    const res: TagOption[] = []
    for (const [tag, color] of Object.entries(habitTags)) {
      const cleanTag = tag.startsWith('#') ? tag.slice(1) : tag
      res.push({ tag: cleanTag, color })
    }
    return res
  }

  return []
}

function getTagVariants(tag: string): string[] {
  const clean = tag.startsWith('#') ? tag.slice(1).trim().toLowerCase() : tag.trim().toLowerCase()
  const variants = [clean, `#${clean}`]
  if (clean === '15m' || clean === '15min' || clean === '15mins') {
    variants.push('15 minutes', '#15 minutes')
  } else if (clean === '30m' || clean === '30min' || clean === '30mins') {
    variants.push('30 minutes', '#30 minutes')
  } else if (clean === '45m' || clean === '45min' || clean === '45mins') {
    variants.push('45 minutes', '#45 minutes')
  } else if (clean === '1h' || clean === '1hr' || clean === '1hour') {
    variants.push('1 hour', '#1 hour')
  }
  return variants
}

function resolveRecordColor(
  text: string | undefined | null,
  habitName: string,
  tagConfig: TagConfig | null
): string | null {
  if (!text) return null

  // Extract tags by splitting on '#'
  const tags = text
    .split('#')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)

  // 1. Check JSON config first (habit-specific, then global) to allow overwriting Beaver colors
  if (tagConfig) {
    const habitTags = extractHabitTags(tagConfig.habits?.[habitName])
    if (habitTags) {
      for (const tag of tags) {
        for (const variant of getTagVariants(tag)) {
          if (habitTags[variant]) return habitTags[variant]
        }
      }
    }
    if (tagConfig.tags) {
      for (const tag of tags) {
        for (const variant of getTagVariants(tag)) {
          if (tagConfig.tags[variant]) return tagConfig.tags[variant]
        }
      }
    }
  }

  // 2. Fallback to Beaver explicit color directives: ##color if not overwritten in JSON
  const colorMatch = /##([a-zA-Z]+)/.exec(text)
  if (colorMatch) {
    const colorName = colorMatch[1].toLowerCase()
    if (BEAVER_COLORS[colorName]) {
      return BEAVER_COLORS[colorName]
    }
  }

  return null
}

type GridDay = Omit<HistoryDay, 'done' | 'isSkipped' | 'color' | 'tagText'>

/** Weeks run Monday → Sunday */
const DOW_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
}

/**
 * Builds a GitHub-contribution-style day range: whole Monday-to-Sunday weeks,
 * with the final (partial) week ending on today.
 */
function getContributionDays(weeks: number, timezone: string): GridDay[] {
  const now = new Date()
  const yearFmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const nameFmt = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' })
  const numFmt = new Intl.DateTimeFormat('en-US', { timeZone: timezone, day: 'numeric' })
  const monthFmt = new Intl.DateTimeFormat('en-US', { timeZone: timezone, month: 'short' })

  const todayDow = DOW_INDEX[nameFmt.format(now)] ?? 0
  // Full weeks before the current one, plus the elapsed part of the current week.
  const count = Math.max(1, weeks - 1) * 7 + todayDow + 1

  const days: GridDay[] = []
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400 * 1000)
    const dayName = nameFmt.format(d)
    days.push({
      date: yearFmt.format(d),
      dayName,
      dayNum: numFmt.format(d),
      dow: DOW_INDEX[dayName] ?? 0,
      monthLabel: monthFmt.format(d),
      isToday: i === 0,
    })
  }
  return days
}

/**
 * Calculates streak with 1-day skip allowance.
 * Single missed days between completed days do not reset the streak.
 * Two or more consecutive missed days break the streak.
 */
function calcStreak(completedSet: Set<string>, timezone: string): number {
  const now = new Date()
  const yearFmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })

  const getDateStr = (offsetDays: number) => {
    const d = new Date(now.getTime() - offsetDays * 86400 * 1000)
    return yearFmt.format(d)
  }

  const todayStr = getDateStr(0)
  const yesterdayStr = getDateStr(1)
  const twoDaysAgoStr = getDateStr(2)

  let startOffset = 0
  if (completedSet.has(todayStr)) {
    startOffset = 0
  } else if (completedSet.has(yesterdayStr)) {
    startOffset = 1
  } else if (completedSet.has(twoDaysAgoStr)) {
    startOffset = 2
  } else {
    return 0
  }

  let streak = 0
  let offset = startOffset
  let lastWasMissed = false

  while (offset < 365) {
    const dateStr = getDateStr(offset)
    if (completedSet.has(dateStr)) {
      streak++
      lastWasMissed = false
    } else {
      if (lastWasMissed) {
        break
      }
      lastWasMissed = true
    }
    offset++
  }

  return streak
}

function calcStrictStreak(completedSet: Set<string>, timezone: string): number {
  const now = new Date()
  const yearFmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })

  const getDateStr = (offsetDays: number) => {
    const d = new Date(now.getTime() - offsetDays * 86400 * 1000)
    return yearFmt.format(d)
  }

  const todayStr = getDateStr(0)
  const yesterdayStr = getDateStr(1)

  let startOffset = 0
  if (completedSet.has(todayStr)) {
    startOffset = 0
  } else if (completedSet.has(yesterdayStr)) {
    startOffset = 1
  } else {
    return 0
  }

  let streak = 0
  let offset = startOffset

  while (offset < 365) {
    const dateStr = getDateStr(offset)
    if (completedSet.has(dateStr)) {
      streak++
    } else {
      break
    }
    offset++
  }

  return streak
}

export async function GET() {
  if (!config.beaver.enabled) {
    return NextResponse.json({ enabled: false, habits: [] })
  }

  const { baseUrl, token } = config.beaver
  const timezone = config.weather.timezone
  const tagConfig = loadTagConfig()

  try {
    const habitsRes = await fetch(`${baseUrl}/api/v1/habits`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })

    if (!habitsRes.ok) {
      throw new Error(`Beaver API error — habits: ${habitsRes.status}`)
    }

    const habitStubs = (await habitsRes.json()) as BeaverHabitStub[]

    const detailedHabits = await Promise.all(
      habitStubs.map(async (stub) => {
        try {
          const detailRes = await fetch(`${baseUrl}/api/v1/habits/${stub.id}`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          })
          if (!detailRes.ok) return null
          return (await detailRes.json()) as BeaverHabitDetail
        } catch {
          return null
        }
      })
    )

    const daysHistory = getContributionDays(config.beaver.contributionWeeks, timezone)
    const todayStr = daysHistory[daysHistory.length - 1].date

    const habits: ProcessedHabit[] = []

    for (let i = 0; i < habitStubs.length; i++) {
      const stub = habitStubs[i]
      const detail = detailedHabits[i]
      if (detail?.status && detail.status !== 'active') {
        continue
      }

      const habitName = detail?.name ?? stub.name
      const completedSet = new Set<string>()
      const recordTextMap = new Map<string, string>()

      if (detail?.records) {
        for (const r of detail.records) {
          if (r.data.done && r.data.day) {
            completedSet.add(r.data.day)
            if (r.data.text) {
              recordTextMap.set(r.data.day, r.data.text)
            }
          }
        }
      }

      const todayDone = completedSet.has(todayStr)
      const todayText = recordTextMap.get(todayStr)
      const todayColor = todayDone ? resolveRecordColor(todayText, habitName, tagConfig) : null

      const habitConfig: HabitSpec | null = getHabitSpec(tagConfig, habitName)
      const normName = habitName.toLowerCase().replace(/['’]/g, '').trim()
      const isDidntSeeHabit = (habitConfig?.strictNoSkip ?? false) || normName.includes('didnt see') || normName.includes('didn see')

      const streakLenient = calcStreak(completedSet, timezone)
      const streakStrict = calcStrictStreak(completedSet, timezone)
      const streak = isDidntSeeHabit ? streakStrict : streakLenient
      const availableTags = getAvailableTags(habitName, tagConfig)
      const visualization = getHabitVisualization(habitName, tagConfig)

      const history: HistoryDay[] = daysHistory.map((day, idx) => {
        const done = completedSet.has(day.date)
        let isSkipped = false

        if (!done && !isDidntSeeHabit) {
          const prevDate = idx > 0 ? daysHistory[idx - 1].date : null
          const nextDate = idx < daysHistory.length - 1 ? daysHistory[idx + 1].date : null
          const prevDone = prevDate ? completedSet.has(prevDate) : false
          const nextDone = nextDate ? completedSet.has(nextDate) : false

          // Only a single isolated missed day between completed days is skipped!
          if (prevDone && nextDone) {
            isSkipped = true
          }
        }

        const recordText = recordTextMap.get(day.date)
        const color = done ? resolveRecordColor(recordText, habitName, tagConfig) : null
        const tagText = done ? recordText ?? null : null

        return {
          ...day,
          done,
          isSkipped,
          color,
          tagText,
        }
      })

      const showStreak = habitConfig?.showStreak !== false
      const view: HabitView = habitConfig?.view ?? 'graph'

      habits.push({
        id: stub.id,
        name: habitName,
        star: detail?.star ?? false,
        todayDone,
        todayColor,
        streak,
        streakLenient,
        streakStrict,
        strictStreak: isDidntSeeHabit,
        showStreak,
        view,
        history,
        availableTags,
        visualization,
      })
    }

    const ui: HabitUiConfig = tagConfig?.ui ?? {}

    return NextResponse.json({
      habits,
      ui,
      fetchedAt: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}

export async function POST(request: Request) {
  const { baseUrl, token } = config.beaver
  const timezone = config.weather.timezone

  try {
    const body = (await request.json()) as { habitId: string; date?: string; done: boolean; text?: string }
    if (!body.habitId) {
      return NextResponse.json({ error: 'Missing habitId' }, { status: 400 })
    }

    const yearFmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
    const targetDate = body.date ?? yearFmt.format(new Date())

    const res = await fetch(`${baseUrl}/api/v1/habits/${body.habitId}/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        done: body.done,
        date: targetDate,
        text: body.text ?? (body.done ? undefined : ''),
        date_fmt: '%Y-%m-%d',
      }),
    })

    if (!res.ok) {
      throw new Error(`Beaver API completion error: ${res.status}`)
    }

    return NextResponse.json({
      success: true,
      habitId: body.habitId,
      date: targetDate,
      done: body.done,
      text: body.text,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
