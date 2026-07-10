/* Module timeline-lite (Pass 59 PR-BY): pure positioning over the module
   list's existing start/target dates, reusing the WP timeline's UTC day
   helpers. Modules without BOTH dates fall to an undated list. */

import { dayIndex } from '../work-packages/timeline.ts'

import type { ProjectModule } from './api.ts'

export type ModuleBar = {
  module: ProjectModule
  startIdx: number
  endIdx: number
}

export type ModuleTimelineModel = {
  rangeStart: number
  rangeEnd: number
  totalDays: number
  bars: ModuleBar[]
  undated: ProjectModule[]
}

export function moduleBars(modules: ProjectModule[], todayIdx: number): ModuleTimelineModel | null {
  const bars: ModuleBar[] = []
  const undated: ProjectModule[] = []
  for (const m of modules) {
    const s = dayIndex(m.start_date)
    const e = dayIndex(m.target_date)
    if (s === null || e === null) {
      undated.push(m)
      continue
    }
    bars.push({ module: m, startIdx: Math.min(s, e), endIdx: Math.max(s, e) })
  }
  if (bars.length === 0) return null
  let rangeStart = Math.min(...bars.map((b) => b.startIdx), todayIdx)
  let rangeEnd = Math.max(...bars.map((b) => b.endIdx), todayIdx)
  rangeStart -= 2
  rangeEnd += 2
  return { rangeStart, rangeEnd, totalDays: rangeEnd - rangeStart + 1, bars, undated }
}
