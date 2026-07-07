/* List column configuration (expansion Pass 32 PR-AX).

   The URL query `columns` (comma-separated, canonical order) is the single
   state carrier so saved views capture it through their existing params
   mirror. Built-in WP fields only — custom-field columns are a separate
   design (v32.1 R1-②). Subject and the selection checkbox are always shown;
   at least one configurable column must stay on (R1-①), so an empty or
   all-unknown value falls back to the defaults. */

export const LIST_COLUMNS = [
  'type',
  'status',
  'priority',
  'assignee',
  'start_date',
  'due_date',
  'created_at',
] as const

export type ListColumn = (typeof LIST_COLUMNS)[number]

export const COLUMN_LABELS: Record<ListColumn, string> = {
  type: '타입',
  status: '상태',
  priority: '우선순위',
  assignee: '담당자',
  start_date: '시작일',
  due_date: '기한',
  created_at: '생성일',
}

export const DEFAULT_COLUMNS: ListColumn[] = [
  'type',
  'status',
  'priority',
  'assignee',
  'due_date',
]

/** Unknown keys are silently dropped (forward compatibility with shared or
    hand-edited URLs); duplicates collapse; the result keeps canonical order. */
export function parseColumns(raw: string | null): ListColumn[] {
  if (raw === null) return DEFAULT_COLUMNS
  const wanted = new Set(raw.split(',').map((k) => k.trim()))
  const known = LIST_COLUMNS.filter((k) => wanted.has(k))
  return known.length > 0 ? known : DEFAULT_COLUMNS
}

/** Canonical string for the URL and for saving views — null when the set
    equals the defaults so plain URLs stay clean (the sort precedent). The
    SAME normalization runs before saving a view, so the API (which 422s on
    unknown keys) never sees what the URL parser silently dropped (R1-④). */
export function serializeColumns(cols: ListColumn[]): string | null {
  const canonical = LIST_COLUMNS.filter((k) => cols.includes(k))
  if (
    canonical.length === DEFAULT_COLUMNS.length &&
    canonical.every((k, i) => k === DEFAULT_COLUMNS[i])
  ) {
    return null
  }
  return canonical.join(',')
}
