import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { useFieldQueue, mapsLink, type FieldRow } from '../lib/fieldQueue'
import { useGps, walkMinutes } from '../lib/useGps'
import { haversineKm, formatKm } from '../lib/geo'

const clock = (total: number) => {
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

const tierChip = (tier: 1 | 2 | 3) =>
  tier === 1 ? 'bg-error-container/30 text-error' : tier === 2 ? 'bg-primary-container/20 text-primary' : 'bg-secondary-container/20 text-secondary'
const tierLabel = (tier: 1 | 2 | 3) => (tier === 1 ? 'Tier 1 Critical' : tier === 2 ? 'Tier 2 Urgent' : 'Tier 3 Monitor')

export default function FieldTasksPage() {
  const nav = useNavigate()
  const user = useStore((s) => s.user)
  const isOnline = useStore((s) => s.isOnline)
  const toggleOnline = useStore((s) => s.toggleOnline)
  const hazard = useStore((s) => s.hazardCountdown)
  const alertLevel = useStore((s) => s.alertLevel)
  const queued = useStore((s) => s.syncItems.filter((i) => i.status !== 'synced').length)
  const setFieldTaskStatus = useStore((s) => s.setFieldTaskStatus)
  const { list, done, remaining } = useFieldQueue()
  const { gps, error } = useGps()

  const distance = (r: FieldRow) => (gps && r.c.lat != null && r.c.lng != null ? haversineKm([gps.lng, gps.lat], [r.c.lng, r.c.lat]) : null)
  const hero = list[0]
  const rest = list.slice(1)
  const heroKm = hero ? distance(hero) : null

  const start = (r: FieldRow) => {
    if (r.task) setFieldTaskStatus(r.task.id, 'in_progress')
    nav(`/field/task/${r.c.id}`)
  }

  return (
    <div className="bg-surface text-on-surface font-body-md text-body-md antialiased min-h-screen">
      <div className="flex flex-col w-full px-margin space-y-space-md">
        {/* Identity + real connection state */}
        <section className="flex flex-col gap-space-sm">
          <div className="flex items-center justify-between gap-space-sm bg-surface-container-high/70 backdrop-blur-md rounded-xl p-3 shadow-md">
            <div className="flex flex-col min-w-0">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <h2 className="font-headline-sm text-headline-sm text-on-surface truncate leading-tight">Salam, {user?.name?.split(' ')[0] || 'Volunteer'}</h2>
                <span className="font-urdu-headline text-[15px] text-primary truncate leading-none">{user?.nameUrdu}</span>
              </div>
              <span className="font-telemetry-sm text-telemetry-sm text-on-surface-variant">{user?.roleLabel}</span>
            </div>
            <button
              type="button"
              onClick={toggleOnline}
              title="Tap to simulate a network outage. Updates are saved on this phone and sent when you reconnect."
              className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full active:scale-95 transition-all min-h-[44px] ${isOnline ? 'bg-secondary-container/20 text-secondary' : 'bg-primary-container/25 text-primary'}`}
            >
              <span className={`w-2 h-2 rounded-full animate-pulse ${isOnline ? 'bg-secondary' : 'bg-primary'}`}></span>
              <div className="flex flex-col items-start leading-none">
                <span className="font-telemetry-sm text-[11px] font-bold">{isOnline ? 'Online' : 'Offline mode'}</span>
                <span className="font-telemetry-sm text-[10px] opacity-90">{queued ? `${queued} update${queued === 1 ? '' : 's'} waiting` : isOnline ? 'All synced' : 'Saving locally'}</span>
              </div>
              <span className="material-symbols-outlined text-[16px] ml-0.5">{isOnline ? 'wifi' : 'wifi_off'}</span>
            </button>
          </div>
          <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-surface-container-low text-on-surface-variant font-telemetry-sm text-telemetry-sm shadow-sm">
            <div className="flex items-center gap-1">
              <span className="material-symbols-outlined text-primary text-[15px]">fmd_good</span>
              <span>{gps ? `GPS \u00b1${gps.accuracy} m` : error ? 'GPS off' : 'Finding GPS...'}</span>
            </div>
            <div className="flex items-center gap-1 text-secondary">
              <span className="material-symbols-outlined text-[14px]">timer</span>
              <span>Impact in {clock(hazard)}</span>
            </div>
            <span className="uppercase font-bold text-primary">{alertLevel}</span>
          </div>
        </section>

        {/* Next task */}
        {!hero ? (
          <section className="rounded-2xl p-space-lg bg-surface-container/80 text-center flex flex-col items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-[40px]">task_alt</span>
            <h3 className="font-headline-sm text-headline-sm">No open tasks</h3>
            <p className="font-body-sm text-on-surface-variant">When the coordinator assigns you a household it appears here, even if you are offline.</p>
          </section>
        ) : (
          <section className="relative w-full rounded-2xl p-space-md bg-surface-container/80 backdrop-blur-xl shadow-[0_12px_32px_rgba(0,0,0,0.55),0_0_28px_rgba(242,169,59,0.22)] overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-primary-container to-secondary opacity-80"></div>
            <div className="relative flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${tierChip(hero.c.tier)}`}>
                  <span className="w-2 h-2 rounded-full bg-current animate-ping"></span>
                  <span className="font-telemetry-sm text-telemetry-sm font-bold tracking-wide uppercase">{tierLabel(hero.c.tier)}</span>
                </div>
                <div className="px-2.5 py-1 rounded-full bg-surface-container-lowest text-primary font-telemetry-sm text-telemetry-sm">
                  {heroKm != null ? `${formatKm(heroKm)} / ~${walkMinutes(heroKm)} min` : hero.task?.etaMinutes ? `ETA ${hero.task.etaMinutes} min` : 'Distance: waiting for GPS'}
                </div>
              </div>
              <div className="flex items-start justify-between gap-2 pt-1">
                <div className="flex flex-col">
                  <div className="flex items-baseline gap-2">
                    <h3 className="font-headline-md text-headline-md text-on-surface font-bold tracking-tight">{hero.c.name}</h3>
                    {hero.c.age > 0 && <span className="font-telemetry-md text-telemetry-md text-secondary font-bold">{hero.c.age} yrs</span>}
                  </div>
                  {hero.c.nameUrdu && <p className="font-urdu-headline text-[18px] text-primary/95 leading-snug">{hero.c.nameUrdu}</p>}
                </div>
                <span className="material-symbols-outlined text-primary text-[28px]">crisis_alert</span>
              </div>
              <div className="flex items-start gap-2 text-on-surface-variant">
                <span className="material-symbols-outlined text-primary text-[18px] shrink-0 mt-0.5">location_on</span>
                <div className="flex flex-col text-body-sm font-body-sm">
                  <span className="text-on-surface font-medium leading-snug">{hero.c.location}</span>
                  {hero.c.locationUrdu && <span className="font-urdu-body text-xs">{hero.c.locationUrdu}</span>}
                </div>
              </div>
              {(hero.c.vulnerability || hero.c.unknown) && (
                <div className="flex items-start gap-2 p-2.5 rounded-xl bg-surface-container-lowest/70 text-on-surface">
                  <span className="material-symbols-outlined text-tertiary text-[20px] shrink-0">medical_services</span>
                  <span className="font-body-sm text-body-sm font-semibold text-tertiary">{hero.c.unknown ? 'No data on file: treat as high exposure, check welfare. ' : ''}{hero.c.vulnerability}</span>
                </div>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => start(hero)} className="flex-1 min-h-[54px] px-space-md py-3 rounded-xl bg-primary-container text-on-primary font-headline-sm text-headline-sm font-bold flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(242,169,59,0.45)] active:scale-[0.98] transition-all">
                  <span className="material-symbols-outlined text-[24px]">play_arrow</span>
                  <span>Start task</span>
                  <span className="font-urdu-body text-sm leading-none">ٹاسک شروع کریں</span>
                </button>
                {mapsLink(hero.c) && (
                  <a href={mapsLink(hero.c)} target="_blank" rel="noreferrer" className="min-h-[54px] px-4 rounded-xl bg-surface-container-highest text-primary flex items-center justify-center active:scale-95" title="Open turn-by-turn navigation">
                    <span className="material-symbols-outlined text-[26px]">navigation</span>
                  </a>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Upcoming */}
        {rest.length > 0 && (
          <section className="flex flex-col gap-space-sm pt-1">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">format_list_bulleted</span>
                <h4 className="font-headline-sm text-[18px] text-on-surface">Upcoming priority queue</h4>
              </div>
              <span className="font-telemetry-sm text-telemetry-sm text-primary font-bold">{rest.length} queued</span>
            </div>
            {rest.map((r) => {
              const km = distance(r)
              return (
                <button key={r.c.id} type="button" onClick={() => nav(`/field/task/${r.c.id}`)} className="text-left flex flex-col p-3 rounded-xl bg-surface-container-high/60 backdrop-blur-md shadow-sm active:scale-[0.99] transition-all">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex flex-col min-w-0">
                      <span className="font-body-lg text-body-lg font-bold text-on-surface truncate">{r.c.name}</span>
                      <span className="font-telemetry-sm text-[11px] text-on-surface-variant truncate">{r.c.location}</span>
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full font-telemetry-sm text-[10px] font-bold uppercase ${tierChip(r.c.tier)}`}>{tierLabel(r.c.tier)}</span>
                  </div>
                  <div className="flex items-center justify-between bg-surface-container-lowest/40 rounded-lg px-2.5 py-1.5 font-telemetry-sm text-telemetry-sm text-on-surface-variant">
                    <span className="truncate">{r.c.vulnerability || (r.c.unknown ? 'Unknown welfare' : 'Welfare check')}</span>
                    <span className="text-primary font-bold shrink-0 ml-2">{km != null ? formatKm(km) : r.task?.etaMinutes ? `ETA ${r.task.etaMinutes}m` : ''}</span>
                  </div>
                </button>
              )
            })}
          </section>
        )}

        {/* Shift summary (real counts) */}
        <section className="w-full pb-2">
          <div className="flex items-center justify-around px-4 py-2.5 rounded-xl bg-surface-container-lowest/90 backdrop-blur-lg shadow-lg">
            <div className="flex items-center gap-1"><span className="font-telemetry-md text-telemetry-md font-bold text-secondary">{done}</span><span className="font-body-sm text-body-sm text-on-surface-variant">Done</span></div>
            <div className="w-px h-6 bg-surface-variant"></div>
            <div className="flex items-center gap-1"><span className="font-telemetry-md text-telemetry-md font-bold text-primary">{remaining}</span><span className="font-body-sm text-body-sm text-on-surface-variant">Remaining</span></div>
            <div className="w-px h-6 bg-surface-variant"></div>
            <div className="flex items-center gap-1"><span className="font-telemetry-md text-telemetry-md font-bold text-on-surface">{queued}</span><span className="font-body-sm text-body-sm text-on-surface-variant">Unsynced</span></div>
          </div>
        </section>
      </div>
    </div>
  )
}
