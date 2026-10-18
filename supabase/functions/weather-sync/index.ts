import { adminClient, authorize, corsHeaders, json, readJson } from '../_shared/http.ts'
import { loadConfig, runRecompute } from '../_shared/core.ts'
import { syncWeather } from '../_shared/weather.ts'

// Pull the live Open-Meteo forecast and set the hazard clock (time-to-impact). No API key needed.
// POST { force?: boolean }  force=true ignores the 15-minute freshness check and the demo lock.
// Also runs automatically inside `tick`; call this directly to refresh on demand or from a scheduler.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const sb = adminClient()
  const who = await authorize(req, sb, ['coordinator'])
  if (!who) return json({ error: 'Not authorised' }, 401)
  const body = await readJson(req)
  try {
    const cfg = await loadConfig(sb)
    const force = body.force === true
    if (force && cfg.hazard_state?.source === 'demo') {
      cfg.hazard_state = { ...cfg.hazard_state, source: 'open-meteo' } // explicit unlock
    }
    const result = await syncWeather(sb, cfg, force)
    if (result.ok && !result.skipped) await runRecompute(sb)
    return json({ ...result, ok: result.ok })
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message || e) }, 500)
  }
})
