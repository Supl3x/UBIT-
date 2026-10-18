import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store'
import { useFieldQueue, mapsLink } from '../lib/fieldQueue'
import { useGps, walkMinutes } from '../lib/useGps'
import { formatKm, haversineKm } from '../lib/geo'
import LiveMap from '../components/LiveMap'

/**
 * One household, from the volunteer's side. Every button writes through the offline outbox, so it works with no signal
 * and is sent when the phone reconnects. Nothing here is hardcoded to a particular person.
 */
export default function TaskDetailPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { list } = useFieldQueue()
  const cases = useStore((s) => s.cases)
  const fieldTasks = useStore((s) => s.fieldTasks)
  const timeline = useStore((s) => s.timeline)
  const isOnline = useStore((s) => s.isOnline)
  const reportFieldOutcome = useStore((s) => s.reportFieldOutcome)
  const showToast = useStore((s) => s.showToast)
  const { gps } = useGps()
  const [notes, setNotes] = useState('')

  // :id is a case id (or a field task id). Fall back to the top of the work list.
  const c = useMemo(() => {
    const byCase = cases.find((x) => x.id === id)
    if (byCase) return byCase
    const t = fieldTasks.find((x) => x.id === id)
    if (t) return cases.find((x) => x.id === t.caseId)
    return list[0]?.c
  }, [cases, fieldTasks, id, list])
  const task = c ? fieldTasks.find((t) => t.caseId === c.id && t.status !== 'completed') : undefined
  const events = c ? timeline.filter((t) => t.caseId === c.id).slice(0, 6) : []

  if (!c) {
    return (
      <div className="px-margin py-space-xl text-center flex flex-col items-center gap-2">
        <span className="material-symbols-outlined text-secondary text-[40px]">task_alt</span>
        <h2 className="font-headline-sm text-headline-sm text-on-surface">Nothing selected</h2>
        <Link to="/field/tasks" className="px-4 py-2 rounded-lg bg-primary-container text-on-primary font-bold">Back to tasks</Link>
      </div>
    )
  }

  const km = gps && c.lat != null && c.lng != null ? haversineKm([gps.lng, gps.lat], [c.lng, c.lat]) : null
  const tierText = c.tier === 1 ? 'Tier 1 Critical' : c.tier === 2 ? 'Tier 2 Urgent' : 'Tier 3 Monitor'
  const tierClass = c.tier === 1 ? 'bg-error-container text-on-error-container' : c.tier === 2 ? 'bg-primary-container/30 text-primary' : 'bg-secondary-container/30 text-secondary'

  const report = (kind: 'safe' | 'blocked' | 'backup' | 'note') => {
    if (kind === 'note' && !notes.trim()) return showToast('Write a note first', 'پہلے نوٹ لکھیں', 'warning')
    reportFieldOutcome(c.id, kind, notes, task?.id)
    const where = isOnline ? 'Sent' : 'Saved on this phone, will sync when online'
    const msg = kind === 'safe' ? 'Marked safe' : kind === 'blocked' ? 'Reported: cannot reach' : kind === 'backup' ? 'Backup requested' : 'Note saved'
    showToast(`${msg}. ${where}.`, kind === 'safe' ? 'محفوظ درج ہو گیا' : 'درج ہو گیا', kind === 'backup' ? 'error' : kind === 'blocked' ? 'warning' : 'success')
    setNotes('')
    if (kind === 'safe') nav('/field/tasks')
  }

  const btn = 'relative flex items-center justify-between w-full min-h-[56px] px-space-md py-2.5 rounded-xl font-headline-sm text-headline-sm transition-transform active:scale-[0.98] shadow-lg'

  return (
    <div className="bg-surface text-on-surface font-body-md text-body-md antialiased min-h-screen">
      <div className="flex flex-col w-full px-margin pb-space-xl gap-space-md">
        <div className="rounded-xl bg-surface-container-high/90 backdrop-blur-xl p-space-md shadow-xl">
          <div className="flex items-start justify-between gap-space-sm mb-space-sm">
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5 text-on-surface-variant font-telemetry-sm text-telemetry-sm">
                <span className="material-symbols-outlined text-primary text-[15px]">tag</span>
                <span className="tracking-wide">{c.id}</span>
                <span className="opacity-40">/</span>
                <span className="truncate text-on-surface">{c.location}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <h2 className="font-headline-md text-headline-md text-on-surface tracking-tight truncate">{c.name}</h2>
                {c.nameUrdu && <span className="font-urdu-headline text-urdu-headline text-primary leading-none" dir="rtl">{c.nameUrdu}</span>}
              </div>
            </div>
            <div className={`shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full ${tierClass}`}>
              <span className="w-2 h-2 rounded-full bg-current"></span>
              <span className="font-telemetry-sm text-[10px] uppercase font-bold tracking-wider leading-none">{tierText}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-space-xs pt-space-xs">
            {c.age > 0 && <span className="px-2.5 py-1 rounded-lg bg-surface-container-lowest/80 font-body-sm text-body-sm font-medium">{c.age} years</span>}
            {c.vulnerability && <span className="px-2.5 py-1 rounded-lg bg-surface-container-lowest/80 font-body-sm text-body-sm">{c.vulnerability}</span>}
            {c.unknown && <span className="px-2.5 py-1 rounded-lg bg-error-container/30 text-error font-body-sm text-body-sm font-semibold">Unknown welfare: check in person</span>}
            <span className="px-2.5 py-1 rounded-lg bg-surface-container-lowest/80 font-telemetry-sm text-telemetry-sm text-secondary font-bold">Risk {c.risk.toFixed(0)}</span>
          </div>
        </div>

        {/* Real map with your GPS position and the route line */}
        <div className="overflow-hidden rounded-xl bg-surface-container-low shadow-xl">
          <div className="relative w-full h-60">
            <LiveMap cases={[c]} focusCaseId={c.id} routeFrom={gps ? [gps.lng, gps.lat] : null} showAssets={false} pitch={0} />
          </div>
          <div className="p-space-sm bg-surface-container-high flex items-center justify-between text-on-surface">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-primary text-[18px]">straighten</span>
              <span className="font-telemetry-md text-telemetry-md font-bold text-primary">{km != null ? formatKm(km) : '--'}</span>
              <span className="text-on-surface-variant text-xs">{km != null ? `~${walkMinutes(km)} min on foot` : 'waiting for GPS'}</span>
            </div>
            {mapsLink(c) && (
              <a href={mapsLink(c)} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-container-highest text-primary font-telemetry-sm text-[12px] font-bold">
                <span className="material-symbols-outlined text-[16px]">navigation</span> Navigate
              </a>
            )}
          </div>
          {!c.exactLocation && <p className="px-space-sm pb-space-sm font-telemetry-sm text-[11px] text-on-surface-variant">Approximate position: no exact point is on file for this household. Ask the neighbours.</p>}
        </div>

        {/* Call */}
        {c.phone ? (
          <a href={`tel:${c.phone.replace(/\s/g, '')}`} className="flex items-center justify-between w-full min-h-[52px] px-space-md py-space-sm rounded-xl bg-secondary-container text-on-secondary-container font-headline-sm shadow-[0_4px_20px_rgba(29,162,144,0.35)] active:scale-[0.98] transition-all">
            <div className="flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-[24px]">call</span>
              <div className="flex flex-col text-left">
                <span className="font-telemetry-md text-telemetry-md font-bold">{c.phone}</span>
                <span className="font-body-sm text-[12px] opacity-90">Call {c.name.split(' ')[0]}</span>
              </div>
            </div>
            <span className="material-symbols-outlined">chevron_right</span>
          </a>
        ) : (
          <div className="rounded-xl bg-surface-container-low px-space-md py-space-sm font-body-sm text-on-surface-variant flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]">phone_disabled</span> No phone on file. Reach this household in person.
          </div>
        )}

        {/* Recent events for this case */}
        {events.length > 0 && (
          <div className="rounded-xl bg-surface-container p-space-md shadow-lg flex flex-col gap-1.5">
            <span className="font-headline-sm text-body-md text-on-surface">Recent activity</span>
            {events.map((e) => (
              <div key={e.id} className="flex gap-2 font-body-sm text-on-surface-variant"><span className="font-telemetry-sm text-primary shrink-0">{e.at}</span><span>{e.text}</span></div>
            ))}
          </div>
        )}

        {/* One-tap outcomes */}
        <div className="flex flex-col gap-space-sm">
          <span className="font-telemetry-sm text-telemetry-sm text-on-surface-variant uppercase tracking-wider font-semibold px-1">Immediate field action</span>
          <button type="button" onClick={() => report('safe')} className={`${btn} bg-secondary-container text-on-secondary-container`}>
            <div className="flex items-center gap-space-sm"><span className="material-symbols-outlined text-[26px]">check_circle</span><div className="flex flex-col items-start"><span className="font-bold text-[16px] leading-tight">Reached and found safe</span><span className="text-[12px] opacity-80">Closes this task and the case</span></div></div>
            <span className="font-urdu-headline text-[15px]" dir="rtl">پہنچ گئے، محفوظ</span>
          </button>
          <button type="button" onClick={() => report('blocked')} className={`${btn} bg-primary-container text-on-primary-container`}>
            <div className="flex items-center gap-space-sm"><span className="material-symbols-outlined text-[26px]">warning</span><div className="flex flex-col items-start"><span className="font-bold text-[16px] leading-tight">Cannot reach / blocked</span><span className="text-[12px] opacity-85">Tells the command centre</span></div></div>
            <span className="font-urdu-headline text-[15px]" dir="rtl">راستہ بند ہے</span>
          </button>
          <button type="button" onClick={() => report('backup')} className={`${btn} bg-error text-on-error`}>
            <div className="flex items-center gap-space-sm"><span className="material-symbols-outlined text-[26px] animate-pulse">emergency_share</span><div className="flex flex-col items-start"><span className="font-bold text-[16px] leading-tight">Need immediate backup</span><span className="text-[12px] opacity-85">Raises this case to Tier 1</span></div></div>
            <span className="font-urdu-headline text-[15px]" dir="rtl">فوری مدد درکار</span>
          </button>
        </div>

        <div className="rounded-xl bg-surface-container-high/70 p-space-md shadow-lg flex flex-col gap-space-sm">
          <label htmlFor="field-notes" className="font-headline-sm text-headline-sm text-on-surface">Field notes</label>
          <textarea id="field-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Water height, stretcher needed, who is at home..." className="w-full rounded-xl bg-surface-container-lowest px-space-md py-space-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none resize-none" />
          <button type="button" onClick={() => report('note')} className="flex items-center justify-center gap-2 min-h-[48px] w-full rounded-xl bg-primary-container text-on-primary font-headline-sm font-bold active:scale-[0.98]">
            <span className="material-symbols-outlined">{isOnline ? 'cloud_upload' : 'save'}</span>
            <span>{isOnline ? 'Submit note' : 'Save on phone (sends later)'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
