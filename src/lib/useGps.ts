import { useEffect, useState } from 'react'

export type Gps = { lng: number; lat: number; accuracy: number } | null

/** Volunteer position. GPS works with no mobile data, so distance and ETA keep working offline. */
export function useGps(): { gps: Gps; error: string | null } {
  const [gps, setGps] = useState<Gps>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setError('GPS not available on this device')
      return
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setError(null)
        setGps({ lng: p.coords.longitude, lat: p.coords.latitude, accuracy: Math.round(p.coords.accuracy) })
      },
      (e) => setError(e.message || 'GPS unavailable'),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])
  return { gps, error }
}

/** Walking speed ~4.5 km/h, which is realistic in flooded streets. */
export const walkMinutes = (km: number) => Math.max(1, Math.round((km / 4.5) * 60))
