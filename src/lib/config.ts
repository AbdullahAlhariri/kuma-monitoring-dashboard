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
    enabled: env('WEATHER_ENABLED', 'true') === 'true',
    lat: env('WEATHER_LAT', '51.5714'),
    lon: env('WEATHER_LON', '4.6366'),
    timezone: env('WEATHER_TIMEZONE', 'Europe/Amsterdam'),
  },
  kuma: {
    enabled: env('KUMA_ENABLED', 'true') === 'true',
    baseUrl: env('KUMA_BASE_URL', 'http://localhost:3001'),
    slug: env('KUMA_SLUG', 'public'),
  },
  beaver: {
    enabled: env('BEAVER_ENABLED', 'true') === 'true',
    baseUrl: env('BEAVER_BASE_URL'),
    token: env('BEAVER_TOKEN'),
    refetchIntervalMs: parseInt(env('BEAVER_REFETCH_INTERVAL_MS', '10000'), 10),
    contributionWeeks: parseInt(env('BEAVER_CONTRIBUTION_WEEKS', '52'), 10),
  },
  mawaqit: {
    enabled: env('MAWAQIT_ENABLED', 'true') === 'true',
    url: env('MAWAQIT_URL'),
  },
} as const
