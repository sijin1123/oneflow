import {
  Archive,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  LayoutGrid,
  List,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useWorkspaceCapabilities } from '@/features/workspace-features/api'

import { useCreateProject, useProjects } from './api'
import { SORT_KEYS, SORT_LABELS, sortProjects, type ProjectSortKey, type SortDir } from './sort'
import {
  HEALTH_LABELS,
  HEALTH_STYLES,
  type ProjectHealth,
  type ProjectListItem,
} from './types'

const KEY_RE = /^[A-Z][A-Z0-9]{1,9}$/

const ROLLUP_COLUMNS = [
  { key: 'initiatives', label: '이니셔티브' },
  { key: 'work_package_count', label: '작업' },
  { key: 'open_work_package_count', label: '진행 중' },
  { key: 'overdue_count', label: '기한 초과' },
  { key: 'member_count', label: '멤버' },
] as const

type RollupKey = (typeof ROLLUP_COLUMNS)[number]['key']
const COLUMNS_STORAGE_KEY = 'oneflow.projects.columns.v1'
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
    return parsed.filter((k): k is RollupKey => ROLLUP_COLUMNS.some((c) => c.key === k))
  } catch {
    return DEFAULT_COLUMNS
  }
}

const SORT_STORAGE_KEY = 'oneflow.projects.sort.v1'
const LAYOUT_STORAGE_KEY = 'oneflow.projects.layout.v1'
type ProjectLayout = 'grid' | 'list'

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

function loadLayout(): ProjectLayout {
  try {
    return localStorage.getItem(LAYOUT_STORAGE_KEY) === 'list' ? 'list' : 'grid'
  } catch {
    return 'grid'
  }
}

function saveLayout(layout: ProjectLayout) {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, layout)
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
    <form
      aria-label="새 프로젝트 생성"
      className="rounded-of border border-of-border bg-of-surface p-4 shadow-[var(--of-shadow-card)]"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div className="mb-4 flex min-w-0 flex-col gap-2 border-b border-of-border pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold">새 프로젝트</p>
          <p className="mt-1 text-xs leading-5 text-of-muted">
            작업 방식, 상태, 필드 구성을 담을 프로젝트 공간을 만듭니다.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          취소
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem]">
        <div className="space-y-1">
          <label htmlFor="np-name" className="text-xs font-medium text-of-muted">
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
          <label htmlFor="np-key" className="text-xs font-medium text-of-muted">
            키 (대문자·숫자 2–10자)
          </label>
          <Input
            id="np-key"
            value={key}
            onChange={(e) => setKey(e.target.value.toUpperCase())}
            placeholder="ONE"
            aria-invalid={key.length > 0 && !keyValid}
            className="font-mono"
          />
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,0.7fr)]">
        <div className="space-y-1">
          <label htmlFor="np-desc" className="text-xs font-medium text-of-muted">
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
          <label htmlFor="np-template" className="text-xs font-medium text-of-muted">
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
      </div>

      <div className="mt-3 min-h-5">
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
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" type="submit" disabled={!canSubmit}>
          만들기
        </Button>
      </div>
    </form>
  )
}

function ProjectHealthBadge({ health, note }: { health: ProjectHealth | null; note: string | null }) {
  if (!health) return <Badge variant="outline">상태 미설정</Badge>
  return (
    <span
      title={note ?? undefined}
      className={cn('inline-flex min-h-5 items-center rounded-full px-2 text-xs font-medium', HEALTH_STYLES[health])}
    >
      {HEALTH_LABELS[health]}
    </span>
  )
}

function ProjectInitiatives({
  project,
  enabled,
  onOpen,
}: {
  project: ProjectListItem
  enabled: boolean
  onOpen: (id: string) => void
}) {
  if (!enabled || project.initiatives.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {project.initiatives.map((ini) => (
        <button
          key={ini.id}
          type="button"
          className="rounded-of border border-of-border bg-of-surface px-1.5 py-0.5 text-[11px] text-of-muted transition-colors hover:border-of-accent hover:text-of-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
          onClick={(e) => {
            e.preventDefault()
            onOpen(ini.id)
          }}
        >
          {ini.name}
        </button>
      ))}
      {project.initiative_overflow > 0 ? (
        <span className="text-[11px] text-of-muted">외 {project.initiative_overflow}</span>
      ) : null}
    </div>
  )
}

function RollupCells({ project, columns }: { project: ProjectListItem; columns: RollupKey[] }) {
  const values: Array<{ key: RollupKey; label: string; value: string; tone?: string }> = [
    { key: 'work_package_count', label: '작업', value: `${project.work_package_count}건` },
    {
      key: 'open_work_package_count',
      label: '진행',
      value: `진행 ${project.open_work_package_count}`,
    },
    {
      key: 'overdue_count',
      label: '초과',
      value: `초과 ${project.overdue_count}`,
      tone: project.overdue_count > 0 ? 'text-of-danger font-medium' : undefined,
    },
    { key: 'member_count', label: '멤버', value: `멤버 ${project.member_count}` },
  ]

  return (
    <div className="grid grid-cols-2 gap-2 text-xs text-of-muted sm:flex sm:flex-wrap sm:justify-end">
      {values
        .filter((item) => columns.includes(item.key))
        .map((item) => (
          <span
            key={item.key}
            title={item.label}
            className={cn(
              'min-w-0 rounded-of border border-of-border bg-of-surface-2 px-2 py-1 text-center tabular-nums sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:text-right',
              item.tone,
            )}
          >
            {item.value}
          </span>
        ))}
    </div>
  )
}

function ProjectRow({
  project,
  columns,
  onOpenInitiative,
}: {
  project: ProjectListItem
  columns: RollupKey[]
  onOpenInitiative: (id: string) => void
}) {
  const archived = Boolean(project.archived_at)

  return (
    <li className="group border-b border-of-border last:border-b-0">
      <div className="grid min-w-0 gap-3 px-3 py-3 transition-colors group-hover:bg-of-surface-hover md:grid-cols-[minmax(0,1.5fr)_9rem_minmax(12rem,0.8fr)_14rem_auto] md:items-center md:px-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-of bg-of-accent-soft font-mono text-[11px] font-semibold text-of-accent">
            {project.key.slice(0, 2)}
          </span>
          <div className="min-w-0">
            <Link
              to={`/projects/${project.id}/work-packages`}
              className="block truncate rounded-of text-sm font-semibold transition-colors hover:text-of-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
            >
              <span className="mr-2 font-mono text-xs text-of-muted">{project.key}</span>
              {project.name}
            </Link>
            {project.description ? (
              <p className="mt-1 truncate text-xs leading-5 text-of-muted">{project.description}</p>
            ) : null}
            <ProjectInitiatives
              project={project}
              enabled={columns.includes('initiatives')}
              onOpen={onOpenInitiative}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 md:justify-start">
          <ProjectHealthBadge health={project.health} note={project.health_note} />
          {archived ? (
            <Badge variant="outline" className="rounded-full">
              보관됨
            </Badge>
          ) : null}
        </div>

        <RollupCells project={project} columns={columns} />

        <div className="flex flex-wrap items-center gap-2 text-xs text-of-muted md:justify-end">
          <Link
            to={`/projects/${project.id}/dashboard`}
            className="inline-flex h-7 items-center gap-1.5 rounded-of border border-of-border bg-of-surface px-2 font-medium text-of-text transition-colors hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
          >
            대시보드
          </Link>
          <Link
            to={`/projects/${project.id}/settings`}
            className="inline-flex h-7 items-center gap-1.5 rounded-of border border-of-border bg-of-surface px-2 font-medium text-of-text transition-colors hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
          >
            설정
          </Link>
        </div>

        <ArrowUpRight
          size={15}
          aria-hidden="true"
          className="hidden justify-self-end text-of-muted transition-colors group-hover:text-of-accent md:block"
        />
      </div>
    </li>
  )
}

function ProjectCard({
  project,
  columns,
  onOpenInitiative,
}: {
  project: ProjectListItem
  columns: RollupKey[]
  onOpenInitiative: (id: string) => void
}) {
  const archived = Boolean(project.archived_at)
  const progress = project.work_package_count
    ? Math.round(
        ((project.work_package_count - project.open_work_package_count) /
          project.work_package_count) *
          100,
      )
    : 0

  return (
    <li className="group flex min-h-52 min-w-0 flex-col overflow-hidden rounded-of border border-of-border bg-of-surface transition-colors hover:border-of-border-strong hover:bg-of-surface-hover">
      <div className="flex min-h-14 items-center gap-3 border-b border-of-border bg-of-surface-2 px-3 py-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-of bg-of-accent-soft font-mono text-[11px] font-semibold text-of-accent">
          {project.key.slice(0, 2)}
        </span>
        <div className="min-w-0 flex-1">
          <Link
            to={`/projects/${project.id}/work-packages`}
            className="block truncate text-sm font-semibold hover:text-of-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
          >
            {project.name}
          </Link>
          <p className="truncate font-mono text-[11px] text-of-muted">{project.key}</p>
        </div>
        <ProjectHealthBadge health={project.health} note={project.health_note} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-3">
        <p className="min-h-10 line-clamp-2 text-xs leading-5 text-of-muted">
          {project.description || '프로젝트 설명이 없습니다.'}
        </p>
        <ProjectInitiatives
          project={project}
          enabled={columns.includes('initiatives')}
          onOpen={onOpenInitiative}
        />
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[11px] text-of-muted">
            <span>완료 흐름</span>
            <span className="tabular-nums">{progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-of-surface-3">
            <span className="block h-full rounded-full bg-of-accent" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="mt-3">
          <RollupCells project={project} columns={columns} />
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-of-border px-3 py-2">
        {archived ? <Badge variant="outline">보관됨</Badge> : <Badge variant="accent">참여 중</Badge>}
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            to={`/projects/${project.id}/dashboard`}
            className="inline-flex h-7 items-center rounded-of px-2 text-xs font-medium text-of-secondary hover:bg-of-surface-2 hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
          >
            대시보드
          </Link>
          <Link
            to={`/projects/${project.id}/settings`}
            className="inline-flex h-7 items-center rounded-of px-2 text-xs font-medium text-of-secondary hover:bg-of-surface-2 hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
          >
            설정
          </Link>
          <Link
            to={`/projects/${project.id}/work-packages`}
            aria-label={`${project.name} 열기`}
            className="flex h-7 w-7 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-2 hover:text-of-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
          >
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </li>
  )
}

function matchesProject(project: ProjectListItem, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [
    project.key,
    project.name,
    project.description ?? '',
    ...project.initiatives.map((initiative) => initiative.name),
  ].some((value) => value.toLowerCase().includes(q))
}

export function ProjectsPage() {
  const navigate = useNavigate()
  const [includeArchived, setIncludeArchived] = useState(false)
  const [columns, setColumns] = useState<RollupKey[]>(loadColumns)
  const [sort, setSort] = useState<{ key: ProjectSortKey; dir: SortDir }>(loadSort)
  const [layout, setLayout] = useState<ProjectLayout>(loadLayout)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const capabilities = useWorkspaceCapabilities()
  const initiativesEnabled = capabilities.data?.initiatives.enabled === true
  const availableColumns = initiativesEnabled
    ? ROLLUP_COLUMNS
    : ROLLUP_COLUMNS.filter((column) => column.key !== 'initiatives')
  const visibleColumns = columns.filter(
    (column) => column !== 'initiatives' || initiativesEnabled,
  )

  const { data, isPending, isFetching, isError, error, refetch } = useProjects(includeArchived)

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

  const changeLayout = (next: ProjectLayout) => {
    setLayout(next)
    saveLayout(next)
  }

  const summary = useMemo(() => {
    const items = data?.items ?? []
    return {
      total: data?.total ?? 0,
      active: items.filter((project) => !project.archived_at).length,
      archived: items.filter((project) => project.archived_at).length,
      open: items.reduce((sum, project) => sum + project.open_work_package_count, 0),
      overdue: items.reduce((sum, project) => sum + project.overdue_count, 0),
      initiatives: items.reduce(
        (sum, project) => sum + project.initiatives.length + project.initiative_overflow,
        0,
      ),
    }
  }, [data])

  const visibleProjects = useMemo(() => {
    if (!data) return []
    return sortProjects(data.items, sort.key, sort.dir).filter((project) =>
      matchesProject(project, query),
    )
  }, [data, query, sort.dir, sort.key])

  if (isPending) return <ListSkeleton />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />

  const resultText = query.trim()
    ? `${summary.total}개 중 ${visibleProjects.length}개 표시`
    : `${summary.total}개 프로젝트`

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col px-4 py-3 sm:px-6">
      <header className="flex min-h-12 min-w-0 flex-col gap-3 border-b border-of-border py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <h1 className="text-sm font-semibold">프로젝트</h1>
            <p className="text-[11px] text-of-muted">워크스페이스 디렉터리 · {resultText}</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setCreating(true)} disabled={creating}>
          <Plus size={14} /> 새 프로젝트
        </Button>
      </header>

      <section aria-label="프로젝트 요약" className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-of-border py-2.5 text-xs">
        <span><span className="text-of-muted">활성</span> <strong className="ml-1 font-semibold tabular-nums text-of-accent">{summary.active}</strong></span>
        <span><span className="text-of-muted">보관</span> <strong className="ml-1 font-semibold tabular-nums">{summary.archived}</strong></span>
        <span><span className="text-of-muted">열린 작업</span> <strong className="ml-1 font-semibold tabular-nums">{summary.open}</strong></span>
        <span><span className="text-of-muted">기한 초과</span> <strong className={cn('ml-1 font-semibold tabular-nums', summary.overdue > 0 && 'text-of-danger')}>{summary.overdue}</strong></span>
        {initiativesEnabled ? (
          <span><span className="text-of-muted">이니셔티브</span> <strong className="ml-1 font-semibold tabular-nums">{summary.initiatives}</strong></span>
        ) : null}
      </section>

      {creating ? <div className="py-3"><NewProjectForm onClose={() => setCreating(false)} /></div> : null}

      <section
        aria-label="프로젝트 보기 제어"
        className="flex flex-col gap-2 border-b border-of-border py-2.5 md:flex-row md:items-center md:justify-between"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-of-muted"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="프로젝트 검색"
              aria-label="프로젝트 검색어"
              className="h-7 pl-8 pr-8 text-xs"
            />
            {query ? (
              <button
                type="button"
                aria-label="프로젝트 검색어 지우기"
                className="absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-of text-of-muted transition-colors hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                onClick={() => setQuery('')}
              >
                <X size={12} aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <label className="flex min-h-7 items-center gap-2 rounded-of border border-of-border px-2 text-xs text-of-muted">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              className="h-3 w-3 accent-of-accent"
            />
            <Archive size={13} aria-hidden="true" />
            보관 포함
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="프로젝트 정렬"
            className="h-7 w-36 text-xs"
            value={sort.key}
            onChange={(e) => changeSort({ ...sort, key: e.target.value as ProjectSortKey })}
          >
            {SORT_KEYS.map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`정렬 방향 (${sort.dir === 'asc' ? '오름차순' : '내림차순'})`}
            className="h-7 w-7"
            disabled={sort.key === 'default'}
            onClick={() => changeSort({ ...sort, dir: sort.dir === 'asc' ? 'desc' : 'asc' })}
          >
            {sort.dir === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
          </Button>
          <div className="flex h-7 items-center rounded-of border border-of-border bg-of-surface p-0.5" role="group" aria-label="프로젝트 레이아웃">
            <button
              type="button"
              aria-label="카드 보기"
              aria-pressed={layout === 'grid'}
              className={cn('flex h-6 w-7 items-center justify-center rounded-[4px] text-of-muted hover:text-of-text', layout === 'grid' && 'bg-of-surface-selected text-of-accent')}
              onClick={() => changeLayout('grid')}
            >
              <LayoutGrid size={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="목록 보기"
              aria-pressed={layout === 'list'}
              className={cn('flex h-6 w-7 items-center justify-center rounded-[4px] text-of-muted hover:text-of-text', layout === 'list' && 'bg-of-surface-selected text-of-accent')}
              onClick={() => changeLayout('list')}
            >
              <List size={13} aria-hidden="true" />
            </button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <SlidersHorizontal size={13} /> 표시
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>프로젝트 열</DropdownMenuLabel>
              {availableColumns.map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.key}
                  checked={columns.includes(column.key)}
                  onCheckedChange={() => toggleColumn(column.key)}
                  aria-label={`${column.label} 열 표시`}
                >
                  {column.label}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="pb-1">
                선택한 열은 이 브라우저에 저장됩니다.
              </DropdownMenuLabel>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="icon"
            aria-label="프로젝트 새로고침"
            className="h-7 w-7"
            onClick={() => refetch()}
          >
            <RefreshCw size={13} className={isFetching ? 'animate-spin' : undefined} />
          </Button>
        </div>
      </section>

      {data.total === 0 && !creating ? (
        <EmptyState title="아직 프로젝트가 없습니다" hint="첫 프로젝트를 만들어 시작하세요.">
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} /> 새 프로젝트
          </Button>
        </EmptyState>
      ) : visibleProjects.length === 0 ? (
        <EmptyState title="조건에 맞는 프로젝트가 없습니다" hint="검색어를 지우거나 보관 포함을 켜 보세요.">
          {query ? (
            <Button size="sm" variant="outline" onClick={() => setQuery('')}>
              검색 지우기
            </Button>
          ) : null}
        </EmptyState>
      ) : (
        <section className={cn('min-w-0 py-3', layout === 'list' && 'overflow-hidden rounded-of border border-of-border bg-of-surface')}>
          {layout === 'list' ? (
            <div className="hidden grid-cols-[minmax(0,1.5fr)_9rem_minmax(12rem,0.8fr)_14rem_2rem] border-b border-of-border bg-of-surface-2 px-4 py-2 text-[11px] font-medium text-of-muted md:grid">
              <span>프로젝트</span>
              <span>상태</span>
              <span className="text-right">롤업</span>
              <span className="text-right">바로가기</span>
              <span className="sr-only">열기</span>
            </div>
          ) : null}
          <ul aria-label="프로젝트 디렉터리" className={cn(layout === 'grid' ? 'grid gap-3 md:grid-cols-2 xl:grid-cols-3' : 'divide-y divide-of-border')}>
            {visibleProjects.map((project) => (
              layout === 'grid' ? (
                <ProjectCard key={project.id} project={project} columns={visibleColumns} onOpenInitiative={(id) => navigate(`/initiatives?highlight=${id}`)} />
              ) : (
                <ProjectRow key={project.id} project={project} columns={visibleColumns} onOpenInitiative={(id) => navigate(`/initiatives?highlight=${id}`)} />
              )
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
