/**
 * Copies the Apple emoji images this dashboard uses out of
 * emoji-datasource-apple and into public/emoji/, so the rendered icons no
 * longer depend on the host machine having Apple Color Emoji installed.
 *
 * Run with: npm run sync:emoji
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = path.join(root, 'node_modules', 'emoji-datasource-apple', 'img', 'apple', '64')
const outDir = path.join(root, 'public', 'emoji')

// Every emoji rendered by the UI (weather icons, rain badge, moon phases)
const EMOJI = [
  '☀️', '🌤️', '⛅', '☁️', '🌫️', '🌦️', '🌧️', '❄️', '🌨️', '⛈️', '🌡️', '💧',
  '🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘',
]

/** Apple datasource filenames are hyphen-joined lowercase codepoints. */
function candidates(char) {
  const points = [...char].map((c) => c.codePointAt(0).toString(16).padStart(4, '0'))
  const withVs = points.join('-')
  const withoutVs = points.filter((p) => p !== 'fe0f').join('-')
  return [...new Set([withVs, withoutVs])]
}

if (!fs.existsSync(srcDir)) {
  console.error(`Missing ${srcDir} — run "npm install" first.`)
  process.exit(1)
}

fs.mkdirSync(outDir, { recursive: true })

let copied = 0
const missing = []
for (const char of EMOJI) {
  const name = candidates(char).find((c) => fs.existsSync(path.join(srcDir, `${c}.png`)))
  if (!name) {
    missing.push(char)
    continue
  }
  fs.copyFileSync(path.join(srcDir, `${name}.png`), path.join(outDir, `${name}.png`))
  copied++
}

console.log(`Copied ${copied}/${EMOJI.length} emoji into public/emoji`)
if (missing.length > 0) {
  console.error(`No image found for: ${missing.join(' ')}`)
  process.exit(1)
}
