import { NextResponse } from 'next/server'
import { loadConfig, updateConfig, type DashboardSettings } from '@/lib/appConfig'

export const dynamic = 'force-dynamic'

export type { DashboardSettings } from '@/lib/appConfig'

const DEFAULTS: DashboardSettings = { schoolWeekOffset: 0 }
/** Keeps a typo or runaway click from producing a nonsense week number */
const MAX_OFFSET = 60

function load(): DashboardSettings {
  const parsed = loadConfig().dashboard
  return {
    schoolWeekOffset:
      typeof parsed?.schoolWeekOffset === 'number' && Number.isFinite(parsed.schoolWeekOffset)
        ? parsed.schoolWeekOffset
        : DEFAULTS.schoolWeekOffset,
  }
}

export function GET() {
  return NextResponse.json(load())
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<DashboardSettings>
    const settings = load()

    if (typeof body.schoolWeekOffset === 'number' && Number.isFinite(body.schoolWeekOffset)) {
      const rounded = Math.round(body.schoolWeekOffset)
      settings.schoolWeekOffset = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, rounded))
    }

    updateConfig('dashboard', settings)
    return NextResponse.json({ success: true, ...settings })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
