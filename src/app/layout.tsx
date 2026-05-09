import type { Metadata } from 'next'
import { DM_Mono, DM_Sans } from 'next/font/google'
import './globals.css'

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-mono',
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['200', '300', '400'],
  style: ['normal', 'italic'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Monitoring Dashboard',
  description: 'Monitoring Dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmMono.variable} ${dmSans.variable}`}>
      <body>{children}</body>
    </html>
  )
}
