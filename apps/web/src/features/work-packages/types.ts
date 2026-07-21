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
export type WpType = string

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
  customer_id: string | null
  cycle_id: string | null
  module_id: string | null
  /** date-only 'YYYY-MM-DD' strings — never converted through JS Date (§6.1) */
  start_date: string | null
  due_date: string | null
  estimated_hours: number | null
  /** author user-id — null on rows created before the column existed */
  created_by: string | null
  /** optimistic-concurrency token: echo the integer exactly (§6.2) */
  version: number
  created_at: string
  updated_at: string
  /** batch custom-field values — present only when the list was requested
      with `custom_fields=` (Pass 67); null otherwise */
  custom_values?: Array<{
    field_id: string
    value: unknown
    member_display_name: string | null
  }> | null
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
  customer_id: string | null
  cycle_id: string | null
  module_id: string | null
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
  /** set on replies — always references a ROOT comment (single-level threads) */
  parent_id: string | null
  author_id: string | null
  author_name: string | null
  author_profile_image_url: string | null
  body: string
  /** accepted mention user-ids (member-validated server-side); null = none */
  mentions: string[] | null
  /** six fixed vocabulary slots (server always returns all — 0-count included) */
  reactions: ReactionAgg[]
  created_at: string
  updated_at: string
}

export type ReactionAgg = { key: string; count: number; me: boolean }

/** Quick-pick glyphs (Pass 35: the API stores glyphs — the set is OPEN and
    the aggregate returns whatever exists; this list is only the web's
    one-click shortcut row). */
export type CommentList = {
  items: Comment[]
  total: number
}

export type CommentThreadList = {
  items: Array<{ root: Comment; replies: Comment[] }>
  total_threads: number
  total_comments: number
  next_cursor_created_at: string | null
  next_cursor_id: string | null
}

export type Activity = {
  id: string
  work_package_id: string
  actor_id: string | null
  actor_name: string | null
  actor_profile_image_url: string | null
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
  next_cursor_created_at: string | null
  next_cursor_id: string | null
}

export type CsvRowError = {
  /** 1-based data row (header excluded) */
  row: number
  message: string
  /** the row re-serialized as one CSV line, for targeted resubmission (재처리) */
  raw: string
}

export type CsvImportAssigneeIdentity = {
  source_value: string
  row_count: number
  suggested_user_id: string | null
  suggested_display_name: string | null
  suggested_email: string | null
  selected_user_id: string | null
  selected_display_name: string | null
}

export type CsvImportAssignableMember = {
  user_id: string
  email: string
  display_name: string
  role: 'owner' | 'member'
}

export type CsvImportResult = {
  dry_run: boolean
  total_rows: number
  valid: number
  invalid: number
  inserted: number
  /** sha256 of the valid rows — reconcile a dry-run preview against the commit (대사) */
  checksum: string
  /** sha256 of the exact uploaded text — binds mapping decisions to this preview */
  preview_checksum: string
  errors: CsvRowError[]
  /** adapter advisories (fallback counts, ignored columns, assignment summary) */
  notes: string[]
  assignee_identities: CsvImportAssigneeIdentity[]
  assignable_members: CsvImportAssignableMember[]
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

export const TYPE_LABELS: Record<string, string> = {
  task: '작업',
  bug: '버그',
  feature: '기능',
  milestone: '마일스톤',
}
