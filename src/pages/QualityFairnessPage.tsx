import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { fairnessApply, fairnessClear, fairnessStats, type FairnessArea } from '../lib/functions'
import { hydrateFromSupabase } from '../lib/session'

const AREAS = ['lyari', 'malir', 'korangi'] as const
const label = (a: string) => a.charAt(0).toUpperCase() + a.slice(1)

/**
 * Fairness: areas whose households report less (a silent signal shadow, e.g. a cell outage) can be ranked too low.
 * The server compares each area's report rate to the city's and suggests a multiplier. A coordinator decides whether to
 * apply it, with a written reason. Every change is audited and re-ranks the queue.
 */
export default function QualityFairnessPage() {
  const user = useStore((s) => s.user)
  const cases = useStore((s) => s.cases)
  const canUseServer = useStore((s) => s.canUseServer())
  const showToast = useStore((s) => s.showToast)
  const isCoordinator = user?.role === 'coordinator'

  const [stats, setStats] = useState<FairnessArea[] | null>(null)
  const [city, setCity] = useState<{ rate: number; risk: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [modal, setModal] = useState<{ area: string; multiplier: number } | null>(null)
  const [reason, setReason] = useState('')

  const load = useCallback(async () => {
    if (!isCoordinator || !canUseServer) return
    try {
      const r = await fairnessStats()
      setStats(r.areas)
      setCity({ rate: r.city_report_rate, risk: r.city_avg_risk })
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [isCoordinator, canUseServer])

  useEffect(() => { void load() }, [load])

  // Without the server (viewer role, or offline) show what can be computed from the loaded cases.
  const local = useMemo(() => AREAS.map((a) => {
    const rows = cases.filter((c) => c.area === a && c.status !== 'safe')
    return { area: a, households: rows.length, tier1: rows.filter((c) => c.tier === 1).length, avg: rows.length ? rows.reduce((t, c) => t + c.risk, 0) / rows.length : 0 }
  }), [cases])

  const submit = async () => {
    if (!modal) return
    setBusy(true)
    try {
      await fairnessApply(modal.area, modal.multiplier, reason.trim())
      await hydrateFromSupabase()
      await load()
      showToast(`${label(modal.area)} boosted ${modal.multiplier.toFixed(2)}x. Queue re-ranked and logged.`, 'مساوات کی درستگی لاگو اور درج ہو گئی', 'success')
      setModal(null)
      setReason('')
    } catch (e) {
      showToast((e as Error).message, 'ناکام', 'error')
    } finally {
      setBusy(false)
    }
  }

  const clear = async (area: string) => {
    setBusy(true)
    try {
      await fairnessClear(area)
      await hydrateFromSupabase()
      await load()
      showToast(`${label(area)} correction cleared`, 'درستگی ختم', 'info')
    } catch (e) {
      showToast((e as Error).message, 'ناکام', 'error')
    } finally {
      setBusy(false)
    }
  }

  const flagged = (stats || []).filter((a) => a.flagged)

  return (
    <div className="bg-background font-body-md text-on-surface antialiased min-h-screen">
      <div className="max-w-5xl mx-auto px-margin py-space-md flex flex-col gap-space-md">
        <div className="flex flex-col gap-1">
          <span className="text-secondary flex items-center gap-1 font-semibold font-telemetry-sm text-telemetry-sm">
            <span className="material-symbols-outlined text-telemetry-md">verified_user</span> AUDIT &amp; QUALITY / FAIRNESS
          </span>
          <h1 className="font-headline-md text-headline-md">Equity check by area</h1>
          <p className="font-urdu-headline text-urdu-headline text-primary-container" dir="rtl">علاقوں کے درمیان مساوات کی جانچ</p>
          <p className="font-body-sm text-body-sm text-on-surface-variant max-w-3xl">
            Areas with a phone-signal blackout send fewer reports, so they can look calmer than they are. Compare each area's report rate with the city's. A coordinator may apply a capped rank boost with a written reason. It is logged and can be undone.
          </p>
        </div>

        {!isCoordinator && <div className="rounded-xl bg-surface-container p-space-md text-on-surface-variant font-body-sm">Read-only view. Only coordinators can apply a correction. Report-rate data needs a coordinator session.</div>}
        {error && <div className="rounded-xl bg-error-container/30 text-error p-space-md font-body-sm">Could not load fairness statistics: {error}</div>}

        {flagged.length > 0 && (
          <div className="rounded-xl bg-primary-container/15 p-space-md flex items-start gap-space-sm">
            <span className="material-symbols-outlined text-primary">warning</span>
            <div className="font-body-sm">
              <strong className="text-primary">{flagged.map((a) => label(a.area)).join(', ')}</strong> {flagged.length === 1 ? 'reports' : 'report'} well below the city rate while {flagged.length === 1 ? 'its' : 'their'} households show high risk. Consider a correction below.
            </div>
          </div>
        )}

        {city && (
          <div className="grid grid-cols-2 gap-space-sm">
            <div className="rounded-xl bg-surface-container p-space-md"><div className="font-telemetry-sm text-on-surface-variant">City report rate (24h)</div><div className="font-headline-sm text-primary">{city.rate.toFixed(2)} / household</div></div>
            <div className="rounded-xl bg-surface-container p-space-md"><div className="font-telemetry-sm text-on-surface-variant">City average risk</div><div className="font-headline-sm text-primary">{city.risk.toFixed(1)}</div></div>
          </div>
        )}

        <div className="rounded-xl bg-surface-container overflow-x-auto">
          <table className="w-full text-left font-body-sm min-w-[640px]">
            <thead className="text-on-surface-variant font-telemetry-sm">
              <tr><th className="p-space-sm">Area</th><th className="p-space-sm">Open households</th><th className="p-space-sm">Tier 1</th><th className="p-space-sm">Avg risk</th>{stats && <><th className="p-space-sm">Reports 24h</th><th className="p-space-sm">vs city</th><th className="p-space-sm">Applied</th></>}{isCoordinator && stats && <th className="p-space-sm"></th>}</tr>
            </thead>
            <tbody>
              {((stats ?? local.map(() => null)) as (FairnessArea | null)[]).map((s, i) => {
                const l = local[i]
                const area = s?.area ?? l.area
                return (
                  <tr key={area} className="border-t border-surface-container-high">
                    <td className="p-space-sm font-semibold">{label(area)} {s?.flagged && <span className="ml-1 px-1.5 py-0.5 rounded bg-primary-container/30 text-primary font-telemetry-sm text-[10px]">LOW REPORTING</span>}</td>
                    <td className="p-space-sm">{s?.households ?? l.households}</td>
                    <td className="p-space-sm text-error font-semibold">{s?.tier1 ?? l.tier1}</td>
                    <td className="p-space-sm">{(s?.avg_risk ?? l.avg).toFixed(1)}</td>
                    {s && <>
                      <td className="p-space-sm">{s.reports_24h}</td>
                      <td className={`p-space-sm font-semibold ${s.flagged ? 'text-primary' : 'text-secondary'}`}>{(s.report_ratio * 100).toFixed(0)}%</td>
                      <td className="p-space-sm">{s.applied_multiplier > 1 ? `${s.applied_multiplier.toFixed(2)}x` : 'none'}</td>
                    </>}
                    {isCoordinator && s && (
                      <td className="p-space-sm whitespace-nowrap">
                        <button type="button" disabled={busy} onClick={() => setModal({ area, multiplier: Math.min(1.6, Math.max(1.05, s.suggested_multiplier || 1.2)) })} className="px-3 py-1.5 rounded-lg bg-primary text-on-primary font-bold text-body-sm disabled:opacity-50">Apply correction</button>
                        {s.applied_multiplier > 1 && <button type="button" disabled={busy} onClick={() => clear(area)} className="ml-2 px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface text-body-sm disabled:opacity-50">Clear</button>}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="font-telemetry-sm text-[11px] text-on-surface-variant">Synthetic data. The report-rate method and the 1.0 to 1.6 cap are expert assumptions for this demo, not a validated model. A human always makes and records the decision.</p>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-space-md bg-surface-dim/80 backdrop-blur-md" onClick={() => !busy && setModal(null)}>
          <div className="w-full max-w-md rounded-xl bg-surface-container-high p-space-md flex flex-col gap-space-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-headline-sm text-headline-sm">Apply correction to {label(modal.area)}</h3>
            <label className="font-telemetry-sm text-on-surface-variant">Multiplier: <strong className="text-primary">{modal.multiplier.toFixed(2)}x</strong> (max 1.60)</label>
            <input type="range" min={1.05} max={1.6} step={0.05} value={modal.multiplier} onChange={(e) => setModal({ ...modal, multiplier: Number(e.target.value) })} />
            <label className="font-telemetry-sm text-on-surface-variant">Reason for the audit log (at least 8 characters)</label>
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Cell tower down since 14:00, residents cannot report" className="w-full px-space-sm py-2 bg-surface-container rounded-lg text-on-surface focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
            <p className="font-body-sm text-on-surface-variant">This re-ranks the queue straight away. It does not dispatch anyone: you still approve each assignment.</p>
            <div className="flex justify-end gap-space-sm">
              <button type="button" disabled={busy} onClick={() => setModal(null)} className="px-space-md py-2 rounded-lg bg-surface-container text-on-surface font-semibold">Cancel</button>
              <button type="button" disabled={busy || reason.trim().length < 8} onClick={submit} className="px-space-md py-2 rounded-lg bg-primary text-on-primary font-bold disabled:opacity-50">{busy ? 'Applying...' : 'Apply and log'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
