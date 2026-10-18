import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../store'
import { recompute, withBackend } from '../lib/functions'
import LiveMap from '../components/LiveMap'

/**
 * Data quality: how much of the picture is measured and how much is inferred.
 * Everything here is computed from the live cases (no hardcoded numbers). The rule it demonstrates:
 * missing data is "unknown = high exposure, welfare check", never "safe".
 */
export default function QualityDataPage() {
  const { cases, mapAssets, mapSensors, assignments, openCaseDrawer, dispatchCase, showToast } = useStore()
  const language = useStore((s) => s.language)
  const ur = language === 'ur'

  const active = useMemo(() => cases.filter((c) => c.status !== 'safe'), [cases])
  const stats = useMemo(() => {
    const withConf = active.filter((c) => c.confidence != null)
    const avg = withConf.length ? withConf.reduce((s, c) => s + (c.confidence as number), 0) / withConf.length : 0
    const inferred = active.filter((c) => c.unknown || (c.confidence != null && c.confidence < 70))
    const unknownPending = active.filter((c) => c.unknown && (c.status === 'pending' || c.status === 'accepted'))
    return {
      total: active.length,
      inferred: inferred.length,
      inferredPct: active.length ? (inferred.length / active.length) * 100 : 0,
      avg,
      unknown: active.filter((c) => c.unknown).length,
      unreached: unknownPending.length,
    }
  }, [active])

  // Pessimistic top-20: people we are least sure about first, then by risk. Unknown is treated as high exposure.
  const top = useMemo(() => {
    const pool = active.filter((c) => c.unknown || (c.confidence != null && c.confidence < 70))
    const base = pool.length >= 5 ? pool : active
    return [...base].sort((a, b) => a.tier - b.tier || b.risk - a.risk).slice(0, 20)
  }, [active])

  const exportCsv = () => {
    const rows = [['rank', 'id', 'name', 'tier', 'risk', 'confidence', 'unknown', 'location'], ...top.map((c, i) => [String(i + 1), c.id, c.name, String(c.tier), c.risk.toFixed(1), c.confidence != null ? c.confidence.toFixed(0) : '', c.unknown ? 'yes' : 'no', c.location])]
    const csv = rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    a.download = 'pessimistic-top-20.csv'
    a.click()
    showToast('Top-20 exported', 'فہرست برآمد ہو گئی', 'success')
  }

  const recalc = () => {
    const real = withBackend(() => recompute(), (r) => {
      const x = r as { scored?: number; changed?: number }
      showToast(`Rescored ${x.scored ?? 0} cases, ${x.changed ?? 0} changed`, 'اسکورز دوبارہ شمار ہو گئے', 'success')
    })
    if (!real) showToast('Sign in with a Supabase account to recompute on the server', 'سرور پر دوبارہ شمار کے لیے سائن ان کریں', 'warning')
  }

  const kpi = (title: string, titleUr: string, value: string, sub: string, tone: 'primary' | 'secondary' | 'error') => (
    <div className={`rounded-xl bg-surface-container/70 backdrop-blur-xl p-space-md shadow-xl flex flex-col gap-space-xs ${tone === 'error' ? 'shadow-[0_0_20px_rgba(229,83,61,0.15)]' : ''}`}>
      <span className={`font-headline-sm text-body-sm flex items-center gap-1 ${tone === 'error' ? 'text-error' : 'text-on-surface-variant'}`}>
        {title}
        <span className="font-urdu-body text-telemetry-sm opacity-80">{titleUr}</span>
      </span>
      <span className={`font-telemetry-lg text-telemetry-lg ${tone === 'error' ? 'text-error' : tone === 'secondary' ? 'text-secondary' : 'text-on-surface'}`}>{value}</span>
      <span className="font-telemetry-sm text-telemetry-sm text-on-surface-variant">{sub}</span>
    </div>
  )

  const tab = 'flex items-center gap-space-xs px-space-md py-space-xs rounded-md font-headline-sm text-body-sm font-semibold transition-colors'

  return (
    <div className="bg-background font-body-md text-on-surface antialiased min-h-screen flex flex-col gap-space-lg">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-space-md bg-surface-container-low/90 backdrop-blur-xl p-space-sm rounded-xl shadow-xl">
        <div className="flex items-center gap-space-xs p-1 bg-surface-container-lowest/80 rounded-lg max-w-full overflow-x-auto">
          <span className={`${tab} bg-primary-container text-on-primary-container font-bold`}>
            <span className="material-symbols-outlined text-telemetry-md">dataset</span>
            <span>Data Quality</span>
            <span className="font-urdu-body text-telemetry-sm opacity-80">ڈیٹا معیار</span>
          </span>
          <Link to="/quality/fairness" className={`${tab} text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high`}>
            <span className="material-symbols-outlined text-telemetry-md">balance</span>
            <span>Algorithmic Fairness</span>
          </Link>
          <Link to="/quality/audit" className={`${tab} text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high`}>
            <span className="material-symbols-outlined text-telemetry-md">lock_clock</span>
            <span>Immutable Audit Log</span>
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-space-sm">
          <button type="button" onClick={exportCsv} className="flex items-center gap-space-xs px-space-md py-2.5 rounded-lg bg-surface-container-high/60 hover:bg-surface-container-highest text-on-surface font-headline-sm text-body-sm font-medium shadow-md active:scale-95 transition-all">
            <span className="material-symbols-outlined text-telemetry-md text-secondary">file_download</span>
            <span>Export Top-20 (CSV)</span>
          </button>
          <button type="button" onClick={recalc} className="flex items-center gap-space-xs px-space-lg py-2.5 rounded-lg bg-primary-container text-on-primary-container font-headline-sm text-body-sm font-bold shadow-[0_0_24px_rgba(242,169,59,0.4)] active:scale-95 transition-all">
            <span className="material-symbols-outlined text-telemetry-md">sync</span>
            <span>Recalculate Scores</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-space-md">
        {kpi('Active scored cases', 'فعال کیسز', String(stats.total), 'Everyone not yet marked safe', 'primary')}
        {kpi('Inferred scores', 'تخمینی اسکور', `${stats.inferred}`, `${stats.inferredPct.toFixed(1)}% have unknown data or confidence under 70%`, 'primary')}
        {kpi('Average confidence', 'اوسط اعتماد', stats.avg ? `${stats.avg.toFixed(1)}%` : 'n/a', 'Mean of the confidence stored on each score', 'secondary')}
        {kpi('High-exposure unknowns', 'نامعلوم انتہائی خطرہ', String(stats.unreached), `${stats.unknown} unknown in total. Treated as high exposure, never safe`, 'error')}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
        <div className="lg:col-span-7 flex flex-col gap-space-md">
          <div className="bg-surface-container/70 backdrop-blur-2xl rounded-2xl p-space-lg shadow-2xl flex flex-col gap-space-md">
            <div className="flex items-center gap-space-xs">
              <span className="material-symbols-outlined text-primary text-headline-sm">radar</span>
              <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight">Confidence map</h2>
              <span className="font-urdu-body text-telemetry-sm text-on-surface-variant">اعتمادی نقشہ</span>
            </div>
            <div className="p-space-sm rounded-xl bg-error-container/30 flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-error">report</span>
              <div className="flex flex-col">
                <span className="font-headline-sm text-body-sm font-bold text-error">Unknown = high exposure, never safe</span>
                <span className="font-urdu-body text-telemetry-sm text-error/90">نامعلوم = انتہائی خطرہ، کبھی محفوظ نہیں</span>
              </div>
            </div>
            <div className="relative w-full h-[480px] rounded-xl overflow-hidden shadow-2xl">
              <LiveMap cases={cases} assets={mapAssets} sensors={mapSensors} assignments={assignments} mode="confidence" showAssets={false} onSelectCase={openCaseDrawer} pitch={0} />
              <div className="absolute bottom-3 left-3 right-3 z-10 pointer-events-none p-space-xs rounded-lg bg-surface-container-low/90 backdrop-blur-xl flex flex-wrap items-center gap-space-md text-on-surface-variant font-telemetry-sm text-telemetry-sm shadow-lg">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-secondary"></span> 75%+ measured</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-primary"></span> 50 to 75% inferred</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-error"></span> under 50%</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border-2 border-outline"></span> Ring = unknown welfare</span>
              </div>
            </div>
            <p className="font-telemetry-sm text-telemetry-sm text-on-surface-variant">
              Weights are expert assumptions on synthetic data. They have not been validated against historical outcomes.
            </p>
          </div>
        </div>

        <div className="lg:col-span-5 flex flex-col gap-space-md">
          <div className="bg-surface-container/70 backdrop-blur-2xl rounded-2xl p-space-lg shadow-2xl flex flex-col gap-space-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-error text-headline-sm">format_list_numbered</span>
                <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight">Pessimistic Top-20</h2>
              </div>
              <span className="px-space-xs py-1 rounded bg-error-container/40 text-error font-telemetry-sm text-telemetry-sm font-bold">{top.length} listed</span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {ur ? 'وہ لوگ جن کی خیریت کا ہمیں علم نہیں، بدترین مفروضے کے ساتھ۔' : 'People we are least sure about, ranked on the worst-case assumption.'}
            </p>
            <div className="flex flex-col gap-space-sm max-h-[580px] overflow-y-auto pr-1">
              {top.length === 0 && <p className="font-body-sm text-on-surface-variant">No active cases.</p>}
              {top.map((c, i) => (
                <div key={c.id} className="p-space-md rounded-xl bg-surface-container-high/70 hover:bg-surface-container-highest transition-all flex flex-col gap-space-xs shadow-md">
                  <div className="flex items-start justify-between gap-space-sm">
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-space-xs">
                        <span className="px-1.5 py-0.5 rounded bg-error/20 text-error font-telemetry-sm text-[11px] font-bold">RANK #{String(i + 1).padStart(2, '0')}</span>
                        <h3 className="font-headline-sm text-body-lg text-on-surface font-bold truncate">{c.name}{c.age ? ` (${c.age}y)` : ''}</h3>
                      </div>
                      <span className="font-urdu-body text-telemetry-sm text-on-surface-variant">{c.nameUrdu || c.location}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="font-telemetry-lg text-telemetry-lg text-error font-extrabold leading-none">{c.risk.toFixed(1)}</span>
                      <span className="font-telemetry-sm text-[10px] text-on-surface-variant uppercase">Risk</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-space-xs bg-surface-container-lowest/60 p-space-xs rounded-lg text-on-surface-variant font-telemetry-sm text-[11px]">
                    <div>
                      <span className="text-outline">Why:</span>
                      <p className="text-on-surface font-medium">{c.unknown ? 'Unknown data: assumed high exposure' : c.vulnerability || 'Vulnerability on file'}</p>
                    </div>
                    <div>
                      <span className="text-outline">Confidence:</span>
                      <p className="text-secondary font-bold">{c.confidence != null ? `${c.confidence.toFixed(0)}%` : 'not measured'}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-space-xs pt-space-xs">
                    <span className="font-telemetry-sm text-telemetry-sm text-on-surface-variant">Tier {c.tier} / {c.location}</span>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => openCaseDrawer(c.id)} className="px-space-md py-1.5 rounded-lg bg-surface-container text-on-surface font-headline-sm text-telemetry-sm font-bold active:scale-95">Open</button>
                      <button type="button" onClick={() => { dispatchCase(c.id); showToast(`Dispatch queued for ${c.name}`, 'روانگی قطار میں', 'success') }} className="px-space-md py-1.5 rounded-lg bg-error text-on-error font-headline-sm text-telemetry-sm font-bold shadow-md active:scale-95">Dispatch</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
