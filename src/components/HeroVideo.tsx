import { useEffect, useRef, useState } from 'react'

/**
 * Clips are NOT bundled with the app (large files do not belong in git or in the Vite build).
 * They are served from a storage bucket. Set VITE_MEDIA_BASE_URL to the bucket's public folder, for example
 *   https://<project>.supabase.co/storage/v1/object/public/media
 * and upload 1.mp4, 3.mp4 and 4.mp4 there. Without it the hero simply shows the dark background.
 */
const BASE = ((import.meta.env.VITE_MEDIA_BASE_URL as string | undefined) || '').replace(/\/+$/, '')
const CLIPS = BASE ? ['1.mp4', '3.mp4', '4.mp4'].map((f) => `${BASE}/${f}`) : [] // playback order 1, 3, 4, then loop
const SPEED = 0.5 // slow motion

/**
 * Background playlist. Every clip fills the same box (absolute inset-0 + object-cover). Only the clip that is
 * playing (and the next one) is loaded, so the page does not download every clip up front.
 */
export default function HeroVideo({ className = '' }: { className?: string }) {
  const refs = useRef<(HTMLVideoElement | null)[]>([])
  const [active, setActive] = useState(0)

  useEffect(() => {
    refs.current.forEach((v, i) => {
      if (!v) return
      if (i === active) {
        v.currentTime = 0
        v.playbackRate = SPEED
        v.play().catch(() => {})
      } else {
        window.setTimeout(() => v.pause(), 900) // let the fade-out finish first
      }
    })
  }, [active])

  if (CLIPS.length === 0) return null

  const next = (active + 1) % CLIPS.length
  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      {CLIPS.map((src, i) => (
        <video
          key={src}
          ref={(el) => { refs.current[i] = el }}
          src={src}
          muted
          playsInline
          preload={i === active || i === next ? 'auto' : 'none'}
          onLoadedMetadata={(e) => { e.currentTarget.playbackRate = SPEED }}
          onPlay={(e) => { e.currentTarget.playbackRate = SPEED }}
          onEnded={() => i === active && setActive(next)}
          onError={() => i === active && setActive(next)}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-[900ms] ease-in-out ${i === active ? 'opacity-100' : 'opacity-0'}`}
        />
      ))}
    </div>
  )
}
