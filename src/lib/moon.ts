/**
 * Moon phase from the date alone — no network call.
 *
 * Counts elapsed synodic months since a known new moon. Good to roughly a few
 * hours, which is far finer than the eight phase names need.
 */

/** Reference new moon: 2000-01-06 18:14 UTC */
const REFERENCE_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14)
/** Mean length of a lunation, in days */
const SYNODIC_MONTH = 29.530588853

const PHASES = [
  { name: 'New moon', icon: '🌑' },
  { name: 'Waxing crescent', icon: '🌒' },
  { name: 'First quarter', icon: '🌓' },
  { name: 'Waxing gibbous', icon: '🌔' },
  { name: 'Full moon', icon: '🌕' },
  { name: 'Waning gibbous', icon: '🌖' },
  { name: 'Last quarter', icon: '🌗' },
  { name: 'Waning crescent', icon: '🌘' },
] as const

export interface MoonPhase {
  name: string
  icon: string
  /** Days into the current lunation */
  age: number
  /** Illuminated fraction of the disc, 0-100 */
  illumination: number
}

/** Name + icon for a position in the lunation, 0 = new, 0.5 = full. */
export function phaseFromFraction(fraction: number): { name: string; icon: string } {
  const wrapped = ((fraction % 1) + 1) % 1
  return PHASES[Math.round(wrapped * 8) % 8]
}

/** Age in days converted to a named phase. */
export function phaseFromAge(age: number): { name: string; icon: string } {
  return phaseFromFraction(age / SYNODIC_MONTH)
}

export function moonPhase(date: Date): MoonPhase {
  const days = (date.getTime() - REFERENCE_NEW_MOON) / 86400000
  const age = ((days % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH
  const fraction = age / SYNODIC_MONTH

  // Nearest of the eight named phases
  const index = Math.round(fraction * 8) % 8
  const illumination = Math.round(((1 - Math.cos(2 * Math.PI * fraction)) / 2) * 100)

  return { ...PHASES[index], age, illumination }
}
