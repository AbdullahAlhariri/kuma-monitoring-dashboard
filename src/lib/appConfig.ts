import fs from 'fs'
import path from 'path'

export type HabitView = 'graph' | 'classic'

export interface HabitSpec {
  visualization?: string
  /** Contribution graph or the classic dot row */
  view?: HabitView
  showStreak?: boolean
  /** true = any missed day resets the streak */
  strictNoSkip?: boolean
  strictStreakReset?: boolean
  tags?: Record<string, string>
}

export type HabitConfigEntry = HabitSpec | Record<string, string>

export interface HabitUiConfig {
  /** Hide habits already completed today */
  hideCompleted?: boolean
  /** Lay the cards out two per row instead of one */
  twoColumns?: boolean
  /** Habit names in display order; anything missing is appended */
  order?: string[]
}

export interface TagConfig {
  tags?: Record<string, string>
  habits?: Record<string, HabitConfigEntry>
  ui?: HabitUiConfig
}

export interface DashboardSettings {
  /** Added to the calendar's lecture week, so the shown number can be nudged */
  schoolWeekOffset: number
}

export interface MawaqitConfig {
  mosque?: {
    name?: string
    url?: string
    slug?: string
  }
}

/** Everything the running dashboard persists, in one file. */
export interface AppConfig {
  dashboard?: Partial<DashboardSettings>
  mawaqit?: MawaqitConfig
  habits?: TagConfig
}

export const CONFIG_PATH = path.join(
  process.cwd(),
  process.env.DASHBOARD_CONFIG_PATH ?? 'dashboard.config.json'
)

/** Files this config replaced; merged in once so an existing install keeps its data. */
const LEGACY_SOURCES: { file: string; section: keyof AppConfig }[] = [
  { file: 'dashboard-settings.json', section: 'dashboard' },
  { file: 'mawaqit-config.json', section: 'mawaqit' },
  { file: 'habit-tags.json', section: 'habits' },
]

function readJson(filePath: string): Record<string, unknown> | null {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>
    }
  } catch {
    // A missing or corrupt file falls back to defaults
  }
  return null
}

function migrateLegacyConfig(): AppConfig | null {
  const merged: AppConfig = {}
  let found = false
  for (const { file, section } of LEGACY_SOURCES) {
    const parsed = readJson(path.join(process.cwd(), file))
    if (parsed) {
      merged[section] = parsed
      found = true
    }
  }
  if (!found) return null
  saveConfig(merged)
  return merged
}

export function loadConfig(): AppConfig {
  const parsed = readJson(CONFIG_PATH)
  if (parsed) return parsed
  return migrateLegacyConfig() ?? {}
}

export function saveConfig(cfg: AppConfig): void {
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(cfg, null, 2)}\n`, 'utf-8')
}

/** Read-modify-write of a single section, so writers don't clobber each other. */
export function updateConfig<K extends keyof AppConfig>(section: K, value: AppConfig[K]): void {
  const cfg = loadConfig()
  cfg[section] = value
  saveConfig(cfg)
}
