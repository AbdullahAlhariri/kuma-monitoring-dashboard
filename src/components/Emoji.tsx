'use client'
import { useState } from 'react'

/**
 * Renders an emoji from the bundled Apple set in public/emoji, so every machine
 * shows the same artwork instead of whatever font it happens to have. Falls
 * back to the plain character if the image is missing.
 *
 * Images are vendored by `npm run sync:emoji`.
 */
export default function Emoji({ char, size = '1em' }: { char: string; size?: string }) {
  const [failed, setFailed] = useState(false)

  // Code points are exactly what the Apple filenames are keyed on
  // eslint-disable-next-line @typescript-eslint/no-misused-spread
  const points = [...char].map((c) => c.codePointAt(0)?.toString(16).padStart(4, '0') ?? '')
  const name = points.join('-')

  if (failed) {
    return <span className="emoji-fallback">{char}</span>
  }

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="emoji-img"
        src={`/emoji/${name}.png`}
        alt={char}
        draggable={false}
        onError={() => {
          setFailed(true)
        }}
      />
      <style jsx>{`
        .emoji-img {
          width: ${size};
          height: ${size};
          display: inline-block;
          vertical-align: -0.15em;
          object-fit: contain;
          user-select: none;
        }
      `}</style>
    </>
  )
}
