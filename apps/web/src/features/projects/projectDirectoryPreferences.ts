export const ROLLUP_COLUMNS = [
  { key: 'initiatives', label: '이니셔티브' },
  { key: 'work_package_count', label: '작업' },
  { key: 'open_work_package_count', label: '진행 중' },
  { key: 'overdue_count', label: '기한 초과' },
  { key: 'member_count', label: '멤버' },
] as const

export type RollupKey = (typeof ROLLUP_COLUMNS)[number]['key']
export type ProjectLayout = 'grid' | 'list'
export type ProjectDirectorySortKey =
  | 'default'
  | 'name'
  | 'work_package_count'
  | 'open_work_package_count'
  | 'overdue_count'
  | 'member_count'
  | 'health'
export type ProjectDirectorySortDir = 'asc' | 'desc'
export type ProjectDirectoryPreferences = {
  columns: RollupKey[]
  sort: { key: ProjectDirectorySortKey; dir: ProjectDirectorySortDir }
  layout: ProjectLayout
}

export type ProjectDirectoryPreferencesPayload = {
  columns: RollupKey[]
  sort_key: ProjectDirectorySortKey
  sort_direction: ProjectDirectorySortDir
  layout: ProjectLayout
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

export const COLUMNS_STORAGE_KEY = 'oneflow.projects.columns.v1'
export const SORT_STORAGE_KEY = 'oneflow.projects.sort.v1'
export const LAYOUT_STORAGE_KEY = 'oneflow.projects.layout.v1'
export const DEFAULT_PROJECT_DIRECTORY_PREFERENCES: ProjectDirectoryPreferences = {
  columns: ROLLUP_COLUMNS.filter((column) => column.key !== 'initiatives').map(
    (column) => column.key,
  ),
  sort: { key: 'default', dir: 'asc' },
  layout: 'grid',
}

function storageOrNull(): StorageLike | null {
  try {
    return localStorage
  } catch {
    return null
  }
}

function parseColumns(value: unknown): RollupKey[] | null {
  if (!Array.isArray(value)) return null
  const seen = new Set<RollupKey>()
  return value.filter((column): column is RollupKey => {
    if (
      typeof column !== 'string' ||
      !ROLLUP_COLUMNS.some((available) => available.key === column) ||
      seen.has(column as RollupKey)
    ) {
      return false
    }
    seen.add(column as RollupKey)
    return true
  })
}

function parseSort(
  value: unknown,
): { key: ProjectDirectorySortKey; dir: ProjectDirectorySortDir } | null {
  if (!value || typeof value !== 'object') return null
  const { key, dir } = value as { key?: unknown; dir?: unknown }
  if (
    ![
      'default',
      'name',
      'work_package_count',
      'open_work_package_count',
      'overdue_count',
      'member_count',
      'health',
    ].includes(key as ProjectDirectorySortKey) ||
    (dir !== 'asc' && dir !== 'desc')
  ) {
    return null
  }
  return { key: key as ProjectDirectorySortKey, dir }
}

function parseLayout(value: unknown): ProjectLayout | null {
  return value === 'grid' || value === 'list' ? value : null
}

export function parseProjectDirectoryPreferences(value: unknown): ProjectDirectoryPreferences | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as {
    columns?: unknown
    sort_key?: unknown
    sort_direction?: unknown
    layout?: unknown
  }
  const columns = parseColumns(candidate.columns)
  const sort = parseSort({ key: candidate.sort_key, dir: candidate.sort_direction })
  const layout = parseLayout(candidate.layout)
  return columns && sort && layout ? { columns, sort, layout } : null
}

export function toProjectDirectoryPreferencesPayload(
  preferences: ProjectDirectoryPreferences,
): ProjectDirectoryPreferencesPayload {
  return {
    columns: preferences.columns,
    sort_key: preferences.sort.key,
    sort_direction: preferences.sort.dir,
    layout: preferences.layout,
  }
}

export function loadLocalProjectDirectoryPreferences(storage = storageOrNull()) {
  const fallback = DEFAULT_PROJECT_DIRECTORY_PREFERENCES
  if (!storage) return { preferences: fallback, hasLegacy: false, isValid: false }

  let columnsRaw: string | null
  let sortRaw: string | null
  let layoutRaw: string | null
  try {
    columnsRaw = storage.getItem(COLUMNS_STORAGE_KEY)
    sortRaw = storage.getItem(SORT_STORAGE_KEY)
    layoutRaw = storage.getItem(LAYOUT_STORAGE_KEY)
  } catch {
    return { preferences: fallback, hasLegacy: false, isValid: false }
  }

  const hasLegacy = columnsRaw !== null || sortRaw !== null || layoutRaw !== null
  let columns = fallback.columns
  let sort = fallback.sort
  let layout = fallback.layout
  let isValid = true
  try {
    if (columnsRaw !== null) {
      const parsed = parseColumns(JSON.parse(columnsRaw))
      if (!parsed) isValid = false
      else columns = parsed
    }
    if (sortRaw !== null) {
      const parsed = parseSort(JSON.parse(sortRaw))
      if (!parsed) isValid = false
      else sort = parsed
    }
    if (layoutRaw !== null) {
      const parsed = parseLayout(layoutRaw)
      if (!parsed) isValid = false
      else layout = parsed
    }
  } catch {
    isValid = false
  }
  return { preferences: { columns, sort, layout }, hasLegacy, isValid }
}

export function saveLocalProjectDirectoryPreferences(
  preferences: ProjectDirectoryPreferences,
  storage = storageOrNull(),
) {
  if (!storage) return
  try {
    storage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(preferences.columns))
    storage.setItem(SORT_STORAGE_KEY, JSON.stringify(preferences.sort))
    storage.setItem(LAYOUT_STORAGE_KEY, preferences.layout)
  } catch {
    // private mode / quota — keep the in-memory state only
  }
}

/** Writes never overlap. A change made while a request is pending is sent next. */
export class LatestPreferenceWriter<T, R = unknown> {
  private latest: T | null = null
  private running = false
  private queued = false
  private status: 'idle' | 'pending' | 'error' = 'idle'
  private generation = 0
  private readonly save: (value: T) => Promise<R>
  private readonly onStatus: (status: 'idle' | 'pending' | 'error') => void
  private readonly statusListeners = new Set<(status: 'idle' | 'pending' | 'error') => void>()
  private readonly savedListeners = new Set<(result: R) => void>()

  constructor(
    save: (value: T) => Promise<R>,
    onStatus: (status: 'idle' | 'pending' | 'error') => void = () => undefined,
  ) {
    this.save = save
    this.onStatus = onStatus
  }

  queue(value: T) {
    this.latest = value
    this.queued = true
    void this.flush()
  }

  retry() {
    if (!this.latest) return
    this.queued = true
    void this.flush()
  }

  getStatus() {
    return this.status
  }

  subscribeStatus(listener: (status: 'idle' | 'pending' | 'error') => void) {
    this.statusListeners.add(listener)
    listener(this.status)
    return () => {
      this.statusListeners.delete(listener)
    }
  }

  subscribeSaved(listener: (result: R) => void) {
    this.savedListeners.add(listener)
    return () => {
      this.savedListeners.delete(listener)
    }
  }

  reset() {
    this.generation += 1
    this.latest = null
    this.queued = false
    this.setStatus('idle')
  }

  private setStatus(status: 'idle' | 'pending' | 'error') {
    this.status = status
    this.onStatus(status)
    for (const listener of this.statusListeners) listener(status)
  }

  private async flush() {
    if (this.running || !this.queued || !this.latest) return
    this.running = true
    this.queued = false
    const snapshot = this.latest
    const generation = this.generation
    this.setStatus('pending')
    try {
      const result = await this.save(snapshot)
      if (generation === this.generation) {
        for (const listener of this.savedListeners) listener(result)
        this.setStatus('idle')
      }
    } catch {
      if (generation === this.generation) this.setStatus('error')
    } finally {
      this.running = false
      if (this.queued) void this.flush()
    }
  }
}
