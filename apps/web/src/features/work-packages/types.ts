/* API contract types — manually mirrored from the FastAPI OpenAPI schema until
   the OpenAPI type-generation follow-up PR lands. Playwright mock fixtures are
   declared with these types so contract drift fails typecheck (PLAN §8). */

export const WP_STATUSES = [
  'backlog',
  'todo',
  'in_progress',
  'in_review',
  'done',
  'cancelled',
] as const
export type WpStatus = (typeof WP_STATUSES)[number]

export const WP_PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'] as const
export type WpPriority = (typeof WP_PRIORITIES)[number]

export const WP_TYPES = ['task', 'bug', 'feature', 'milestone'] as const
export type WpType = (typeof WP_TYPES)[number]

export type WorkPackage = {
  id: string
  project_id: string
  subject: string
  description: string | null
  type: WpType
  status: WpStatus
  priority: WpPriority
  assignee_id: string | null
  parent_id: string | null
  milestone_id: string | null
  /** date-only 'YYYY-MM-DD' strings — never converted through JS Date (§6.1) */
  start_date: string | null
  due_date: string | null
  estimated_hours: number | null
  /** optimistic-concurrency token: echo the integer exactly (§6.2) */
  version: number
  created_at: string
  updated_at: string
}

export type WorkPackageList = {
  items: WorkPackage[]
  total: number
}

export type WorkPackagePatch = Partial<{
  subject: string
  description: string | null
  type: WpType
  status: WpStatus
  priority: WpPriority
  assignee_id: string | null
  parent_id: string | null
  milestone_id: string | null
  start_date: string | null
  due_date: string | null
  estimated_hours: number | null
}> & { expected_version: number }

export type Relation = {
  id: string
  source_id: string
  target_id: string
  relation_type: 'blocks' | 'precedes' | 'follows' | 'relates'
  direction: 'outgoing' | 'incoming'
}

export type RelationList = {
  items: Relation[]
  total: number
}

export type ConflictBody = {
  detail: string
  current: WorkPackage
}

export type Comment = {
  id: string
  work_package_id: string
  author_id: string | null
  body: string
  created_at: string
  updated_at: string
}

export type CommentList = {
  items: Comment[]
  total: number
}

export type Activity = {
  id: string
  work_package_id: string
  actor_id: string | null
  action: 'created' | 'field_changed' | 'commented'
  field: string | null
  old_value: string | null
  new_value: string | null
  created_at: string
}

export type TimeEntry = {
  id: string
  work_package_id: string
  user_id: string | null
  hours: number
  spent_on: string
  comment: string | null
  created_at: string
}

export type TimeEntryList = {
  items: TimeEntry[]
  total: number
  total_hours: number
}

export type CostEntry = {
  id: string
  work_package_id: string
  user_id: string | null
  amount: number
  kind: 'labor' | 'material' | 'other'
  spent_on: string
  comment: string | null
  created_at: string
}

export type CostEntryList = {
  items: CostEntry[]
  total: number
  total_amount: number
}

export type ActivityList = {
  items: Activity[]
  total: number
}

export type CsvRowError = {
  /** 1-based data row (header excluded) */
  row: number
  message: string
  /** the row re-serialized as one CSV line, for targeted resubmission (재처리) */
  raw: string
}

export type CsvImportResult = {
  dry_run: boolean
  total_rows: number
  valid: number
  invalid: number
  inserted: number
  /** sha256 of the valid rows — reconcile a dry-run preview against the commit (대사) */
  checksum: string
  errors: CsvRowError[]
}

export const STATUS_LABELS: Record<WpStatus, string> = {
  backlog: '백로그',
  todo: '할 일',
  in_progress: '진행 중',
  in_review: '검토 중',
  done: '완료',
  cancelled: '취소',
}

export const PRIORITY_LABELS: Record<WpPriority, string> = {
  none: '없음',
  low: '낮음',
  medium: '보통',
  high: '높음',
  urgent: '긴급',
}

export const TYPE_LABELS: Record<WpType, string> = {
  task: '작업',
  bug: '버그',
  feature: '기능',
  milestone: '마일스톤',
}
