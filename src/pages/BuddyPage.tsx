import { useState } from 'react'
import { useStore } from '../store'
import LiveBoard from '../components/LiveBoard'

type Outcome = 'safe' | 'needs_help' | 'evacuate' | 'not_home'

const OUTCOMES: { key: Outcome; en: string; ur: string; active: string }[] = [
  { key: 'safe', en: 'Safe', ur: 'محفوظ', active: 'bg-secondary-container text-on-secondary-container' },
  { key: 'needs_help', en: 'Needs help', ur: 'مدد درکار', active: 'bg-error-container text-on-error-container' },
  { key: 'evacuate', en: 'Evacuate', ur: 'محفوظ مقام پر منتقل', active: 'bg-error text-on-error' },
  { key: 'not_home', en: 'No answer', ur: 'جواب نہیں', active: 'bg-surface-container-highest text-on-surface' },
]

export default function BuddyPage() {
  const households = useStore((s) => s.buddyHouseholds)
  const recordBuddyOutcome = useStore((s) => s.recordBuddyOutcome)
  const addRegistration = useStore((s) => s.addRegistration)
  const showToast = useStore((s) => s.showToast)
  const isOnline = useStore((s) => s.isOnline)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', age: '', area: 'lyari', phone: '' })

  const checked = households.filter((h) => OUTCOMES.some((o) => o.key === h.outcome)).length
  const remaining = households.length - checked
  const pct = households.length ? (checked / households.length) * 100 : 0

  const mark = (id: string, name: string, outcome: Outcome) => {
    recordBuddyOutcome(id, outcome)
    showToast(`${name}: ${OUTCOMES.find((o) => o.key === outcome)!.en}${isOnline ? '' : ' (saved offline)'}`, 'درج ہو گیا', outcome === 'safe' ? 'success' : 'warning')
  }

  const save = () => {
    if (!form.name.trim()) return showToast('Enter a name', 'نام درج کریں', 'warning')
    addRegistration({ name: form.name.trim(), age: Number(form.age) || 0, area: form.area, phone: form.phone.trim() || undefined })
    showToast('Resident registered. Verification queued.', 'اندراج ہو گیا', 'success')
    setForm({ name: '', age: '', area: 'lyari', phone: '' })
    setOpen(false)
  }

  const field = 'w-full min-h-[44px] px-3 rounded-lg bg-surface-container-lowest text-on-surface focus:outline-none focus:ring-1 focus:ring-primary placeholder-on-surface-variant/40'

  return (
    <div className="bg-surface text-on-surface font-body-md text-body-md antialiased min-h-screen">
      <div className="flex flex-col w-full px-margin space-y-space-md">
        <LiveBoard variant="buddy" />
        <div className="relative overflow-hidden rounded-xl bg-surface-container-high p-space-md shadow-xl">
          <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full bg-primary/10 blur-2xl pointer-events-none"></div>
          <div className="relative flex flex-col space-y-space-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-primary text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>roofing</span>
                <span className="font-telemetry-sm text-telemetry-sm text-primary uppercase tracking-wider">No-phone grid</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-lowest text-secondary font-telemetry-sm text-telemetry-sm">
                <span className="w-2 h-2 rounded-full bg-secondary animate-pulse"></span>
                <span>{checked} / {households.length} checked</span>
              </div>
            </div>
            <div className="flex flex-col space-y-1">
              <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface tracking-tight">Community buddy check-ins</h2>
              <p className="font-urdu-headline text-urdu-headline text-primary-container leading-none">محلہ بڈی سسٹم</p>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Residents with no phone, unregistered elders, or no signal. Physically verify each neighbour before the water arrives. Results are saved on this phone and sent when you are back online.
            </p>
            <div className="pt-1 flex flex-col space-y-1.5">
              <div className="flex items-center justify-between font-telemetry-sm text-telemetry-sm">
                <span>{checked} of {households.length} checked, {remaining} remaining</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-surface-container-lowest overflow-hidden flex p-0.5">
                <div className="h-full rounded-full bg-gradient-to-r from-secondary to-primary transition-all duration-500" style={{ width: `${pct}%` }}></div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col space-y-space-md">
          {households.length === 0 && (
            <div className="rounded-xl bg-surface-container p-space-md text-center text-on-surface-variant">No buddy households assigned yet. Use "Register new resident" below to add one.</div>
          )}
          {households.map((h) => (
            <div key={h.id} id={`resident-${h.id}`} className="rounded-xl bg-surface-container p-space-md shadow-lg flex flex-col space-y-space-sm">
              <div className="flex items-start justify-between gap-space-xs">
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-headline-sm text-headline-sm text-on-surface font-bold leading-tight">{h.name}</span>
                    {h.nameUrdu && <span className="font-urdu-body text-urdu-body text-primary leading-tight">{h.nameUrdu}</span>}
                  </div>
                  {h.flags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {h.flags.map((f) => <span key={f} className="px-2 py-0.5 rounded-full bg-surface-container-highest text-tertiary font-telemetry-sm text-[11px]">{f}</span>)}
                    </div>
                  )}
                </div>
              </div>
              <div className="p-space-sm rounded-lg bg-surface-container-low flex flex-col space-y-1">
                <div className="flex items-start gap-1.5 text-on-surface">
                  <span className="material-symbols-outlined text-primary text-[18px] shrink-0 mt-0.5">pin_drop</span>
                  <span className="font-body-sm text-body-sm font-medium">{h.location}</span>
                </div>
                {h.notes && <p className="font-body-sm text-body-sm text-on-surface-variant pl-6">{h.notes}</p>}
              </div>
              <div className="flex flex-col space-y-1.5 pt-1">
                <span className="font-telemetry-sm text-telemetry-sm text-on-surface-variant uppercase tracking-wider">Doorstep status / تصدیق نتیجہ</span>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-surface-container-lowest">
                  {OUTCOMES.map((o) => {
                    const on = h.outcome === o.key
                    return (
                      <button key={o.key} type="button" onClick={() => mark(h.id, h.name, o.key)} aria-pressed={on} className={`min-h-[44px] px-2 py-1.5 rounded-lg flex flex-col items-center justify-center text-center transition-all active:scale-95 ${on ? `${o.active} shadow-md font-bold` : 'text-on-surface-variant hover:text-on-surface'}`}>
                        <span className="font-body-sm text-body-sm">{o.en}</span>
                        <span className="font-urdu-body text-[11px] leading-tight">{o.ur}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="pt-2 pb-4">
          <button type="button" onClick={() => setOpen(true)} className="w-full min-h-[52px] px-space-md py-3 rounded-xl bg-primary-container text-on-primary-container font-headline-sm text-headline-sm font-bold flex items-center justify-between shadow-[0_4px_20px_rgba(242,169,59,0.35)] active:scale-[0.98] transition-transform">
            <div className="flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-[22px]">person_add</span>
              <span className="tracking-tight">Register new resident</span>
            </div>
            <span className="font-urdu-body text-urdu-body leading-none">نیا شہری درج کریں</span>
          </button>
        </div>

        {open && (
          <div className="fixed inset-0 z-50 bg-surface-container-lowest/80 backdrop-blur-md flex flex-col justify-end" onClick={() => setOpen(false)}>
            <div className="relative w-full rounded-t-2xl bg-surface-container-high p-space-md flex flex-col space-y-space-md shadow-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">Add unconnected neighbour</h3>
                  <span className="font-urdu-body text-xs text-primary leading-tight">بغیر فون کے پڑوسی کا اندراج</span>
                </div>
                <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="min-w-[40px] min-h-[40px] rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant"><span className="material-symbols-outlined text-[20px]">close</span></button>
              </div>
              <input className={field} placeholder="Full name, e.g. Mai Jannat Bibi" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <div className="grid grid-cols-2 gap-space-sm">
                <input className={field} type="number" inputMode="numeric" placeholder="Approx age" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
                <select className={field} value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}>
                  <option value="lyari">Lyari</option><option value="malir">Malir</option><option value="korangi">Korangi</option>
                </select>
              </div>
              <input className={field} type="tel" placeholder="Contact person (shopkeeper / imam) +92 300 0000000" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <button type="button" onClick={save} className="min-h-[48px] rounded-xl bg-primary-container text-on-primary-container font-headline-sm text-headline-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98]">
                <span className="material-symbols-outlined text-[20px]">save</span><span>Save and queue verification</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
