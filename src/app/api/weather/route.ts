import { NextResponse } from 'next/server'
import { config } from '@/lib/config'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  const rawLat = searchParams.get('lat') ?? config.weather.lat
  const rawLon = searchParams.get('lon') ?? config.weather.lon
  const lat = parseFloat(rawLat)
  const lon = parseFloat(rawLon)

  if (
    isNaN(lat) || isNaN(lon) ||
    lat < -90 || lat > 90 ||
    lon < -180 || lon > 180
  ) {
    return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 })
  }

  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lon))
  url.searchParams.set('current', 'temperature_2m,weather_code,apparent_temperature,relative_humidity_2m,wind_speed_10m')
  url.searchParams.set('hourly', 'temperature_2m,weather_code')
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max')
  url.searchParams.set('timezone', config.weather.timezone)
  url.searchParams.set('forecast_days', '7')
  url.searchParams.set('hourly_hours', '24')

  try {
    const res = await fetch(url.toString(), { next: { revalidate: 900 } })
    if (!res.ok) throw new Error(`Open-Meteo responded with ${res.status}`)
    const data = (await res.json()) as unknown
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
