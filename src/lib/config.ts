function env(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback
  if (value === undefined) {
    throw new Error(
      `Environment variable "${key}" is required but not set. ` +
      `Copy .env.example to .env.local and fill in the missing values.`
    )
  }
  return value
}

export const config = {
  weather: {
    lat: env('WEATHER_LAT', '52.3676'),
    lon: env('WEATHER_LON', '4.9041'),
    timezone: env('WEATHER_TIMEZONE', 'Europe/Amsterdam'),
  },
  kuma: {
    baseUrl: env('KUMA_BASE_URL', 'http://localhost:3001'),
    slug: env('KUMA_SLUG', 'public'),
  },
} as const
