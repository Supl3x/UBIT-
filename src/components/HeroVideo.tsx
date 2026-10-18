import { useEffect, useRef, useState } from 'react'

const BASE = import.meta.env.VITE_MEDIA_BASE_URL || ''
const NAMES = ['1.mp4', '3.mp4', '4.mp4']
const CLIPS = BASE ? NAMES.map(n => `${BASE}/${n}`) : []
const SPEED = 0.5

/**
 * Background playlist. Every clip is stretched to fill the same box
 * (absolute inset-0 + object-cover), so all of them render at an identical size
 * regardless of their source resolution. Clips play in slow motion and crossfade.
 * 
 * Videos are loaded from VITE_MEDIA_BASE_URL. If not set, shows a plain dark background.
 */
export default function HeroVideo({ className = '' }: { className?: string }) {
  const refs = useRef<(HTMLVideoElement | null)[]>([])
  const [active, setActive] = useState(0)
  const nextIdx = (active + 1) % CLIPS.length

  // Play only the active clip, restart it, and apply the slow-mo rate.
  useEffect(() => {
    if (!CLIPS.length) return
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

  // No URL configured: show plain dark background
  if (!CLIPS.length) {
    return <div className={`absolute inset-0 bg-gray-900 ${className}`} aria-hidden="true" />
  }

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      {CLIPS.map((src, i) => (
        <video
          key={i}
          ref={(el) => { refs.current[i] = el }}
          src={src}
          muted
          playsInline
          preload={i === active || i === nextIdx ? 'auto' : 'none'}
          onLoadedMetadata={(e) => { e.currentTarget.playbackRate = SPEED }}
          onPlay={(e) => { e.currentTarget.playbackRate = SPEED }}
          onEnded={() => i === active && setActive((a) => (a + 1) % CLIPS.length)}
          onError={() => i === active && setActive((a) => (a + 1) % CLIPS.length)}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-[900ms] ease-in-out ${i === active ? 'opacity-100' : 'opacity-0'}`}
        />
      ))}
    </div>
  )
}
