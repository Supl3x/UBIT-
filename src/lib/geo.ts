import type { Feature, Polygon } from 'geojson'

/** Geometry helpers shared by the map, the field app and the data mappers. Coordinates are [lng, lat] unless stated. */

export const KARACHI_CENTER: [number, number] = [67.01, 24.86]

/** [lng, lat] centroid per area, used when a household has no exact point. */
export const AREA_CENTER: Record<string, [number, number]> = {
  lyari: [66.9905, 24.8615],
  malir: [67.195, 24.893],
  korangi: [67.1204, 24.8376],
  keamari: [66.98, 24.82],
  gulshan: [67.08, 24.92],
  other: KARACHI_CENTER,
}

type GeoJsonPoint = { type?: string; coordinates?: unknown }

/**
 * PostgREST returns PostGIS geometry as GeoJSON. Returns [lng, lat] or null when the value is missing or unreadable
 * (for example a hex EWKB string, which we do not decode in the browser).
 */
export function parsePoint(v: unknown): [number, number] | null {
  if (!v) return null
  const g = (typeof v === 'string' ? safeJson(v) : v) as GeoJsonPoint | null
  const c = g?.coordinates
  if (Array.isArray(c) && c.length >= 2) {
    const lng = Number(c[0])
    const lat = Number(c[1])
    if (Number.isFinite(lng) && Number.isFinite(lat)) return [lng, lat]
  }
  return null
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

/** Snap to a ~1 km grid so sensitive households are never shown at their exact doorstep. */
export const snapCoarse = ([lng, lat]: [number, number]): [number, number] => [
  Math.round(lng * 100) / 100,
  Math.round(lat * 100) / 100,
]

export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371
  const dLat = ((b[1] - a[1]) * Math.PI) / 180
  const dLng = ((b[0] - a[0]) * Math.PI) / 180
  const la = (a[1] * Math.PI) / 180
  const lb = (b[1] * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Approximate a circle (radius in km) as a GeoJSON polygon ring. */
export function circlePolygon(center: [number, number], radiusKm: number, steps = 48): Feature<Polygon> {
  const [lng, lat] = center
  const dLat = radiusKm / 110.574
  const dLng = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180))
  const ring: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2
    ring.push([lng + dLng * Math.cos(t), lat + dLat * Math.sin(t)])
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }
}

export const formatKm = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`)
