import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

// Live forecast -> time-to-impact. Open-Meteo is free and needs no API key.
// https://open-meteo.com/en/docs
//
// Flood mode: the hazard clock counts down to the first hour where the running rainfall total (including the last
// few hours already fallen) crosses FLOOD_TOTAL_MM, or a single hour crosses FLOOD_HOURLY_MM (flash flooding).
// Heatwave mode: it counts down to the first hour with an apparent temperature at or above HEAT_APPARENT_C.
// If nothing is forecast inside the window the clock is parked at the end of the window (advisory stage).

const FLOOD_TOTAL_MM = 50
const FLOOD_HOURLY_MM = 15
const HEAT_APPARENT_C = 41
const WINDOW_HOURS = 48
const PAST_HOURS = 6
export const WEATHER_REFRESH_MIN = 15

// Karachi, Sindh. Override with the `weather_location` row in system_config: { "lat": .., "lng": .. }
const DEFAULT_LOCATION = { lat: 24.8607, lng: 67.0011 }

export type WeatherResult = {
  ok: boolean
  skipped?: string
  error?: string
  eta_at?: string
  countdown_seconds?: number
  rain_24h_mm?: number
  peak_hourly_mm?: number
  max_temp_c?: number
  trigger?: string
}

type Hourly = { time: string[]; precipitation: number[]; apparent_temperature: number[]; temperature_2m: number[] }

export async function fetchForecast(lat: number, lng: number): Promise<Hourly> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lng))
  url.searchParams.set('hourly', 'precipitation,temperature_2m,apparent_temperature')
  url.searchParams.set('past_hours', String(PAST_HOURS))
  url.searchParams.set('forecast_hours', String(WINDOW_HOURS))
  url.searchParams.set('timezone', 'UTC')
  const r = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!r.ok) throw new Error(`Open-Meteo responded ${r.status}`)
  const j = await r.json()
  if (!j?.hourly?.time) throw new Error('Open-Meteo returned no hourly data')
  return j.hourly as Hourly
}

/** Pure: turn an hourly series into an impact time. `nowMs` is the real clock. */
export function impactFromForecast(h: Hourly, mode: 'flood' | 'heatwave', nowMs: number) {
  const hours = h.time.map((t, i) => ({
    at: new Date(`${t}:00Z`).getTime(),
    rain: Number(h.precipitation[i] ?? 0),
    apparent: Number(h.apparent_temperature[i] ?? h.temperature_2m[i] ?? 0),
    temp: Number(h.temperature_2m[i] ?? 0),
  }))
  const future = hours.filter((x) => x.at + 3600_000 > nowMs)
  const windowEnd = nowMs + WINDOW_HOURS * 3600_000

  const rainPast = hours.filter((x) => x.at <= nowMs).reduce((s, x) => s + x.rain, 0)
  const rain24 = future.filter((x) => x.at < nowMs + 24 * 3600_000).reduce((s, x) => s + x.rain, 0)
  const peakHourly = future.reduce((m, x) => Math.max(m, x.rain), 0)
  const maxTemp = future.reduce((m, x) => Math.max(m, x.temp), -Infinity)

  let etaMs = windowEnd
  let trigger = 'no threshold reached in the next 48 h'
  if (mode === 'heatwave') {
    const hit = future.find((x) => x.apparent >= HEAT_APPARENT_C)
    if (hit) { etaMs = Math.max(hit.at, nowMs); trigger = `apparent temperature reaches ${Math.round(hit.apparent)} C` }
  } else {
    let running = rainPast
    for (const x of future) {
      running += x.rain
      if (x.rain >= FLOOD_HOURLY_MM) { etaMs = Math.max(x.at, nowMs); trigger = `${x.rain.toFixed(0)} mm in one hour`; break }
      if (running >= FLOOD_TOTAL_MM) { etaMs = Math.max(x.at, nowMs); trigger = `${running.toFixed(0)} mm cumulative rain`; break }
    }
  }
  return {
    etaMs,
    trigger,
    rain24: Math.round(rain24 * 10) / 10,
    peakHourly: Math.round(peakHourly * 10) / 10,
    maxTemp: Number.isFinite(maxTemp) ? Math.round(maxTemp * 10) / 10 : null,
  }
}

/**
 * Refresh the hazard clock from the forecast. Skipped when:
 *  - the demo has locked the clock (hazard_state.source === 'demo'), or
 *  - the last fetch is newer than WEATHER_REFRESH_MIN (unless `force`).
 */
export async function syncWeather(sb: SupabaseClient, cfg: Record<string, any>, force = false): Promise<WeatherResult> {
  const hz = cfg.hazard_state || {}
  if (hz.source === 'demo' && !force) return { ok: true, skipped: 'Hazard clock is locked by the demo controls' }
  const last = hz.fetched_at ? new Date(hz.fetched_at).getTime() : 0
  if (!force && Date.now() - last < WEATHER_REFRESH_MIN * 60_000) return { ok: true, skipped: 'Forecast is fresh' }

  const loc = { ...DEFAULT_LOCATION, ...(cfg.weather_location || {}) }
  const mode = hz.mode === 'heatwave' ? 'heatwave' : 'flood'
  try {
    const hourly = await fetchForecast(Number(loc.lat), Number(loc.lng))
    const now = Date.now()
    const x = impactFromForecast(hourly, mode, now)
    const countdown = Math.max(0, Math.round((x.etaMs - now) / 1000))
    const next = {
      ...hz, mode, source: 'open-meteo', eta_at: new Date(x.etaMs).toISOString(), fetched_at: new Date(now).toISOString(),
      rain_24h_mm: x.rain24, peak_hourly_mm: x.peakHourly, max_temp_c: x.maxTemp, trigger: x.trigger,
    }
    await sb.from('system_config').upsert([
      { key: 'hazard_state', value: next },
      { key: 'hazard_countdown_seconds', value: countdown },
    ])
    cfg.hazard_state = next
    cfg.hazard_countdown_seconds = countdown
    return { ok: true, eta_at: next.eta_at, countdown_seconds: countdown, rain_24h_mm: x.rain24, peak_hourly_mm: x.peakHourly, max_temp_c: x.maxTemp ?? undefined, trigger: x.trigger }
  } catch (e) {
    // Never break the heartbeat because a weather API was unreachable: keep the previous clock.
    return { ok: false, error: String((e as Error).message || e) }
  }
}
