import { supabase, supabaseConfigured } from './supabase'
import { useStore } from '../store'
import { hydrateFromSupabase } from './session'

/** Edge Functions only work for a real Supabase session (not a local demo session). */
export const backendReady = () => supabaseConfigured && !!useStore.getState().authUserId

export async function callFn<T = Record<string, unknown>>(name: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) throw new Error(error.message)
  if (data && (data as { ok?: boolean; error?: string }).ok === false) throw new Error((data as { error?: string }).error || 'Function failed')
  return data as T
}

export type DemoAction =
  | 'snapshot' | 'reset' | 'seed' | 'play_storm' | 'jump_time' | 'break_network'
  | 'close_road' | 'boat_broken' | 'set_mode' | 'simulate_silence' | 'live_weather'

export const demoControl = (action: DemoAction, params: Record<string, unknown> = {}) => callFn('seed-reset-demo', { action, ...params })
export const recompute = () => callFn('recompute')
export const weatherSync = (force = false) => callFn('weather-sync', { force })

export type CaseActionName = 'accept' | 'override' | 'safe' | 'dispatch'
/** Human decisions are validated on the server (an override needs a written reason) and written to the audit log. */
export const caseAction = (action: CaseActionName, caseId: string, extra: { reason?: string; tier?: number } = {}) =>
  callFn('case-action', { action, case_id: caseId, ...extra })

export type FairnessArea = {
  area: string; households: number; tier1: number; avg_risk: number; reports_24h: number; report_rate: number
  report_ratio: number; flagged: boolean; suggested_multiplier: number; applied_multiplier: number
}
export const fairnessStats = () =>
  callFn<{ city_report_rate: number; city_avg_risk: number; areas: FairnessArea[] }>('case-action', { action: 'fairness_stats' })
export const fairnessApply = (area: string, multiplier: number, reason: string) =>
  callFn('case-action', { action: 'fairness_apply', area, multiplier, reason })
export const fairnessClear = (area?: string) => callFn('case-action', { action: 'fairness_clear', area })
export const tick = () => callFn('tick')
export const sendMessage = (caseId: string, kind: 'checkin' | 'alert' | 'custom', extra: Record<string, unknown> = {}) =>
  callFn('send-message', { case_id: caseId, kind, ...extra })
export const parseIntake = (raw: string, extra: Record<string, unknown> = {}) => callFn('intake-parse', { raw_message: raw, ...extra })

type Decision = { decision?: { channel: string; reason: string } }

/**
 * Run a backend call, refresh the store from Supabase afterwards, and toast failures.
 * Returns false (and does nothing) when there is no real Supabase session, so callers keep their local demo behaviour.
 */
export function withBackend<T>(fn: () => Promise<T>, done?: (r: T) => void): boolean {
  if (!backendReady()) return false
  const toast = useStore.getState().showToast
  fn()
    .then(async (r) => { await hydrateFromSupabase(); done?.(r) })
    .catch((e: Error) => toast(`Backend: ${e.message}`, 'بیک اینڈ میں خرابی', 'error'))
  return true
}

export const describeRoute = (r: Decision) => (r.decision ? `${r.decision.channel}: ${r.decision.reason}` : '')
