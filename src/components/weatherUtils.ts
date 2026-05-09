export interface WeatherInfo {
  label: string
  icon: string
}

export function wmoToInfo(code: number): WeatherInfo {
  if (code === 0) return { label: 'Clear', icon: '☀️' }
  if (code === 1) return { label: 'Mostly clear', icon: '🌤️' }
  if (code === 2) return { label: 'Partly cloudy', icon: '⛅' }
  if (code === 3) return { label: 'Overcast', icon: '☁️' }
  if (code <= 49) return { label: 'Foggy', icon: '🌫️' }
  if (code <= 55) return { label: 'Drizzle', icon: '🌦️' }
  if (code <= 65) return { label: 'Rain', icon: '🌧️' }
  if (code <= 75) return { label: 'Snow', icon: '❄️' }
  if (code <= 82) return { label: 'Showers', icon: '🌦️' }
  if (code <= 86) return { label: 'Snow showers', icon: '🌨️' }
  if (code <= 99) return { label: 'Thunderstorm', icon: '⛈️' }
  return { label: 'Unknown', icon: '🌡️' }
}

export function dayLabel(dateStr: string, index: number): string {
  if (index === 0) return 'Today'
  if (index === 1) return 'Tomorrow'
  const locale = process.env.NEXT_PUBLIC_CLOCK_LOCALE ?? 'en-US'
  return new Date(dateStr).toLocaleDateString(locale, { weekday: 'short' })
}
