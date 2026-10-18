import { adminClient, authorize, corsHeaders, json, readJson } from '../_shared/http.ts'
import { audit, loadConfig, runRecompute, setConfig } from '../_shared/core.ts'

// Human decisions on a case. The system recommends; a person decides and is accountable, so the rules are enforced
// here on the server (not just in the UI):
//   accept   { case_id }                          coordinator
//   override { case_id, reason, tier? }           coordinator. A reason of at least 8 characters is REQUIRED.
//   safe     { case_id }                          coordinator, or the volunteer the case is assigned to
//   dispatch { case_id }                          coordinator. Approves and dispatches the proposed assets
//   fairness_stats                                coordinator. Rank vs report-rate per area
//   fairness_apply { area, multiplier, reason }   coordinator. Reason required, multiplier 1.0 - 1.6
//   fairness_clear { area? }                      coordinator
// Every action writes an insert-only audit_log row with before/after state.

const MIN_REASON = 8

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const sb = adminClient()
  const who = await authorize(req, sb, ['coordinator', 'volunteer'])
  if (!who) return json({ error: 'Not authorised' }, 401)

  const body = await readJson(req)
  const action = String(body.action || '')
  const caseId = String(body.case_id || '')
  const reason = String(body.reason || '').trim()
  const coordOnly = action !== 'safe'
  if (coordOnly && who.role !== 'coordinator') return json({ error: 'Coordinators only' }, 403)

  const actor = { user_id: who.id, user_name: who.name, user_role: who.role === 'system' ? null : who.role }

  try {
    if (action === 'fairness_stats') return json({ ok: true, ...(await fairnessStats(sb)) })

    if (action === 'fairness_apply' || action === 'fairness_clear') {
      const cfg = await loadConfig(sb)
      const before = { ...(cfg.fairness_boost || {}) }
      const after = { ...before }
      if (action === 'fairness_apply') {
        const area = String(body.area || '')
        const mult = Number(body.multiplier)
        if (!area) return json({ ok: false, error: 'area is required' }, 400)
        if (!Number.isFinite(mult) || mult < 1 || mult > 1.6) return json({ ok: false, error: 'multiplier must be between 1.0 and 1.6' }, 400)
        if (reason.length < MIN_REASON) return json({ ok: false, error: `A reason of at least ${MIN_REASON} characters is required` }, 400)
        after[area] = Math.round(mult * 100) / 100
      } else if (body.area) delete after[String(body.area)]
      else for (const k of Object.keys(after)) delete after[k]
      await setConfig(sb, 'fairness_boost', after)
      await audit(sb, {
        ...actor, action_type: 'fairness', action_text: action === 'fairness_apply'
          ? `Fairness correction ${after[String(body.area)]}x applied to ${body.area}` : 'Fairness correction cleared',
        before_state: before, after_state: after, reason: reason || 'Cleared by coordinator',
      })
      const result = await runRecompute(sb)
      return json({ ok: true, fairness_boost: after, result })
    }

    if (!caseId) return json({ ok: false, error: 'case_id is required' }, 400)
    const { data: c } = await sb.from('cases')
      .select('id, name, tier, risk, status, assigned_volunteer_id').eq('id', caseId).maybeSingle()
    if (!c) return json({ ok: false, error: 'Case not found' }, 404)
    if (who.role === 'volunteer' && c.assigned_volunteer_id !== who.id) return json({ ok: false, error: 'Case is not assigned to you' }, 403)
    const before = { status: c.status, tier: c.tier, risk: Number(c.risk) }
    const base = { ...actor, case_id: c.id, case_name: c.name }

    switch (action) {
      case 'accept': {
        await sb.from('cases').update({ status: 'accepted' }).eq('id', c.id)
        await audit(sb, { ...base, action_type: 'accept', action_text: `Recommendation accepted for ${c.name}`, before_state: before, after_state: { ...before, status: 'accepted' } })
        await sb.from('timeline').insert({ case_id: c.id, event_type: 'decision', event_text: `Recommendation accepted by ${who.name}`, created_by: who.id })
        break
      }

      case 'override': {
        if (reason.length < MIN_REASON) return json({ ok: false, error: `An override needs a written reason (at least ${MIN_REASON} characters)` }, 400)
        const tier = [1, 2, 3].includes(Number(body.tier)) ? Number(body.tier) : c.tier
        await sb.from('cases').update({ status: 'overridden', tier }).eq('id', c.id)
        await audit(sb, {
          ...base, action_type: 'override', action_text: `Override: ${c.name} set to Tier ${tier}`, reason,
          before_state: before, after_state: { status: 'overridden', tier, risk: before.risk },
        })
        await sb.from('timeline').insert({ case_id: c.id, event_type: 'decision', event_text: `Overridden by ${who.name} (Tier ${tier}): ${reason}`, created_by: who.id })
        break
      }

      case 'safe': {
        await sb.from('cases').update({ status: 'safe' }).eq('id', c.id)
        await sb.from('assignments').update({ status: 'cancelled' }).eq('case_id', c.id).eq('status', 'queued')
        await sb.from('checkins').update({ status: 'closed' }).eq('case_id', c.id).in('status', ['pending', 'escalated'])
        await audit(sb, { ...base, action_type: 'safe', action_text: `${c.name} marked safe`, reason: reason || null, before_state: before, after_state: { ...before, status: 'safe' } })
        await sb.from('timeline').insert({ case_id: c.id, event_type: 'decision', event_text: `Marked safe by ${who.name}`, created_by: who.id })
        break
      }

      case 'dispatch': {
        const nowIso = new Date().toISOString()
        const { data: asg } = await sb.from('assignments').select('id, asset_id, asset_label, volunteer_id')
          .eq('case_id', c.id).in('status', ['queued', 'approved']).order('created_at', { ascending: false }).limit(1).maybeSingle()
        if (!asg) return json({ ok: false, error: 'No proposed assignment for this case yet. Run recompute first.' }, 409)
        await sb.from('assignments').update({ status: 'dispatched', approved_by: who.id, approved_at: nowIso, dispatched_at: nowIso, pinned: true }).eq('id', asg.id)
        if (asg.asset_id) await sb.from('assets').update({ available: false, current_case_id: c.id }).eq('id', asg.asset_id)
        await sb.from('cases').update({ status: 'dispatched' }).eq('id', c.id)
        await audit(sb, { ...base, action_type: 'dispatch', action_text: `${asg.asset_label} dispatched to ${c.name}`, before_state: before, after_state: { ...before, status: 'dispatched' }, reason: reason || null })
        await sb.from('timeline').insert({ case_id: c.id, event_type: 'dispatch', event_text: `${asg.asset_label} dispatched by ${who.name}`, created_by: who.id })
        break
      }

      default:
        return json({ ok: false, error: `Unknown action "${action}"` }, 400)
    }

    const result = await runRecompute(sb)
    return json({ ok: true, action, case_id: c.id, result })
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message || e) }, 500)
  }
})

/**
 * Fairness: quiet areas report less (power cuts, no signal), so they must not be ranked lower for being quiet.
 * report rate = inbound messages in the last 24 h per active household. Gap = area rate vs the city-wide rate.
 */
async function fairnessStats(sb: ReturnType<typeof adminClient>) {
  const cfg = await loadConfig(sb)
  const boost: Record<string, number> = cfg.fairness_boost || {}
  const { data: cases } = await sb.from('cases').select('id, area, risk, tier, status').in('status', ['pending', 'accepted', 'overridden', 'dispatched'])
  const since = new Date(Date.now() - 24 * 3600_000).toISOString()
  const { data: inbound } = await sb.from('communication_log').select('case_id').eq('direction', 'inbound').gte('created_at', since)
  const areaOf = new Map<string, string>((cases || []).map((c: any) => [c.id, c.area]))
  const reports: Record<string, number> = {}
  for (const m of inbound || []) {
    const a = areaOf.get((m as any).case_id)
    if (a) reports[a] = (reports[a] || 0) + 1
  }
  const byArea: Record<string, { n: number; risk: number; t1: number }> = {}
  for (const c of cases || []) {
    const a = (c as any).area as string
    const x = (byArea[a] ||= { n: 0, risk: 0, t1: 0 })
    x.n++; x.risk += Number((c as any).risk); if ((c as any).tier === 1) x.t1++
  }
  const total = (cases || []).length || 1
  const cityRate = Object.values(reports).reduce((s, n) => s + n, 0) / total
  const cityRisk = (cases || []).reduce((s: number, c: any) => s + Number(c.risk), 0) / total
  const rows = Object.entries(byArea).map(([area, x]) => {
    const rate = (reports[area] || 0) / x.n
    const avgRisk = x.risk / x.n
    const ratio = cityRate > 0 ? rate / cityRate : 1
    const flagged = cityRate > 0 && ratio < 0.6 && avgRisk <= cityRisk
    return {
      area, households: x.n, tier1: x.t1, avg_risk: Math.round(avgRisk * 10) / 10,
      reports_24h: reports[area] || 0, report_rate: Math.round(rate * 100) / 100, report_ratio: Math.round(ratio * 100) / 100,
      flagged, suggested_multiplier: flagged ? Math.min(1.5, Math.round((1 / Math.max(ratio, 0.67)) * 100) / 100) : 1,
      applied_multiplier: boost[area] ?? 1,
    }
  }).sort((a, b) => a.report_ratio - b.report_ratio)
  return { city_report_rate: Math.round(cityRate * 100) / 100, city_avg_risk: Math.round(cityRisk * 10) / 10, areas: rows }
}
