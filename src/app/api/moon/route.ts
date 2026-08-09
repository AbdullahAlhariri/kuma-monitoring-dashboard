import { NextResponse } from 'next/server'
import { phaseFromAge } from '@/lib/moon'

/**
 * Real imagery of the Moon as it looks right now, from NASA's Dial-A-Moon
 * (Scientific Visualization Studio, rendered from Lunar Reconnaissance Orbiter
 * data). Public, no API key. One frame per hour.
 */

interface DialAMoonResponse {
  image?: { url?: string; alt_text?: string }
  /** Illuminated percentage of the disc */
  phase?: number
  /** Days into the lunation */
  age?: number
  distance?: number
  diameter?: number
}

export const revalidate = 3600

export async function GET() {
  const now = new Date()
  // The API is keyed on UTC to the hour
  const stamp = `${now.toISOString().slice(0, 13)}:00`

  try {
    const res = await fetch(`https://svs.gsfc.nasa.gov/api/dialamoon/${stamp}`, {
      next: { revalidate: 3600 },
    })
    if (!res.ok) {
      throw new Error(`Dial-A-Moon error: ${res.status}`)
    }

    const data = (await res.json()) as DialAMoonResponse
    const age = data.age ?? 0
    const { name, icon } = phaseFromAge(age)

    return NextResponse.json({
      imageUrl: data.image?.url ?? null,
      illumination: Math.round(data.phase ?? 0),
      age,
      name,
      icon,
      distanceKm: data.distance ?? null,
      fetchedAt: now.toISOString(),
    })
  } catch (err) {
    // The client falls back to its own computed phase and the bundled icon
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
