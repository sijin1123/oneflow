/* API contract types — manually mirrored from the FastAPI OpenAPI schema until
   the OpenAPI type-generation follow-up PR lands (packages/shared). Cross-checked
   in the Broad verification checklist (PLAN §13). */

export type Project = {
  id: string
  key: string
  name: string
  description: string | null
  cover_attachment_id: string | null
  budget: number | null
  archived_at: string | null
  health: ProjectHealth | null
  health_note: string | null
  health_updated_by: string | null
  health_updated_at: string | null
  created_at: string
  updated_at: string
}

export type ProjectHealth = 'on_track' | 'at_risk' | 'off_track'

export type ProjectHealthHistoryItem = {
  id: string
  project_id: string
  previous_health: ProjectHealth | null
  previous_note: string | null
  health: ProjectHealth | null
  note: string | null
  changed_by: string | null
  changed_by_name: string | null
  created_at: string
}

export type ProjectHealthHistoryList = {
  items: ProjectHealthHistoryItem[]
  total: number
}

export type ProjectPhaseKey = string
export type ProjectPhaseColor = 'sky' | 'indigo' | 'emerald' | 'amber'

export type ProjectPhaseGate = {
  kind: 'start' | 'finish'
  name: string
  active: boolean
  date: string | null
}

export type ProjectPhase = {
  key: ProjectPhaseKey
  name: string
  color: ProjectPhaseColor
  position: number
  active: boolean
  start_date: string | null
  end_date: string | null
  start_gate: ProjectPhaseGate
  finish_gate: ProjectPhaseGate
  version: number
  retired: boolean
  built_in: boolean
}

export type ProjectPhaseList = {
  items: ProjectPhase[]
  total: number
}

export const HEALTH_LABELS: Record<ProjectHealth, string> = {
  on_track: '정상',
  at_risk: '주의',
  off_track: '위험',
}

export const HEALTH_STYLES: Record<ProjectHealth, string> = {
  on_track: 'bg-emerald-100 text-emerald-700',
  at_risk: 'bg-amber-100 text-amber-700',
  off_track: 'bg-red-100 text-red-700',
}

export type ProjectListItem = Project & {
  work_package_count: number
  open_work_package_count: number
  overdue_count: number
  member_count: number
  current_user_role: 'owner' | 'member' | 'viewer'
  initiatives: Array<{ id: string; name: string }>
  initiative_overflow: number
}

export type ProjectList = {
  items: ProjectListItem[]
  total: number
}
