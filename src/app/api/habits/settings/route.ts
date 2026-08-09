import { NextResponse } from 'next/server'
import {
  getHabitSpec,
  loadTagConfig,
  saveTagConfig,
  type HabitConfigEntry,
  type HabitSpec,
  type HabitUiConfig,
  type TagConfig,
} from '@/lib/habitConfig'

export const dynamic = 'force-dynamic'

interface SettingsPatch {
  /** Habit to patch, by the name Beaver reports (the key used in habit-tags.json) */
  habitName?: string
  habit?: Pick<HabitSpec, 'view' | 'showStreak' | 'strictNoSkip'>
  /** Tag colour overrides for that habit, e.g. { "30 minutes": "#22c55e" } */
  tags?: Record<string, string>
  ui?: HabitUiConfig
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

export function GET() {
  const cfg = loadTagConfig()
  return NextResponse.json({ ui: cfg?.ui ?? {} })
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SettingsPatch
    const cfg: TagConfig = loadTagConfig() ?? {}

    if (body.ui) {
      cfg.ui = { ...cfg.ui, ...body.ui }
    }

    if (body.habitName && (body.habit ?? body.tags)) {
      cfg.habits ??= {}
      const hasEntry = Object.prototype.hasOwnProperty.call(cfg.habits, body.habitName)
      const existing: HabitConfigEntry = cfg.habits[body.habitName]
      // The shorthand `{tag: color}` form is preserved by moving it under `tags`
      const spec: HabitSpec =
        getHabitSpec(cfg, body.habitName) ??
        (hasEntry ? { tags: existing as Record<string, string> } : {})

      let tags = spec.tags
      if (body.tags) {
        const clean: Record<string, string> = {}
        for (const [tag, color] of Object.entries(body.tags)) {
          // Reject anything that isn't a plain hex colour before it reaches the file
          if (HEX_COLOR.test(color)) {
            clean[tag.startsWith('#') ? tag.slice(1) : tag] = color.toLowerCase()
          }
        }
        tags = { ...tags, ...clean }
      }

      cfg.habits[body.habitName] = { ...spec, ...body.habit, ...(tags ? { tags } : {}) }
    }

    saveTagConfig(cfg)

    return NextResponse.json({ success: true, ui: cfg.ui ?? {} })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
