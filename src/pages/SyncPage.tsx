import { useEffect, useState } from 'react'
import { useStore } from '../store'
import LiveBoard from '../components/LiveBoard'

export default function SyncPage() {
  const items = useStore((s) => s.syncItems)
  const isOnline = useStore((s) => s.isOnline)
  const toggleOnline = useStore((s) => s.toggleOnline)
  const syncOutbox = useStore((s) => s.syncOutbox)
  const [storage, setStorage] = useState<{ usedMb: number; quotaMb: number } | null>(null)

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => {
      if (e.usage != null && e.quota) setStorage({ usedMb: e.usage / 1048576, quotaMb: e.quota / 1048576 })
    })
  }, [items.length])

  const queued = items.filter((i) => i.status === 'queued').length
  const syncing = items.filter((i) => i.status === 'syncing').length
  const synced = items.filter((i) => i.status === 'synced')
  const pending = items.filter((i) => i.status !== 'synced')
  const lastSync = synced[0]?.time
  const pct = storage ? Math.min(100, (storage.usedMb / storage.quotaMb) * 100) : 0

  return (
    <div className="bg-surface text-on-surface font-body-md text-body-md antialiased min-h-screen">
      <div className="flex flex-col w-full">
        <div className="px-margin pt-space-sm"><LiveBoard variant="sync" /></div>

        <div className="px-margin pt-space-sm pb-space-xs">
          <div className={`relative overflow-hidden rounded-xl bg-surface-container-high p-space-md ${isOnline ? '' : 'shadow-[0_0_28px_rgba(242,169,59,0.22)]'}`}>
            <div className="flex items-start gap-space-sm relative z-10">
              <div className={`flex items-center justify-center w-10 h-10 rounded-lg shrink-0 ${isOnline ? 'bg-secondary-container text-on-secondary' : 'bg-primary-container text-on-primary'}`}>
                <span className="material-symbols-outlined text-[24px]">{isOnline ? 'wifi' : 'wifi_off'}</span>
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className={`font-telemetry-sm text-telemetry-sm font-bold tracking-wider uppercase flex items-center gap-1.5 ${isOnline ? 'text-secondary' : 'text-primary'}`}>
                  <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-secondary' : 'bg-primary animate-ping'}`}></span>
                  {isOnline ? 'Online' : 'Offline mode active'}
                </span>
                <p className="font-urdu-body text-[14px] text-on-surface leading-snug mt-0.5" dir="rtl">
                  {isOnline ? 'انٹرنیٹ دستیاب ہے' : 'انٹرنیٹ بند ہے، آف لائن موڈ فعال ہے'}
                </p>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                  {isOnline ? 'Updates are sent straight away.' : 'Everything you record is stored on this phone and sent automatically when the connection returns.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-margin py-space-xs">
          <div className="rounded-xl bg-surface-container p-space-md shadow-lg">
            <div className="flex items-start justify-between gap-space-sm mb-space-sm">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <h2 className="font-headline-sm text-headline-sm text-on-surface tracking-tight">Offline outbox</h2>
                  <span className="px-2 py-0.5 rounded-full bg-primary-container text-on-primary font-telemetry-sm text-[11px] font-bold">{pending.length} pending</span>
                </div>
                <span className="font-urdu-headline text-[15px] text-primary leading-none mt-0.5" dir="rtl">آؤٹ باکس</span>
              </div>
            </div>
            <div className="rounded-lg bg-surface-container-low p-2.5 mb-space-md grid grid-cols-3 gap-2 text-center font-telemetry-sm text-telemetry-sm">
              <div><div className="text-primary font-bold text-[18px]">{queued}</div><div className="text-on-surface-variant">Queued</div></div>
              <div><div className="text-secondary font-bold text-[18px]">{syncing}</div><div className="text-on-surface-variant">Sending</div></div>
              <div><div className="text-on-surface font-bold text-[18px]">{synced.length}</div><div className="text-on-surface-variant">Sent</div></div>
            </div>
            <div className="flex items-center justify-between text-on-surface-variant font-telemetry-sm text-[11px] mb-space-sm">
              <span>Last successful sync</span>
              <span className="text-on-surface font-semibold">{lastSync || 'none yet'}</span>
            </div>
            <button id="manualSyncBtn" type="button" onClick={syncOutbox} disabled={!isOnline || pending.length === 0} className="w-full rounded-xl bg-primary-container text-on-primary py-3.5 px-space-md font-headline-sm text-headline-sm flex items-center justify-center gap-space-sm shadow-[0_4px_0_#9e6400,0_10px_20px_rgba(242,169,59,0.35)] active:translate-y-1 transition-all select-none disabled:opacity-50 disabled:shadow-none">
              <span className={`material-symbols-outlined text-[24px] ${syncing ? 'animate-spin' : ''}`}>sync</span>
              <span className="font-bold tracking-tight">Sync now</span>
              <span className="font-urdu-body text-[14px] font-semibold leading-none">اب سنک کریں</span>
            </button>
            {!isOnline && <p className="mt-2 text-center font-telemetry-sm text-[11px] text-on-surface-variant">Offline: nothing can be sent until you reconnect.</p>}
            <button type="button" onClick={toggleOnline} className="mt-2.5 w-full min-h-[40px] rounded-lg bg-surface-container-highest text-on-surface-variant font-telemetry-sm text-[12px] active:scale-[0.98]">
              {isOnline ? 'Simulate network loss (demo)' : 'Restore connection (demo)'}
            </button>
          </div>
        </div>

        <div className="px-margin pt-space-sm pb-space-xs">
          <div className="flex items-center gap-2 mb-space-sm">
            <span className="material-symbols-outlined text-primary text-[20px]">queue_play_next</span>
            <h3 className="font-headline-sm text-headline-sm text-on-surface">Transmission queue</h3>
          </div>
          <div className="space-y-space-sm">
            {items.length === 0 && <div className="rounded-xl bg-surface-container p-space-md text-on-surface-variant text-center">Nothing queued. Every update has been sent.</div>}
            {items.map((i) => {
              const done = i.status === 'synced'
              return (
                <div key={i.id} className={`rounded-xl p-space-md shadow-md ${done ? 'bg-surface-container-low/70 opacity-85' : 'bg-surface-container'}`}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      {done ? <span className="material-symbols-outlined text-secondary text-[18px]">verified</span> : <span className={`w-2 h-2 rounded-full shrink-0 ${i.status === 'syncing' ? 'bg-secondary animate-ping' : 'bg-primary-container'}`}></span>}
                      <span className={`font-headline-sm text-[15px] text-on-surface truncate ${done ? 'line-through opacity-70' : ''}`}>{i.title}</span>
                    </div>
                    <span className={`shrink-0 px-2.5 py-0.5 rounded-full font-telemetry-sm text-[11px] font-bold ${done ? 'bg-secondary-container/20 text-secondary' : i.status === 'syncing' ? 'bg-secondary-container/30 text-secondary' : 'bg-primary/20 text-primary'}`}>
                      {done ? 'SENT / مکمل' : i.status === 'syncing' ? 'SENDING' : 'QUEUED / انتظار'}
                    </span>
                  </div>
                  {i.description && <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">{i.description}</p>}
                  <div className="mt-2 flex items-center justify-between text-on-surface-variant font-telemetry-sm text-[11px]">
                    <span>Priority {i.priority}</span>
                    <span>{done ? 'sent' : 'saved'} {i.time}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="px-margin pt-space-xs pb-space-lg">
          <div className="rounded-xl bg-surface-container-high p-space-md shadow-md space-y-space-sm">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[20px]">hard_drive</span>
              <h4 className="font-headline-sm text-[16px] text-on-surface">Storage on this device</h4>
            </div>
            {storage ? (
              <div>
                <div className="flex items-center justify-between text-body-sm text-on-surface mb-1">
                  <span>{storage.usedMb.toFixed(1)} MB used of {Math.round(storage.quotaMb)} MB available</span>
                  <span className="font-telemetry-sm text-primary font-bold">{pct.toFixed(1)}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-surface-container-lowest overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${Math.max(pct, 1)}%` }}></div></div>
              </div>
            ) : <p className="text-body-sm text-on-surface-variant">Storage information is not available in this browser.</p>}
            <p className="font-body-sm text-[12px] text-on-surface-variant leading-snug">Holds the app, map tiles you have viewed, your assigned households and the outbox, so the app reloads and works with no signal.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
