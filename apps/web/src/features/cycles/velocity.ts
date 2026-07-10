/* Velocity (Pass 55 PR-BU): pure selection over the cycles the list API
   already returns — done counts of the most recent COMPLETED cycles
   (current-assignment semantics; history-accurate velocity is a separate
   design, recorded in the ledger). */

import type { Cycle } from './api'

export type VelocityPoint = { id: string; name: string; done: number }

export type VelocityModel = {
  points: VelocityPoint[] // oldest → newest
  average: number
  max: number
}

/** Null when fewer than two completed cycles exist (a trend needs two). */
export function recentVelocity(cycles: Cycle[], n = 5): VelocityModel | null {
  const completed = cycles
    .filter((c) => c.status === 'completed')
    .sort((a, b) => a.end_date.localeCompare(b.end_date))
    .slice(-n)
  if (completed.length < 2) return null
  const points = completed.map((c) => ({
    id: c.id,
    name: c.name,
    done: c.done_work_package_count,
  }))
  const average = points.reduce((sum, p) => sum + p.done, 0) / points.length
  return { points, average, max: Math.max(...points.map((p) => p.done), 1) }
}
