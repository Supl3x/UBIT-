import type { Amenity, CommunityShelter, HostType } from '../data/communityShelters'
import type {
  Assignment,
  AuditEntry,
  Case,
  Language,
  Role,
  SyncItem,
  TimelineEntry,
  User,
} from '../store'
import { supabase, supabaseConfigured } from './supabase'
import { AREA_CENTER, parsePoint, snapCoarse } from './geo'
import { write } from './outbox'

export type MapAsset = { id: string; name: string; type: 'boat' | 'ambulance' | 'team'; available: boolean; lat: number; lng: number }
export type MapSensor = { id: string; name: string; metric: string; reading: number; lat: number; lng: number }
export type WeatherInfo = {
  source: string
  fetchedAt: string | null
  rain24h: number | null
  peakHourly: number | null
  maxTempC: number | null
  etaAt: string | null
  mode: string
}

export type IntakeItem = { id: string; name: string; channel: string; snippet: string; risk: number }
export type RegistrationItem = { id: string; name: string; age: number; area: string; time: string }
export type NotifItem = { id: string; text: string; read: boolean }
export type OfficialShelter = {
  id: string
  name: string
  nameUrdu: string
  area: string
  capacity: number
  occupied: number
  free: number
  bedsCapacity: number
  bedsOccupied: number
  womenCapacity: number
  womenOccupied: number
  medicalCapacity: number
  medicalOccupied: number
  oxygenUnits: number
  elevationM: number
  zone: string
  facilityStatus: string
  phone: string
}
export type BuddyHousehold = {
  id: string
  name: string
  nameUrdu: string
  location: string
  locationUrdu: string
  notes: string
  outcome: string
  flags: string[]
}
export type FieldTask = {
  id: string
  caseId: string
  title: string
  status: string
  etaMinutes: number
}

const KARACHI: Case['area'][] = ['lyari', 'malir', 'korangi']

function areaOf(v: string | null | undefined): Case['area'] {
  if (v === 'lyari' || v === 'malir' || v === 'korangi') return v
  return 'lyari'
}

function relativeTime(iso: string | null | undefined): { en: string; ur: string } {
  if (!iso) return { en: 'just now', ur: 'ابھی' }
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return { en: 'just now', ur: 'ابھی' }
  if (mins < 60) return { en: `${mins} min ago`, ur: `${mins} منٹ پہلے` }
  const h = Math.round(mins / 60)
  return { en: `${h} h ago`, ur: `${h} گھنٹے پہلے` }
}

export function mapCase(row: Record<string, unknown>, role?: Role): Case {
  const tier = Number(row.tier)
  const status = String(row.status || 'pending') as Case['status']
  const ok: Case['status'][] = ['pending', 'safe', 'dispatched', 'accepted', 'overridden']
  return {
    id: String(row.id),
    name: String(row.name),
    nameUrdu: String(row.name_urdu || ''),
    tier: (tier === 1 || tier === 2 || tier === 3 ? tier : 3) as 1 | 2 | 3,
    risk: Number(row.risk || 0),
    location: String(row.location_text || ''),
    locationUrdu: String(row.location_text_urdu || ''),
    age: Number(row.age || 0),
    status: ok.includes(status) ? status : 'pending',
    vulnerability: String(row.vulnerability || ''),
    area: areaOf(row.area as string),
    unknown: Boolean(row.unknown_data),
    ...caseGeo(row, role),
    confidence: row.confidence_score == null ? undefined : Number(row.confidence_score),
    hideExact: Boolean(row.hide_exact_location),
    phone: row.phone ? String(row.phone) : undefined,
  }
}

/** lat/lng for the map. Falls back to the area centroid when there is no point; sensitive households are snapped to ~1 km. */
function caseGeo(row: Record<string, unknown>, role?: Role): { lat: number; lng: number; exactLocation: boolean } {
  const pt = parsePoint(row.location)
  if (!pt) {
    const c = AREA_CENTER[String(row.area || 'other')] || AREA_CENTER.other
    return { lng: c[0], lat: c[1], exactLocation: false }
  }
  // Only coordinators, and volunteers (whom RLS limits to their own assigned cases), may see a sensitive doorstep.
  const hide = Boolean(row.hide_exact_location) && role !== 'coordinator' && role !== 'volunteer'
  const [lng, lat] = hide ? snapCoarse(pt) : pt
  return { lng, lat, exactLocation: !hide }
}

export function mapAssignment(row: Record<string, unknown>): Assignment {
  const st = String(row.status || 'queued') as Assignment['status']
  const ok: Assignment['status'][] = ['queued', 'approved', 'dispatched']
  const asset = String(row.asset || 'boat') as Assignment['asset']
  return {
    id: String(row.id),
    caseId: String(row.case_id),
    caseName: String(row.case_name || ''),
    assetId: row.asset_id ? String(row.asset_id) : undefined,
    asset: asset === 'ambulance' || asset === 'team' ? asset : 'boat',
    assetLabel: String(row.asset_label || ''),
    status: ok.includes(st) ? st : 'queued',
    pinned: Boolean(row.pinned),
    etaMin: Number(row.eta_minutes || 0),
  }
}

export function mapShelter(row: Record<string, unknown>): CommunityShelter {
  const t = String(row.type || 'home') as HostType
  const rel = relativeTime(row.updated_at as string)
  const amenities = Array.isArray(row.amenities) ? (row.amenities as Amenity[]) : []
  return {
    id: String(row.id),
    name: String(row.name),
    nameUrdu: String(row.name_urdu || ''),
    host: String(row.host || ''),
    hostUrdu: String(row.host_urdu || ''),
    type: (['mosque', 'school', 'home', 'hall', 'madrassa'] as HostType[]).includes(t) ? t : 'home',
    area: String(row.area || ''),
    areaUrdu: String(row.area_urdu || ''),
    capacity: Number(row.capacity || 0),
    free: Number(row.free ?? 0),
    distanceKm: 0.8,
    amenities,
    verified: Boolean(row.verified),
    phone: String(row.phone || ''),
    updated: rel.en,
    updatedUrdu: rel.ur,
    note: String(row.note || ''),
    noteUrdu: String(row.note_urdu || ''),
  }
}

export function mapOfficial(row: Record<string, unknown>): OfficialShelter {
  return {
    id: String(row.id),
    name: String(row.name),
    nameUrdu: String(row.name_urdu || ''),
    area: String(row.area || ''),
    capacity: Number(row.capacity || 0),
    occupied: Number(row.occupied || 0),
    free: Number(row.free || 0),
    bedsCapacity: Number(row.beds_capacity || 0),
    bedsOccupied: Number(row.beds_occupied || 0),
    womenCapacity: Number(row.women_capacity || 0),
    womenOccupied: Number(row.women_occupied || 0),
    medicalCapacity: Number(row.medical_capacity || 0),
    medicalOccupied: Number(row.medical_occupied || 0),
    oxygenUnits: Number(row.oxygen_units || 0),
    elevationM: Number(row.elevation_m || 0),
    zone: String(row.zone || ''),
    facilityStatus: String(row.facility_status || 'active'),
    phone: String(row.phone || ''),
  }
}

export function mapProfile(row: Record<string, unknown>): User {
  return {
    name: String(row.name || ''),
    nameUrdu: String(row.name_urdu || ''),
    email: String(row.email || ''),
    phone: String(row.phone || ''),
    role: (row.role as Role) || 'viewer',
    roleLabel: String(row.role_label || row.role || 'Viewer'),
  }
}

export type Snapshot = {
  cases: Case[]
  assignments: Assignment[]
  mapAssets: MapAsset[]
  mapSensors: MapSensor[]
  weather: WeatherInfo | null
  auditLog: AuditEntry[]
  timeline: TimelineEntry[]
  notifications: NotifItem[]
  intakeQueue: IntakeItem[]
  registrations: RegistrationItem[]
  communityShelters: CommunityShelter[]
  officialShelter: OfficialShelter | null
  buddyHouseholds: BuddyHousehold[]
  fieldTasks: FieldTask[]
  alertLevel: 'advisory' | 'warning' | 'evacuation'
  hazardCountdown: number
  sim: Record<string, unknown> | null
  resident: {
    name: string
    phone: string
    phoneType: 'smartphone' | 'basic' | 'none'
    language: Language
    flags: string[]
  } | null
}

const DEPOTS: [number, number][] = [
  [66.9792, 24.8105], // Keamari port
  [67.0011, 24.8607], // Lyari staging
  [67.1204, 24.8376], // Korangi
  [67.1950, 24.8930], // Malir
]

/** Deterministic staging point for an asset that has no GPS fix yet, so the map never stacks everything in one spot. */
function depotFor(id: string): [number, number] {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return DEPOTS[h % DEPOTS.length]
}

function mapWeather(raw: unknown): WeatherInfo | null {
  if (!raw || typeof raw !== 'object') return null
  const h = raw as Record<string, unknown>
  const num = (v: unknown) => (v == null || Number.isNaN(Number(v)) ? null : Number(v))
  return {
    source: String(h.source || 'unknown'),
    fetchedAt: h.fetched_at ? String(h.fetched_at) : null,
    rain24h: num(h.rain_24h_mm),
    peakHourly: num(h.peak_hourly_mm),
    maxTempC: num(h.max_temp_c),
    etaAt: h.eta_at ? String(h.eta_at) : null,
    mode: String(h.mode || 'flood'),
  }
}

export async function fetchProfile(userId: string): Promise<User | null> {
  if (!supabaseConfigured) return null
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error || !data) return null
  return mapProfile(data as Record<string, unknown>)
}

export async function fetchSnapshot(): Promise<Snapshot | null> {
  if (!supabaseConfigured) return null

  // Viewers only ever see the anonymised, aggregated view (names, phones, exact locations are stripped in SQL).
  const { data: sess } = await supabase.auth.getSession()
  const me = sess.session?.user.id ? await fetchProfile(sess.session.user.id) : null
  const casesTable = me?.role === 'viewer' ? 'cases_anonymised' : 'cases'

  const [
    casesRes,
    asgRes,
    assetRes,
    sensorRes,
    auditRes,
    tlRes,
    notifRes,
    intakeRes,
    regRes,
    shelterRes,
    buddyRes,
    taskRes,
    cfgRes,
  ] = await Promise.all([
    supabase.from(casesTable).select('*').order('tier', { ascending: true }).order('risk', { ascending: false }),
    supabase.from('assignments').select('*').order('created_at', { ascending: false }),
    supabase.from('assets').select('id, name, type, available, current_location'),
    supabase.from('hazard_sensors').select('id, name, metric, reading, location'),
    supabase.from('audit_log').select('*').order('timestamp', { ascending: false }).limit(80),
    supabase.from('timeline').select('*').order('created_at', { ascending: false }).limit(80),
    supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(40),
    supabase.from('intake_queue').select('*').order('risk', { ascending: false }),
    supabase.from('registrations').select('*').order('created_at', { ascending: false }).limit(40),
    supabase.from('shelters').select('*').order('kind').order('name'),
    supabase.from('buddy_households').select('*'),
    supabase.from('field_tasks').select('*').order('sort_order'),
    supabase.from('system_config').select('*'),
  ])

  // A failed read (offline, expired session) must never replace the cached snapshot with an empty one.
  if (casesRes.error || cfgRes.error) return null

  const cfg: Record<string, unknown> = {}
  for (const row of cfgRes.data || []) {
    const r = row as { key: string; value: unknown }
    cfg[r.key] = r.value
  }

  const shelterRows = (shelterRes.data || []) as Record<string, unknown>[]
  const community = shelterRows.filter((s) => s.kind === 'community').map(mapShelter)
  const officialRow = shelterRows.find((s) => s.id === 'sh-khi-04' || s.kind === 'official')

  const alert = cfg.alert_level
  const alertLevel = (typeof alert === 'string' ? alert.replace(/"/g, '') : 'warning') as Snapshot['alertLevel']

  const residentRaw = cfg.resident_sim as Record<string, unknown> | undefined
  const sim = (cfg.simulation_state as Record<string, unknown>) || null

  return {
    cases: (casesRes.data || []).map((r) => mapCase(r as Record<string, unknown>, me?.role)),
    assignments: (asgRes.data || []).map((r) => mapAssignment(r as Record<string, unknown>)),
    mapAssets: (assetRes.data || []).map((r) => {
      const row = r as Record<string, unknown>
      const pt = parsePoint(row.current_location) || depotFor(String(row.id))
      const type = String(row.type)
      return {
        id: String(row.id),
        name: String(row.name),
        type: type === 'ambulance' || type === 'team' ? type : 'boat',
        available: row.available !== false,
        lng: pt[0],
        lat: pt[1],
      } as MapAsset
    }),
    mapSensors: (sensorRes.data || []).flatMap((r) => {
      const row = r as Record<string, unknown>
      const pt = parsePoint(row.location)
      if (!pt) return []
      return [{ id: String(row.id), name: String(row.name), metric: String(row.metric || ''), reading: Number(row.reading || 0), lng: pt[0], lat: pt[1] } as MapSensor]
    }),
    weather: mapWeather(cfg.hazard_state),
    auditLog: (auditRes.data || []).map((r) => {
      const row = r as Record<string, unknown>
      const type = String(row.action_type || 'assign') as AuditEntry['type']
      const ok: AuditEntry['type'][] = ['accept', 'override', 'safe', 'dispatch', 'assign']
      return {
        id: String(row.id),
        action: String(row.action_text),
        user: String(row.user_name),
        caseId: String(row.case_id || ''),
        timestamp: String(row.timestamp),
        reason: row.reason ? String(row.reason) : undefined,
        type: ok.includes(type) ? type : 'assign',
      }
    }),
    timeline: (tlRes.data || []).map((r) => {
      const row = r as Record<string, unknown>
      const at = row.created_at ? new Date(String(row.created_at)).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }) : ''
      return { id: String(row.id), caseId: String(row.case_id), text: String(row.event_text), at }
    }),
    notifications: (notifRes.data || []).map((r) => {
      const row = r as Record<string, unknown>
      return { id: String(row.id), text: String(row.text), read: Boolean(row.read) }
    }),
    intakeQueue: (intakeRes.data || []).map((r) => {
      const row = r as Record<string, unknown>
      return {
        id: String(row.id),
        name: String(row.raw_message),
        channel: String(row.channel_label || row.channel || ''),
        snippet: String(row.snippet || ''),
        risk: Number(row.risk || 0),
      }
    }),
    registrations: (regRes.data || []).map((r) => {
      const row = r as Record<string, unknown>
      const time = row.created_at ? new Date(String(row.created_at)).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }) : ''
      return { id: String(row.id), name: String(row.name), age: Number(row.age || 0), area: String(row.area || ''), time }
    }),
    communityShelters: community,
    officialShelter: officialRow ? mapOfficial(officialRow) : null,
    buddyHouseholds: (buddyRes.data || []).map((r) => {
      const row = r as Record<string, unknown>
      return {
        id: String(row.id),
        name: String(row.name),
        nameUrdu: String(row.name_urdu || ''),
        location: String(row.location_text || ''),
        locationUrdu: String(row.location_text_urdu || ''),
        notes: String(row.notes || ''),
        outcome: String(row.last_outcome || 'pending'),
        flags: Array.isArray(row.flags) ? (row.flags as string[]) : [],
      }
    }),
    fieldTasks: (taskRes.data || []).map((r) => {
      const row = r as Record<string, unknown>
      return {
        id: String(row.id),
        caseId: String(row.case_id || ''),
        title: String(row.title || ''),
        status: String(row.status || 'queued'),
        etaMinutes: Number(row.eta_minutes || 0),
      }
    }),
    alertLevel: ['advisory', 'warning', 'evacuation'].includes(alertLevel) ? alertLevel : 'warning',
    hazardCountdown: Number(cfg.hazard_countdown_seconds ?? 13330),
    sim,
    resident: residentRaw
      ? {
          name: String(residentRaw.name || 'Rashid Ali'),
          phone: String(residentRaw.phone || ''),
          phoneType: (residentRaw.phoneType as 'smartphone' | 'basic' | 'none') || 'basic',
          language: (residentRaw.language as Language) || 'ur',
          flags: Array.isArray(residentRaw.flags) ? (residentRaw.flags as string[]) : [],
        }
      : null,
  }
}

export async function signIn(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signOut() {
  await supabase.auth.signOut()
}


// ---------------------------------------------------------------------------------------------------------------------
// Writes. Everything goes through the offline outbox: it runs now when online, otherwise it is queued in IndexedDB and
// replayed (in order) when the connection returns.
// ---------------------------------------------------------------------------------------------------------------------

export async function updateCase(id: string, patch: Record<string, unknown>) {
  await write({ table: 'cases', op: 'update', values: patch, match: { id }, title: `Case update: ${id}`, description: describePatch(patch), priority: 1 })
}

export async function insertCase(c: Case) {
  await write({
    table: 'cases',
    op: 'insert',
    title: `New case: ${c.name}`,
    description: `${c.location} (Tier ${c.tier})`,
    priority: 2,
    values: {
      id: c.id,
      name: c.name,
      name_urdu: c.nameUrdu,
      age: c.age,
      location_text: c.location,
      location_text_urdu: c.locationUrdu,
      area: KARACHI.includes(c.area) ? c.area : 'other',
      tier: c.tier,
      risk: c.risk,
      status: c.status,
      vulnerability: c.vulnerability,
      unknown_data: Boolean(c.unknown),
    },
  })
}

export async function insertAssignment(a: Assignment) {
  await write({
    table: 'assignments',
    op: 'insert',
    title: `Assignment: ${a.assetLabel} to ${a.caseName}`,
    description: `Status ${a.status}, ETA ${a.etaMin} min`,
    priority: 1,
    values: {
      id: a.id,
      case_id: a.caseId,
      case_name: a.caseName,
      asset: a.asset,
      asset_label: a.assetLabel,
      status: a.status,
      pinned: a.pinned,
      eta_minutes: a.etaMin,
    },
  })
}

export async function updateAssignment(id: string, patch: Record<string, unknown>) {
  await write({ table: 'assignments', op: 'update', values: patch, match: { id }, title: `Assignment update: ${id}`, description: describePatch(patch), priority: 2 })
}

export async function insertAudit(entry: { action: string; user: string; caseId: string; type: string; reason?: string; role?: Role }) {
  await write({
    table: 'audit_log',
    op: 'insert',
    title: `Audit: ${entry.action}`,
    description: entry.reason ? `Reason: ${entry.reason}` : `${entry.user} on ${entry.caseId}`,
    priority: 3,
    values: {
      action_type: entry.type,
      action_text: entry.action,
      user_name: entry.user,
      user_role: entry.role || null,
      case_id: entry.caseId || null,
      reason: entry.reason || null,
    },
  })
}

export async function insertTimeline(caseId: string, text: string, userId?: string) {
  await write({ table: 'timeline', op: 'insert', title: `Timeline: ${text}`, description: caseId, priority: 3, values: { case_id: caseId, event_text: text, created_by: userId || null } })
}

export async function insertRegistration(r: { name: string; age: number; area: string; phone?: string; registrarId?: string; lat?: number; lng?: number }) {
  await write({
    table: 'registrations',
    op: 'insert',
    title: `Registration: ${r.name}`,
    description: `Age ${r.age}, ${r.area}`,
    priority: 2,
    values: {
      name: r.name, age: r.age, area: r.area, phone: r.phone || null, registrar_id: r.registrarId || null,
      // The registrar's position at the doorstep, so the household lands on the map as a real point.
      ...(r.lat != null && r.lng != null ? { location: `SRID=4326;POINT(${r.lng} ${r.lat})` } : {}),
    },
  })
}

export async function insertShelter(s: CommunityShelter, userId?: string) {
  await write({
    table: 'shelters',
    op: 'insert',
    title: `Community shelter: ${s.name}`,
    description: `${s.area}, capacity ${s.capacity}`,
    priority: 3,
    values: {
      id: s.id,
      kind: 'community',
      name: s.name,
      name_urdu: s.nameUrdu,
      host: s.host,
      host_urdu: s.hostUrdu,
      type: s.type,
      area: s.area,
      area_urdu: s.areaUrdu,
      capacity: s.capacity,
      occupied: 0,
      amenities: s.amenities,
      verified: s.verified,
      phone: s.phone,
      note: s.note,
      note_urdu: s.noteUrdu,
      registered_by: userId || null,
    },
  })
}

/** `capacity` and `free` come from the local copy, so this also works offline (no read-modify-write round trip). */
export async function reserveShelter(id: string, people: number, capacity: number, free: number) {
  const reserved = Math.min(people, free)
  const occupied = Math.max(0, Math.min(capacity, capacity - free + reserved))
  await write({ table: 'shelters', op: 'update', values: { occupied }, match: { id }, title: `Shelter reservation: ${id}`, description: `${reserved} place(s) reserved`, priority: 2 })
}

export async function markNotificationsRead() {
  await write({ table: 'notifications', op: 'update', values: { read: true, read_at: new Date().toISOString() }, match: { read: false }, title: 'Notifications marked read', priority: 4 })
}

export async function setConfig(key: string, value: unknown) {
  await write({ table: 'system_config', op: 'upsert', values: { key, value }, title: `Config: ${key}`, description: JSON.stringify(value).slice(0, 80), priority: 3 })
}

export async function updateProfile(id: string, patch: Record<string, unknown>) {
  await write({ table: 'profiles', op: 'update', values: patch, match: { id }, title: 'Profile update', priority: 4 })
}

export async function markIntakeProcessed(id: string) {
  await write({ table: 'intake_queue', op: 'update', values: { processed: true, processed_at: new Date().toISOString() }, match: { id }, title: 'Intake report reviewed', priority: 3 })
}

export async function insertCommunication(caseId: string, channel: string, direction: string, text: string) {
  await write({ table: 'communication_log', op: 'insert', title: `Message (${direction}) via ${channel}`, description: text.slice(0, 80), priority: 3, values: { case_id: caseId, channel, direction, message_text: text } })
}

export async function updateFieldTask(id: string, patch: Record<string, unknown>) {
  await write({ table: 'field_tasks', op: 'update', values: patch, match: { id }, title: `Field task: ${id}`, description: describePatch(patch), priority: 1 })
}

export async function insertNotification(row: { audience_role: string; text: string; text_urdu?: string; type: string; related_case_id?: string }) {
  await write({ table: 'notifications', op: 'insert', title: `Alert to ${row.audience_role}`, description: row.text.slice(0, 80), priority: 1, values: row })
}

export async function insertBuddyCheckin(row: { household_id: string; outcome: string; notes?: string }) {
  await write({ table: 'buddy_checkins', op: 'insert', title: `Buddy check-in: ${row.outcome}`, description: row.household_id, priority: 2, values: row })
}

export async function updateBuddyHousehold(id: string, patch: Record<string, unknown>) {
  await write({ table: 'buddy_households', op: 'update', values: patch, match: { id }, title: `Buddy household: ${id}`, description: describePatch(patch), priority: 2 })
}

function describePatch(patch: Record<string, unknown>) {
  return Object.entries(patch)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(', ')
    .slice(0, 100)
}
