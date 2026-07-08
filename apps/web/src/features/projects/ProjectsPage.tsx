import { FolderKanban, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ApiError } from '@/lib/api'

import { useCreateProject, useProjects } from './api'
import { SORT_KEYS, SORT_LABELS, sortProjects, type ProjectSortKey, type SortDir } from './sort'
import { HEALTH_LABELS, HEALTH_STYLES } from './types'

const KEY_RE = /^[A-Z][A-Z0-9]{1,9}$/

function NewProjectForm({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const create = useCreateProject()
  const { data: existing } = useProjects()
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [description, setDescription] = useState('')
  const [templateId, setTemplateId] = useState('')

  const keyValid = KEY_RE.test(key)
  const canSubmit = name.trim().length > 0 && keyValid && !create.isPending

  const submit = () => {
    if (!canSubmit) return
    create.mutate(
      {
        name: name.trim(),
        key,
        description: description.trim() || null,
        template_project_id: templateId || null,
      },
      { onSuccess: (p) => navigate(`/projects/${p.id}/work-packages`) },
    )
  }

  const conflict = create.error instanceof ApiError && create.error.status === 409
  const otherError =
    create.error instanceof ApiError && create.error.status !== 409 ? create.error.message : null

  return (
    <div className="mb-4 space-y-2 rounded-of border border-of-border bg-of-surface p-4">
      <p className="text-sm font-medium">새 프로젝트</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_160px]">
        <div className="space-y-1">
          <label htmlFor="np-name" className="text-xs text-of-muted">
            이름
          </label>
          <Input
            id="np-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="프로젝트 이름"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="np-key" className="text-xs text-of-muted">
            키 (대문자·숫자 2–10자)
          </label>
          <Input
            id="np-key"
            value={key}
            onChange={(e) => setKey(e.target.value.toUpperCase())}
            placeholder="ONE"
            aria-invalid={key.length > 0 && !keyValid}
          />
        </div>
      </div>
      <div className="space-y-1">
        <label htmlFor="np-desc" className="text-xs text-of-muted">
          설명 (선택)
        </label>
        <Input
          id="np-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="한 줄 설명"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="np-template" className="text-xs text-of-muted">
          템플릿으로 사용할 프로젝트 (선택 — 상태·타입·필드·자동화 설정을 복사)
        </label>
        <Select
          id="np-template"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
        >
          <option value="">사용 안 함</option>
          {(existing?.items ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              [{p.key}] {p.name}
            </option>
          ))}
        </Select>
      </div>
      {key.length > 0 && !keyValid ? (
        <p className="text-xs text-of-danger">
          키는 대문자로 시작하는 대문자·숫자 2–10자여야 합니다.
        </p>
      ) : null}
      {conflict ? <p className="text-xs text-of-danger">이미 사용 중인 키입니다.</p> : null}
      {otherError ? (
        <p role="alert" className="text-xs text-of-danger">
          생성하지 못했습니다: {otherError}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={submit} disabled={!canSubmit}>
          만들기
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          취소
        </Button>
      </div>
    </div>
  )
}

const ROLLUP_COLUMNS = [
  { key: 'initiatives', label: '이니셔티브' },
  { key: 'work_package_count', label: '작업' },
  { key: 'open_work_package_count', label: '진행 중' },
  { key: 'overdue_count', label: '기한 초과' },
  { key: 'member_count', label: '멤버' },
] as const

type RollupKey = (typeof ROLLUP_COLUMNS)[number]['key']
const COLUMNS_STORAGE_KEY = 'oneflow.projects.columns.v1'
// 'initiatives' is opt-in (Pass 51) — the default keeps the original five-column look.
const DEFAULT_COLUMNS: RollupKey[] = ROLLUP_COLUMNS.filter((c) => c.key !== 'initiatives').map(
  (c) => c.key,
)

/** Corrupted JSON / unknown keys / unavailable storage all fall back to the
    defaults (v22.1 R1-④) — a broken preference must never break the list. */
function loadColumns(): RollupKey[] {
  try {
    const raw = localStorage.getItem(COLUMNS_STORAGE_KEY)
    if (!raw) return DEFAULT_COLUMNS
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return DEFAULT_COLUMNS
    const known = parsed.filter((k): k is RollupKey =>
      ROLLUP_COLUMNS.some((c) => c.key === k),
    )
    return known
  } catch {
    return DEFAULT_COLUMNS
  }
}

const SORT_STORAGE_KEY = 'oneflow.projects.sort.v1'

/** Broken values fall back to the server default (#97 contract). */
function loadSort(): { key: ProjectSortKey; dir: SortDir } {
  try {
    const raw = localStorage.getItem(SORT_STORAGE_KEY)
    if (!raw) return { key: 'default', dir: 'asc' }
    const parsed = JSON.parse(raw) as { key?: unknown; dir?: unknown }
    const key = SORT_KEYS.includes(parsed.key as ProjectSortKey)
      ? (parsed.key as ProjectSortKey)
      : 'default'
    const dir = parsed.dir === 'desc' ? 'desc' : 'asc'
    return { key, dir }
  } catch {
    return { key: 'default', dir: 'asc' }
  }
}

function saveSort(sort: { key: ProjectSortKey; dir: SortDir }) {
  try {
    localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sort))
  } catch {
    // private mode / quota — in-memory only
  }
}

function saveColumns(cols: RollupKey[]) {
  try {
    localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(cols))
  } catch {
    // private mode / quota — keep the in-memory state only
  }
}

export function ProjectsPage() {
  const navigate = useNavigate()
  const [includeArchived, setIncludeArchived] = useState(false)
  const [columns, setColumns] = useState<RollupKey[]>(loadColumns)
  const [sort, setSort] = useState<{ key: ProjectSortKey; dir: SortDir }>(loadSort)
  const changeSort = (next: { key: ProjectSortKey; dir: SortDir }) => {
    setSort(next)
    saveSort(next)
  }

  const toggleColumn = (key: RollupKey) => {
    setColumns((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
      saveColumns(next)
      return next
    })
  }
  const { data, isPending, isError, error, refetch } = useProjects(includeArchived)
  const [creating, setCreating] = useState(false)

  if (isPending) return <ListSkeleton />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-base font-semibold">프로젝트</h1>
        <label className="ml-3 mr-auto flex items-center gap-1.5 text-xs text-of-muted">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
            className="h-3 w-3 accent-of-accent"
          />
          보관된 프로젝트 표시
        </label>
        <Select
          aria-label="프로젝트 정렬"
          className="h-7 w-32 text-xs"
          value={sort.key}
          onChange={(e) => changeSort({ ...sort, key: e.target.value as ProjectSortKey })}
        >
          {SORT_KEYS.map((k) => (
            <option key={k} value={k}>
              {SORT_LABELS[k]}
            </option>
          ))}
        </Select>
        <button
          type="button"
          aria-label={`정렬 방향 (${sort.dir === 'asc' ? '오름차순' : '내림차순'})`}
          className="rounded-of border border-of-border px-1.5 py-1 text-xs text-of-muted hover:bg-of-surface-2 disabled:opacity-50"
          disabled={sort.key === 'default'}
          onClick={() => changeSort({ ...sort, dir: sort.dir === 'asc' ? 'desc' : 'asc' })}
        >
          {sort.dir === 'asc' ? '↑' : '↓'}
        </button>
        <span className="flex items-center gap-2 text-xs text-of-muted">
          {ROLLUP_COLUMNS.map((c) => (
            <label key={c.key} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={columns.includes(c.key)}
                onChange={() => toggleColumn(c.key)}
                aria-label={`${c.label} 열 표시`}
                className="h-3 w-3 accent-of-accent"
              />
              {c.label}
            </label>
          ))}
        </span>
        {!creating ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} /> 새 프로젝트
          </Button>
        ) : null}
      </div>

      {creating ? <NewProjectForm onClose={() => setCreating(false)} /> : null}

      {data.total === 0 && !creating ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <FolderKanban className="text-of-muted" size={28} strokeWidth={1.5} />
          <p className="text-sm font-medium">아직 프로젝트가 없습니다</p>
          <p className="text-xs text-of-muted">첫 프로젝트를 만들어 시작하세요.</p>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} /> 새 프로젝트
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-of-border overflow-hidden rounded-of border border-of-border bg-of-surface">
          {sortProjects(data.items, sort.key, sort.dir).map((p) => (
            <li key={p.id}>
              <Link
                to={`/projects/${p.id}/work-packages`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-of-surface-2"
              >
                <FolderKanban size={16} className="shrink-0 text-of-accent" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    <span className="mr-1.5 text-of-muted">{p.key}</span>
                    {p.name}
                    {columns.includes('initiatives') && p.initiatives.length > 0 ? (
                      <span className="ml-1.5 inline-flex flex-wrap items-center gap-1 align-middle">
                        {p.initiatives.map((ini) => (
                          <button
                            key={ini.id}
                            type="button"
                            className="rounded-of border border-of-border px-1.5 py-0.5 text-[10px] text-of-muted hover:text-of-accent"
                            onClick={(e) => {
                              e.preventDefault()
                              navigate(`/initiatives?highlight=${ini.id}`)
                            }}
                          >
                            {ini.name}
                          </button>
                        ))}
                        {p.initiative_overflow > 0 ? (
                          <span className="text-[10px] text-of-muted">
                            외 {p.initiative_overflow}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                    {p.health ? (
                      <span
                        title={p.health_note ?? undefined}
                        className={`ml-1.5 rounded-of px-1.5 py-0.5 text-[10px] font-medium ${HEALTH_STYLES[p.health]}`}
                      >
                        {HEALTH_LABELS[p.health]}
                      </span>
                    ) : null}
                    {p.archived_at ? (
                      <span className="ml-1.5 rounded-of bg-of-surface-2 px-1.5 py-0.5 text-[10px] text-of-muted">
                        보관됨
                      </span>
                    ) : null}
                  </p>
                  {p.description ? (
                    <p className="truncate text-xs text-of-muted">{p.description}</p>
                  ) : null}
                </div>
                <span className="ml-auto flex shrink-0 items-center gap-3 text-xs tabular-nums text-of-muted">
                  {columns.includes('work_package_count') ? (
                    <span title="작업">{p.work_package_count}건</span>
                  ) : null}
                  {columns.includes('open_work_package_count') ? (
                    <span title="진행 중">진행 {p.open_work_package_count}</span>
                  ) : null}
                  {columns.includes('overdue_count') ? (
                    <span
                      title="기한 초과"
                      className={p.overdue_count > 0 ? 'font-medium text-of-danger' : ''}
                    >
                      초과 {p.overdue_count}
                    </span>
                  ) : null}
                  {columns.includes('member_count') ? (
                    <span title="멤버">멤버 {p.member_count}</span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
