import { loadConfig, updateConfig, type HabitSpec, type TagConfig } from '@/lib/appConfig'

export type {
  HabitView,
  HabitSpec,
  HabitConfigEntry,
  HabitUiConfig,
  TagConfig,
} from '@/lib/appConfig'

/** The habits section of the single dashboard config file. */
export function loadTagConfig(): TagConfig | null {
  return loadConfig().habits ?? null
}

export function saveTagConfig(cfg: TagConfig): void {
  updateConfig('habits', cfg)
}

/** Reads the display spec of a habit, tolerating the bare `{tag: color}` shorthand. */
export function getHabitSpec(cfg: TagConfig | null, habitName: string): HabitSpec | null {
  const entry = cfg?.habits?.[habitName]
  if (!entry) return null
  const obj = entry as Record<string, unknown>
  // Shorthand form is a plain tag→colour map, not a spec
  const isSpec =
    'visualization' in obj || 'view' in obj || 'showStreak' in obj || 'strictNoSkip' in obj || 'tags' in obj
  return isSpec ? entry : null
}
