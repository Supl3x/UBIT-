import { useMemo } from 'react'
import { useStore, type Case } from '../store'
import type { FieldTask } from './db'

export type FieldRow = { task?: FieldTask; c: Case }

/**
 * The volunteer's work list. Row Level Security already limits a volunteer to the cases and tasks assigned to them,
 * so this just joins tasks to cases and orders by tier then risk. With no explicit tasks it falls back to the
 * assigned open cases.
 */
export function useFieldQueue() {
  const cases = useStore((s) => s.cases)
  const fieldTasks = useStore((s) => s.fieldTasks)
  return useMemo(() => {
    const open = cases.filter((c) => c.status !== 'safe')
    const byCase = new Map(open.map((c) => [c.id, c]))
    const fromTasks: FieldRow[] = fieldTasks
      .filter((t) => t.status !== 'completed')
      .flatMap((t) => {
        const c = byCase.get(t.caseId)
        return c ? [{ task: t, c }] : []
      })
    const list: FieldRow[] = fromTasks.length ? fromTasks : open.map((c) => ({ c }))
    list.sort((a, b) => a.c.tier - b.c.tier || b.c.risk - a.c.risk)
    return {
      list,
      done: fieldTasks.filter((t) => t.status === 'completed').length,
      remaining: list.length,
    }
  }, [cases, fieldTasks])
}

export const mapsLink = (c: Case) =>
  c.lat != null && c.lng != null ? `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}&travelmode=walking` : undefined
