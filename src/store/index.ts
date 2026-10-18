import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { INITIAL_COMMUNITY_SHELTERS, type CommunityShelter } from '../data/communityShelters'
import type { BuddyHousehold, FieldTask, MapAsset, MapSensor, OfficialShelter, Snapshot, WeatherInfo } from '../lib/db'
import * as db from '../lib/db'
import { flushOutbox, setOnline as setOutboxOnline, type OutboxRecord } from '../lib/outbox'
import { supabaseConfigured } from '../lib/supabase'

type Decision = 'accept' | 'override' | 'safe' | 'dispatch'

/**
 * Human decisions go through the `case-action` edge function when there is a real session and a connection, so the
 * server enforces the rules (an override needs a written reason) and writes the audit log with before/after state.
 * Offline, or without a Supabase session, the caller falls back to the optimistic local path + offline outbox.
 */
async function remoteDecision(action: Decision, caseId: string, extra: { reason?: string; tier?: number } = {}) {
  const [{ caseAction }, { hydrateFromSupabase }] = await Promise.all([import('../lib/functions'), import('../lib/session')])
  try {
    await caseAction(action, caseId, extra)
    await hydrateFromSupabase()
  } catch (e) {
    const msg = (e as Error).message
    useStore.getState().showToast(`Server: ${msg}`, `سرور: ${msg}`, 'error')
    await hydrateFromSupabase() // roll the optimistic change back to the server's truth
  }
}

export type Role = 'coordinator' | 'volunteer' | 'registrar' | 'shelter' | 'viewer'
export type Language = 'en' | 'ur'
export type Theme = 'light' | 'dark'

export interface User {
  name: string
  nameUrdu: string
  email: string
  phone: string
  role: Role
  roleLabel: string
}

export interface Case {
  id: string
  name: string
  nameUrdu: string
  tier: 1 | 2 | 3
  risk: number
  location: string
  locationUrdu: string
  age: number
  status: 'pending' | 'safe' | 'dispatched' | 'accepted' | 'overridden'
  vulnerability: string
  area: 'lyari' | 'malir' | 'korangi'
  unknown?: boolean
  /** Map position. Sensitive households are snapped to ~1 km; no point falls back to the area centroid. */
  lat?: number
  lng?: number
  exactLocation?: boolean
  hideExact?: boolean
  confidence?: number
  phone?: string
}

export interface Assignment {
  id: string
  caseId: string
  caseName: string
  assetId?: string
  asset: 'boat' | 'ambulance' | 'team'
  assetLabel: string
  status: 'queued' | 'approved' | 'dispatched'
  pinned: boolean
  etaMin: number
}

export interface SyncItem {
  id: string
  title: string
  description: string
  status: 'queued' | 'syncing' | 'synced'
  progress: number
  time: string
  priority: number
}

export interface AuditEntry {
  id: string
  action: string
  user: string
  caseId: string
  timestamp: string
  reason?: string
  type: 'accept' | 'override' | 'safe' | 'dispatch' | 'assign'
}

export interface TimelineEntry {
  id: string
  caseId: string
  text: string
  at: string
}

export interface ToastState {
  visible: boolean
  message: string
  messageUrdu: string
  type: 'success' | 'error' | 'warning' | 'info'
}

export interface SimState {
  boatsDown: number
  trucksDown: number
  heatwave: boolean
  meshDown: boolean
  noise: boolean
  roadClosed: boolean
  boatBroken: boolean
  rainMm: number
  ran: boolean
  comparing: boolean
}

interface AppState {
  user: User | null
  language: Language
  theme: Theme
  isOnline: boolean
  hazardCountdown: number
  showCaseDrawer: boolean
  selectedCaseId: string | null
  toast: ToastState
  cases: Case[]
  assignments: Assignment[]
  syncItems: SyncItem[]
  auditLog: AuditEntry[]
  timeline: TimelineEntry[]
  notifications: { id: string; text: string; read: boolean }[]
  alertLevel: 'advisory' | 'warning' | 'evacuation'
  intakeIndex: number
  intakeQueue: { id: string; name: string; channel: string; snippet: string; risk: number }[]
  sim: SimState
  dispatchView: 'priority' | 'asset'
  selectedRoute: 'none' | 'maternity' | 'alternate'
  showTidal: boolean
  playback: { playing: boolean; progress: number }
  registrations: { id: string; name: string; age: number; area: string; time: string }[]
  communityShelters: CommunityShelter[]
  officialShelter: OfficialShelter | null
  buddyHouseholds: BuddyHousehold[]
  fieldTasks: FieldTask[]
  mapAssets: MapAsset[]
  mapSensors: MapSensor[]
  weather: WeatherInfo | null
  authUserId: string | null
  dbReady: boolean
  resident: {
    name: string
    phone: string
    phoneType: 'smartphone' | 'basic' | 'none'
    language: Language
    flags: string[]
  }

  login: (user: User) => void
  logout: () => void
  updateUser: (partial: Partial<User>) => void
  setLanguage: (lang: Language) => void
  toggleTheme: () => void
  toggleOnline: () => void
  setOnline: (online: boolean) => void
  setSyncItems: (items: OutboxRecord[]) => void
  overrideCase: (id: string, reason: string, tier?: 1 | 2 | 3) => void
  canUseServer: () => boolean
  /** Volunteer outcomes from the field. Works offline: writes are queued in the outbox. */
  reportFieldOutcome: (caseId: string, kind: 'safe' | 'blocked' | 'backup' | 'note', notes?: string, taskId?: string) => void
  recordBuddyOutcome: (householdId: string, outcome: 'safe' | 'needs_help' | 'evacuate' | 'not_home', notes?: string) => void
  setFieldTaskStatus: (id: string, status: 'queued' | 'in_progress' | 'completed' | 'blocked', notes?: string) => void
  openCaseDrawer: (id: string) => void
  closeCaseDrawer: () => void
  showToast: (msg: string, msgUrdu: string, type: ToastState['type']) => void
  hideToast: () => void
  markCaseSafe: (id: string) => void
  dispatchCase: (id: string, asset?: 'boat' | 'ambulance' | 'team') => void
  acceptCase: (id: string) => void
  assignVolunteer: (id: string) => void
  addCase: (c: Case) => void
  advanceAlertLevel: () => void
  addAuditEntry: (entry: Omit<AuditEntry, 'id' | 'timestamp'>) => void
  addTimeline: (caseId: string, text: string) => void
  pinAssignment: (id: string) => void
  pinAllAssignments: () => void
  approveAssignment: (id: string) => void
  approveAllAssignments: () => void
  recomputeAssignments: () => void
  setDispatchView: (v: 'priority' | 'asset') => void
  setSelectedRoute: (v: 'none' | 'maternity' | 'alternate') => void
  setShowTidal: (v: boolean) => void
  setSim: (partial: Partial<SimState>) => void
  setResident: (partial: Partial<AppState['resident']>) => void
  advanceIntake: () => void
  setPlayback: (partial: Partial<AppState['playback']>) => void
  syncOutbox: () => void
  markAllNotificationsRead: () => void
  tickCountdown: () => void
  addRegistration: (r: { name: string; age: number; area: string; phone?: string }) => void
  navOpen: boolean
  setNavOpen: (open: boolean) => void
  addCommunityShelter: (s: CommunityShelter) => void
  reserveCommunitySpace: (id: string, people: number) => void
  setAlertLevel: (lv: AppState['alertLevel']) => void
  setHazardCountdown: (sec: number) => void
  seedCases: (cases: Case[]) => void
  resetDemo: () => void
  applySnapshot: (snap: Snapshot) => void
  setAuthUserId: (id: string | null) => void
}

const INITIAL_CASES: Case[] = [
  { id: 'PK-KHI-7821', name: 'Fatima Bibi', nameUrdu: 'فاطمہ بی بی', tier: 1, risk: 98.4, location: 'Lyari Sector 4-B, Gul Muhammad Lane', locationUrdu: 'لیاری سیکٹر ۴-بی، گل محمد لین', age: 78, status: 'pending', vulnerability: 'Bedridden / Respiratory Support', area: 'lyari' },
  { id: 'PK-KHI-7822', name: 'Bilal Ahmed', nameUrdu: 'بلال احمد', tier: 1, risk: 82.1, location: 'Lyari Sector 5, Mirza Adam Khan Road', locationUrdu: 'لیاری سیکٹر ۵، مرزا آدم خان روڈ', age: 65, status: 'pending', vulnerability: 'Elderly / Diabetic', area: 'lyari' },
  { id: 'PK-KHI-7823', name: 'Mrs. Tahira Khan', nameUrdu: 'طاہرہ خان', tier: 2, risk: 71.3, location: 'Korangi Sector 31, Block C', locationUrdu: 'کورنگی سیکٹر ۳۱، بلاک سی', age: 54, status: 'pending', vulnerability: 'Mobility Impaired', area: 'korangi', unknown: true },
  { id: 'PK-KHI-7824', name: 'Zubair Hassan', nameUrdu: 'زبیر حسن', tier: 2, risk: 64.0, location: 'Malir Colony, Street 7', locationUrdu: 'ملیر کالونی، گلی ۷', age: 71, status: 'pending', vulnerability: 'Visually Impaired', area: 'malir' },
]

const INITIAL_ASSIGNMENTS: Assignment[] = [
  { id: 'asg-1', caseId: 'PK-KHI-7821', caseName: 'Fatima Bibi', asset: 'boat', assetLabel: 'Inflatable Heavy Boat 04', status: 'queued', pinned: false, etaMin: 12 },
  { id: 'asg-2', caseId: 'PK-KHI-7822', caseName: 'Bilal Ahmed', asset: 'ambulance', assetLabel: 'Edhi 4x4 Amb #12', status: 'queued', pinned: false, etaMin: 18 },
  { id: 'asg-3', caseId: 'PK-KHI-7823', caseName: 'Mrs. Tahira Khan', asset: 'team', assetLabel: 'Scout Squad D-2', status: 'queued', pinned: false, etaMin: 24 },
  { id: 'asg-4', caseId: 'PK-KHI-7824', caseName: 'Zubair Hassan', asset: 'boat', assetLabel: 'Rescue Inflatable 07', status: 'queued', pinned: false, etaMin: 21 },
  { id: 'asg-5', caseId: 'PK-KHI-7825', caseName: 'Khurram Javed', asset: 'team', assetLabel: 'Scout Squad E-1', status: 'queued', pinned: false, etaMin: 32 },
]



const INITIAL_AUDIT: AuditEntry[] = [
  { id: 'a1', action: 'Case accepted for dispatch', user: 'Zara Khan', caseId: 'PK-KHI-7820', timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(), type: 'accept' },
  { id: 'a2', action: 'Override: Deprioritised due to resource constraints', user: 'Zara Khan', caseId: 'PK-KHI-7819', timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(), reason: 'All boats deployed to Tier 1 emergencies', type: 'override' },
]

const INITIAL_INTAKE = [
  { id: 'in-1', name: 'Malir Nadi pul doob gaya hai, 4 bachay chat par...', channel: 'WhatsApp', snippet: 'Boat needed, 4 children on rooftop', risk: 96.8 },
  { id: 'in-2', name: 'Korangi Sector 2: Dialysis patient water entered 2 feet...', channel: 'Mesh Voice', snippet: 'Dialysis patient, water in house', risk: 91.2 },
  { id: 'in-3', name: 'Keamari: Boat required for pregnant lady in labor...', channel: '1129 PDMA', snippet: 'Pregnant lady in labor, boat needed', risk: 99.1 },
  { id: 'in-4', name: 'Gulshan block 13: Solar power backup working, need food packs', channel: 'SMS Cell-Mesh', snippet: 'Needs food, power OK', risk: 48.0 },
]

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: null,
      language: 'en',
      theme: 'dark',
      isOnline: true,
      hazardCountdown: 13330,
      showCaseDrawer: false,
      selectedCaseId: null,
      toast: { visible: false, message: '', messageUrdu: '', type: 'info' },
      cases: INITIAL_CASES,
      assignments: INITIAL_ASSIGNMENTS,
      syncItems: [],
      auditLog: INITIAL_AUDIT,
      timeline: [],
      notifications: [
        { id: 'n1', text: 'Tier 1 alert: Fatima Bibi – no response 2h 45m', read: false },
        { id: 'n2', text: 'Water level +2.1m at Lyari Nadi sensor LK-91', read: false },
        { id: 'n3', text: 'Boat Unit 04 dispatched to Sector 4-B', read: false },
      ],
      alertLevel: 'warning',
      intakeIndex: 0,
      intakeQueue: INITIAL_INTAKE,
      sim: { boatsDown: 3, trucksDown: 1, heatwave: true, meshDown: true, noise: true, roadClosed: false, boatBroken: false, rainMm: 140, ran: false, comparing: false },
      dispatchView: 'priority',
      selectedRoute: 'none',
      showTidal: false,
      playback: { playing: false, progress: 0 },
      registrations: [],
      communityShelters: INITIAL_COMMUNITY_SHELTERS,
      officialShelter: null,
      buddyHouseholds: [],
      fieldTasks: [],
      mapAssets: [],
      mapSensors: [],
      weather: null,
      authUserId: null,
      dbReady: false,
      navOpen: false,
      setNavOpen: (open) => set({ navOpen: open }),
      resident: { name: 'Rashid Ali', phone: '+92 300 8492011', phoneType: 'basic', language: 'ur', flags: ['Elderly household'] },

      login: (user) => set({ user: { ...user, phone: user.phone || user.email } }),
      logout: () => {
        void db.signOut()
        set({ user: null, authUserId: null })
      },
      updateUser: (partial) => {
        set((s) => ({ user: s.user ? { ...s.user, ...partial } : null }))
        const id = get().authUserId
        if (id) {
          const patch: Record<string, unknown> = {}
          if (partial.name) patch.name = partial.name
          if (partial.nameUrdu) patch.name_urdu = partial.nameUrdu
          if (partial.phone) patch.phone = partial.phone
          if (partial.roleLabel) patch.role_label = partial.roleLabel
          void db.updateProfile(id, patch)
        }
      },
      setLanguage: (lang) => {
        set({ language: lang })
        document.documentElement.setAttribute('dir', lang === 'ur' ? 'rtl' : 'ltr')
        document.documentElement.setAttribute('lang', lang === 'ur' ? 'ur' : 'en')
      },
      toggleTheme: () => {
        const nt = get().theme === 'dark' ? 'light' : 'dark'
        set({ theme: nt })
        document.documentElement.classList.remove('light', 'dark')
        document.documentElement.classList.add(nt)
      },
      toggleOnline: () => get().setOnline(!get().isOnline),
      setOnline: (online) => {
        set({ isOnline: online })
        setOutboxOnline(online)
      },
      setSyncItems: (items) => {
        const toItem = (r: OutboxRecord): SyncItem => ({
          id: r.id,
          title: r.title,
          description: r.description || '',
          status: r.status,
          progress: r.status === 'synced' ? 100 : r.status === 'syncing' ? 60 : 0,
          time: new Date(r.createdAt).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }) + ' PKT',
          priority: r.priority ?? 3,
        })
        const live = items
          .filter((r) => r.status !== 'synced')
          .sort((a, b) => (a.priority ?? 3) - (b.priority ?? 3) || a.createdAt.localeCompare(b.createdAt))
        const done = items.filter((r) => r.status === 'synced').reverse()
        set({ syncItems: [...live, ...done].map(toItem) })
      },
      overrideCase: (id, reason, tier) => {
        const s = get()
        const c = s.cases.find((x) => x.id === id)
        const newTier = tier ?? c?.tier ?? 2
        set({
          cases: s.cases.map((x) => (x.id === id ? { ...x, status: 'overridden' as const, tier: newTier } : x)),
          auditLog: [
            { id: `a${Date.now()}`, action: `Override: ${c?.name || id} set to Tier ${newTier}`, user: s.user?.name || 'Coordinator', caseId: id, timestamp: new Date().toISOString(), reason, type: 'override' as const },
            ...s.auditLog,
          ],
        })
        if (s.canUseServer()) {
          void remoteDecision('override', id, { reason, tier: newTier })
          return
        }
        // Offline: queue the plain writes. The audit row is insert-only and carries the required reason.
        void db.updateCase(id, { status: 'overridden', tier: newTier })
        void db.insertAudit({ action: `Override: ${c?.name || id} set to Tier ${newTier}`, user: s.user?.name || 'Coordinator', caseId: id, type: 'override', reason, role: s.user?.role })
      },
      reportFieldOutcome: (caseId, kind, notes, taskId) => {
        const s = get()
        const c = s.cases.find((x) => x.id === caseId)
        const who = s.user?.name || 'Volunteer'
        const name = c?.name || caseId
        const note = notes?.trim()
        const text =
          kind === 'safe' ? `Reached ${name}: found safe${note ? ` (${note})` : ''}`
          : kind === 'blocked' ? `Could not reach ${name}${note ? `: ${note}` : ''}`
          : kind === 'backup' ? `BACKUP requested for ${name}${note ? `: ${note}` : ''}`
          : `Field note on ${name}: ${note || ''}`
        const auditType = kind === 'safe' ? 'safe' : 'assign'

        get().addTimeline(caseId, `${text} (${who})`)
        // "safe" is audited by markCaseSafe below (server or local), so only the other outcomes are logged here.
        if (kind !== 'safe') get().addAuditEntry({ action: text, user: who, caseId, type: auditType, reason: note })
        if (taskId) {
          get().setFieldTaskStatus(taskId, kind === 'safe' ? 'completed' : kind === 'note' ? 'in_progress' : 'blocked', note)
        }
        if (kind === 'safe') {
          get().markCaseSafe(caseId)
        } else if (kind === 'backup') {
          // Raise to Tier 1 locally and tell the command centre. The next recompute keeps it honest.
          set((st) => ({ cases: st.cases.map((x) => (x.id === caseId ? { ...x, tier: 1 as const } : x)) }))
          void db.updateCase(caseId, { tier: 1 })
        }
        if (kind === 'blocked' || kind === 'backup') {
          void db.insertNotification({
            audience_role: 'coordinator', type: kind === 'backup' ? 'backup' : 'blocked', related_case_id: caseId,
            text: `${who}: ${text}`, text_urdu: `${who}: ${text}`,
          })
        }
      },
      recordBuddyOutcome: (householdId, outcome, notes) => {
        const s = get()
        const h = s.buddyHouseholds.find((x) => x.id === householdId)
        set({ buddyHouseholds: s.buddyHouseholds.map((x) => (x.id === householdId ? { ...x, outcome } : x)) })
        void db.updateBuddyHousehold(householdId, { last_outcome: outcome, ...(notes ? { notes } : {}) })
        void db.insertBuddyCheckin({ household_id: householdId, outcome, notes })
        if (outcome === 'needs_help' || outcome === 'evacuate') {
          void db.insertNotification({
            audience_role: 'coordinator', type: 'buddy',
            text: `Buddy check-in: ${h?.name || householdId} ${outcome === 'evacuate' ? 'must evacuate' : 'needs help'}`,
            text_urdu: `Buddy check-in: ${h?.nameUrdu || h?.name || householdId}`,
          })
        }
        get().addAuditEntry({ action: `Buddy check-in: ${h?.name || householdId} ${outcome}`, user: s.user?.name || 'Volunteer', caseId: '', type: 'assign', reason: notes })
      },
      setFieldTaskStatus: (id, status, notes) => {
        set((s) => ({ fieldTasks: s.fieldTasks.map((t) => (t.id === id ? { ...t, status } : t)) }))
        void db.updateFieldTask(id, { status, ...(notes ? { notes } : {}) })
      },
      openCaseDrawer: (id) => set({ showCaseDrawer: true, selectedCaseId: id }),
      closeCaseDrawer: () => set({ showCaseDrawer: false, selectedCaseId: null }),
      showToast: (msg, msgUrdu, type) => {
        set({ toast: { visible: true, message: msg, messageUrdu: msgUrdu, type } })
        setTimeout(() => get().hideToast(), 2800)
      },
      hideToast: () => set((s) => ({ toast: { ...s.toast, visible: false } })),
      canUseServer: () => supabaseConfigured && !!get().authUserId && get().isOnline,
      markCaseSafe: (id) => {
        const s = get()
        const c = s.cases.find((x) => x.id === id)
        const action = `${c?.name || id} marked safe`
        set({
          cases: s.cases.map((x) => (x.id === id ? { ...x, status: 'safe' as const } : x)),
          auditLog: [{ id: `a${Date.now()}`, action, user: s.user?.name || 'System', caseId: id, timestamp: new Date().toISOString(), type: 'safe' as const }, ...s.auditLog],
        })
        if (s.canUseServer()) {
          void remoteDecision('safe', id) // the server writes the audit row itself
          return
        }
        void db.updateCase(id, { status: 'safe' })
        void db.insertAudit({ action, user: s.user?.name || 'System', caseId: id, type: 'safe', role: s.user?.role })
      },
      dispatchCase: (id, asset) => {
        const s = get()
        const c = s.cases.find((x) => x.id === id)
        const newAssignment: Assignment = { id: `asg-${Date.now()}`, caseId: id, caseName: c?.name || id, asset: asset || 'boat', assetLabel: asset === 'ambulance' ? 'Ambulance' : asset === 'team' ? 'Scout Team' : 'Boat Unit', status: 'dispatched', pinned: false, etaMin: Math.floor(Math.random() * 15 + 8) }
        if (s.canUseServer()) {
          // The optimizer already proposed an asset for this case: approve and dispatch exactly that one.
          set({ cases: s.cases.map((x) => (x.id === id ? { ...x, status: 'dispatched' as const } : x)) })
          void remoteDecision('dispatch', id)
          return
        }
        set({
          cases: s.cases.map((x) => (x.id === id ? { ...x, status: 'dispatched' as const } : x)),
          assignments: [newAssignment, ...s.assignments],
          auditLog: [{ id: `a${Date.now()}`, action: 'Case dispatched for rescue', user: s.user?.name || 'System', caseId: id, timestamp: new Date().toISOString(), type: 'dispatch' as const }, ...s.auditLog],
          timeline: [{ id: `t${Date.now()}`, caseId: id, text: 'Rescue team dispatched', at: new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }) }, ...s.timeline],
        })
        void db.updateCase(id, { status: 'dispatched' })
        void db.insertAssignment(newAssignment)
        void db.insertAudit({ action: 'Case dispatched for rescue', user: s.user?.name || 'System', caseId: id, type: 'dispatch', role: s.user?.role })
        void db.insertTimeline(id, 'Rescue team dispatched', s.authUserId || undefined)
      },
      acceptCase: (id) => {
        const s = get()
        set({
          cases: s.cases.map((c) => (c.id === id ? { ...c, status: 'accepted' as const } : c)),
          auditLog: [{ id: `a${Date.now()}`, action: 'Recommendation accepted', user: s.user?.name || 'System', caseId: id, timestamp: new Date().toISOString(), type: 'accept' as const }, ...s.auditLog],
        })
        if (s.canUseServer()) {
          void remoteDecision('accept', id)
          return
        }
        void db.updateCase(id, { status: 'accepted' })
        void db.insertAudit({ action: 'Recommendation accepted', user: s.user?.name || 'System', caseId: id, type: 'accept', role: s.user?.role })
      },
      assignVolunteer: (id) => {
        const s = get()
        set({
          auditLog: [{ id: `a${Date.now()}`, action: 'Volunteer assigned to case', user: s.user?.name || 'System', caseId: id, timestamp: new Date().toISOString(), type: 'assign' as const }, ...s.auditLog],
          timeline: [{ id: `t${Date.now()}`, caseId: id, text: 'Volunteer assigned (Squad 04)', at: new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }) }, ...s.timeline],
        })
        void db.insertAudit({ action: 'Volunteer assigned to case', user: s.user?.name || 'System', caseId: id, type: 'assign', role: s.user?.role })
        void db.insertTimeline(id, 'Volunteer assigned (Squad 04)', s.authUserId || undefined)
      },
      addCase: (c) => {
        set((s) => ({ cases: [c, ...s.cases] }))
        void db.insertCase(c)
      },
      advanceAlertLevel: () => {
        const lv: AppState['alertLevel'][] = ['advisory', 'warning', 'evacuation']
        const next = lv[Math.min(lv.indexOf(get().alertLevel) + 1, 2)]
        set({ alertLevel: next })
        void db.setConfig('alert_level', next)
      },
      addAuditEntry: (entry) => {
        const row = { ...entry, id: `a${Date.now()}`, timestamp: new Date().toISOString() }
        set((s) => ({ auditLog: [row, ...s.auditLog] }))
        void db.insertAudit({ action: entry.action, user: entry.user, caseId: entry.caseId, type: entry.type, reason: entry.reason, role: get().user?.role })
      },
      addTimeline: (caseId, text) => {
        set((s) => ({ timeline: [{ id: `t${Date.now()}`, caseId, text, at: new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }) }, ...s.timeline] }))
        void db.insertTimeline(caseId, text, get().authUserId || undefined)
      },
      pinAssignment: (id) => {
        const cur = get().assignments.find((a) => a.id === id)
        set((s) => ({ assignments: s.assignments.map((a) => a.id === id ? { ...a, pinned: !a.pinned } : a) }))
        void db.updateAssignment(id, { pinned: !cur?.pinned })
      },
      pinAllAssignments: () => {
        set((s) => ({ assignments: s.assignments.map((a) => ({ ...a, pinned: true })) }))
        get().assignments.forEach((a) => void db.updateAssignment(a.id, { pinned: true }))
      },
      approveAssignment: (id) => {
        set((s) => ({ assignments: s.assignments.map((a) => a.id === id ? { ...a, status: 'approved' as const } : a) }))
        void db.updateAssignment(id, { status: 'approved', approved_at: new Date().toISOString() })
      },
      approveAllAssignments: () => {
        set((s) => ({ assignments: s.assignments.map((a) => ({ ...a, status: 'approved' as const })) }))
        get().assignments.forEach((a) => void db.updateAssignment(a.id, { status: 'approved' }))
      },
      recomputeAssignments: () => {
        const next = [...get().assignments].sort((a, b) => Math.random() - 0.5).map((a) => ({ ...a, etaMin: Math.floor(Math.random() * 20 + 5) }))
        set({ assignments: next })
        next.forEach((a) => void db.updateAssignment(a.id, { eta_minutes: a.etaMin }))
      },
      setDispatchView: (v) => set({ dispatchView: v }),
      setSelectedRoute: (v) => set({ selectedRoute: v }),
      setShowTidal: (v) => set({ showTidal: v }),
      setSim: (partial) => {
        const sim = { ...get().sim, ...partial }
        set({ sim })
        void db.setConfig('simulation_state', sim)
      },
      setResident: (partial) => {
        const resident = { ...get().resident, ...partial }
        set({ resident })
        void db.setConfig('resident_sim', resident)
      },
      advanceIntake: () => {
        const s = get()
        const cur = s.intakeQueue[s.intakeIndex]
        if (cur) void db.markIntakeProcessed(cur.id)
        set({ intakeIndex: Math.min(s.intakeIndex + 1, s.intakeQueue.length - 1) })
      },
      setPlayback: (partial) => set((s) => ({ playback: { ...s.playback, ...partial } })),
      syncOutbox: () => {
        // Replays the real IndexedDB outbox. While offline nothing is sent and the items stay queued.
        void flushOutbox()
      },
      markAllNotificationsRead: () => {
        set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) }))
        void db.markNotificationsRead()
      },
      tickCountdown: () => set((s) => ({ hazardCountdown: Math.max(0, s.hazardCountdown - 1) })),
      addRegistration: (r) => {
        const row = { id: `reg-${Date.now()}`, ...r, time: new Date().toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }) }
        set((s) => ({ registrations: [row, ...s.registrations] }))
        const registrarId = get().authUserId || undefined
        const save = (lat?: number, lng?: number) => void db.insertRegistration({ ...r, registrarId, lat, lng })
        // GPS works without mobile data. If it is denied or slow, the registration is still saved, just without a point.
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition((p) => save(p.coords.latitude, p.coords.longitude), () => save(), { timeout: 4000, maximumAge: 60_000 })
        } else save()
      },
      addCommunityShelter: (sh) => {
        set((s) => ({ communityShelters: [sh, ...s.communityShelters] }))
        void db.insertShelter(sh, get().authUserId || undefined)
      },
      reserveCommunitySpace: (id, people) => {
        const cur = get().communityShelters.find((x) => x.id === id)
        set((s) => ({
          communityShelters: s.communityShelters.map((x) => (x.id === id ? { ...x, free: Math.max(0, x.free - people) } : x)),
        }))
        void db.reserveShelter(id, people, cur?.capacity ?? people, cur?.free ?? people)
      },
      setAlertLevel: (lv) => {
        set({ alertLevel: lv })
        void db.setConfig('alert_level', lv)
      },
      setHazardCountdown: (sec) => {
        set({ hazardCountdown: sec })
        void db.setConfig('hazard_countdown_seconds', sec)
      },
      seedCases: (cs) => {
        set((s) => ({ cases: [...cs.filter((c) => !s.cases.some((x) => x.id === c.id)), ...s.cases] }))
        cs.forEach((c) => void db.insertCase(c))
      },
      resetDemo: () => {
        void db.fetchSnapshot().then((snap) => {
          if (snap) get().applySnapshot(snap)
        })
      },
      setAuthUserId: (id) => set({ authUserId: id }),
      applySnapshot: (snap) => {
        const sim = snap.sim as Partial<SimState> | null
        set({
          cases: snap.cases,
          assignments: snap.assignments,
          auditLog: snap.auditLog,
          timeline: snap.timeline,
          notifications: snap.notifications,
          intakeQueue: snap.intakeQueue,
          registrations: snap.registrations,
          communityShelters: snap.communityShelters.length ? snap.communityShelters : get().communityShelters,
          officialShelter: snap.officialShelter,
          buddyHouseholds: snap.buddyHouseholds,
          fieldTasks: snap.fieldTasks,
          mapAssets: snap.mapAssets,
          mapSensors: snap.mapSensors,
          weather: snap.weather,
          alertLevel: snap.alertLevel,
          hazardCountdown: snap.hazardCountdown,
          sim: sim ? { ...get().sim, ...sim } : get().sim,
          resident: snap.resident || get().resident,
          dbReady: true,
        })
      },
    }),
    {
      name: 'nlb-app-state',
      // Cache the last snapshot so a volunteer can reload the app with no connection and keep working.
      partialize: (s) => ({
        language: s.language, theme: s.theme,
        user: s.user, authUserId: s.authUserId,
        cases: s.cases, assignments: s.assignments, fieldTasks: s.fieldTasks, buddyHouseholds: s.buddyHouseholds,
        timeline: s.timeline, mapAssets: s.mapAssets, mapSensors: s.mapSensors, weather: s.weather,
        officialShelter: s.officialShelter, communityShelters: s.communityShelters,
        alertLevel: s.alertLevel, hazardCountdown: s.hazardCountdown,
      }),
    }
  )
)
