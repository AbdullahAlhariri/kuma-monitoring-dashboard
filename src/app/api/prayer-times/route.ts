import fs from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'
import { config } from '@/lib/config'

export const dynamic = 'force-dynamic'

interface MawaqitJsonConfig {
  mosque?: {
    name?: string
    url?: string
    slug?: string
  }
}

function loadMawaqitConfig(): MawaqitJsonConfig | null {
  try {
    const filePath = path.join(process.cwd(), config.mawaqit.configPath)
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8')
      return JSON.parse(content) as MawaqitJsonConfig
    }
  } catch {
    // Ignore if missing or invalid
  }
  return null
}

interface PrayerData {
  name: string
  time: string
  iqamah: string
}

interface MawaqitConfData {
  calendar: string[][][]
  iqamaCalendar?: string[][][]
}

interface CachedPrayerResult {
  dateKey: string
  prayers: PrayerData[]
  tomorrowFajr: string
  tomorrowFajrIqamah: string
}

let cachedData: CachedPrayerResult | null = null

function parseIqamahTime(azanStr: string, iqamaRaw: string | undefined): string {
  if (!iqamaRaw || !azanStr) return azanStr
  if (iqamaRaw.startsWith('+')) {
    const offset = parseInt(iqamaRaw.slice(1), 10) || 0
    const [h, m] = azanStr.split(':').map(Number)
    const date = new Date(2026, 0, 1, h, m + offset)
    const iqH = String(date.getHours()).padStart(2, '0')
    const iqM = String(date.getMinutes()).padStart(2, '0')
    return `${iqH}:${iqM}`
  }
  return iqamaRaw
}

export async function GET() {
  if (!config.mawaqit.enabled) {
    return NextResponse.json({ enabled: false, prayers: [] })
  }

  const jsonConfig = loadMawaqitConfig()
  const targetUrl = jsonConfig?.mosque?.url ?? config.mawaqit.url

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() // 0-based
  const day = now.getDate() // 1-based
  const dateKey = `${year}-${month}-${day}-${targetUrl}`

  if (cachedData?.dateKey === dateKey) {
    return NextResponse.json(cachedData)
  }

  try {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      next: { revalidate: 3600 },
    })

    if (!res.ok) {
      throw new Error(`Mawaqit fetch failed with status ${res.status}`)
    }

    const html = await res.text()
    const re = /confData\s*=\s*({[\s\S]*?});/
    const match = re.exec(html)
    if (!match?.[1]) {
      throw new Error('Failed to find confData in Mawaqit HTML')
    }

    const json = JSON.parse(match[1]) as MawaqitConfData
    const calendar = json.calendar
    const iqamaCalendar = json.iqamaCalendar

    const todayAzanList: string[] = [...(calendar[month]?.[day] ?? [])]
    // Remove Sunrise (index 1) from Azan calendar
    if (todayAzanList.length > 1) {
      todayAzanList.splice(1, 1)
    }

    const todayIqamaList: string[] = [...(iqamaCalendar?.[month]?.[day] ?? [])]

    // Tomorrow's Fajr
    const tomorrow = new Date(now)
    tomorrow.setDate(now.getDate() + 1)
    const tmMonth = tomorrow.getMonth()
    const tmDay = tomorrow.getDate()
    const tomorrowAzanList = calendar[tmMonth]?.[tmDay] ?? todayAzanList
    const tomorrowIqamaList = iqamaCalendar?.[tmMonth]?.[tmDay] ?? todayIqamaList

    const tomorrowFajr = tomorrowAzanList[0] ?? '05:00'
    const tomorrowFajrIqamah = parseIqamahTime(tomorrowFajr, tomorrowIqamaList[0])

    const names = ['Fajr', 'Duhr', 'Asr', 'Maghrib', 'Isha']
    const prayers: PrayerData[] = names.map((name, i) => {
      const time = todayAzanList[i] ?? '00:00'
      const iqRaw = todayIqamaList[i]
      const iqamah = parseIqamahTime(time, iqRaw)
      return {
        name,
        time,
        iqamah,
      }
    })

    cachedData = {
      dateKey,
      prayers,
      tomorrowFajr,
      tomorrowFajrIqamah,
    }

    return NextResponse.json(cachedData)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Error fetching prayer times:', message)

    if (cachedData) {
      return NextResponse.json(cachedData)
    }

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
