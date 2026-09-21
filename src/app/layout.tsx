import type { Metadata } from 'next'
import { Outfit, Scheherazade_New } from 'next/font/google'
import './globals.css'

// Google Sans is not distributed for web use, so the stacks in globals.css name
// it first — picked up when it is installed locally — and fall back to Outfit,
// the closest open geometric sans, everywhere else.
const outfit = Outfit({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  variable: '--font-geometric',
  display: 'swap',
})

const scheherazade = Scheherazade_New({
  subsets: ['arabic'],
  weight: ['400', '600', '700'],
  variable: '--font-arabic',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Monitoring Dashboard',
  description: 'Monitoring Dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${scheherazade.variable}`}
    >
      <body>{children}</body>
    </html>
  )
}
