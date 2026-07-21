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
  Star,
  X,
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { useSidebarPreferences } from '@/components/shell/sidebar-preferences'
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

import {
  getProjectDirectoryPreferences,
  projectDirectoryPreferenceWriter,
  useCreateProject,
  useProjects,
} from './api'
import {
  loadLocalProjectDirectoryPreferences,
  parseProjectDirectoryPreferences,
  ROLLUP_COLUMNS,
  saveLocalProjectDirectoryPreferences,
  type ProjectDirectoryPreferences,
  type ProjectLayout,
  type RollupKey,
} from './projectDirectoryPreferences'
import { SORT_KEYS, SORT_LABELS, sortProjects, type ProjectSortKey, type SortDir } from './sort'
import {
  HEALTH_LABELS,
  HEALTH_STYLES,
  type ProjectHealth,
  type ProjectListItem,
} from './types'
import { ProjectCover } from './ProjectCover'
import { ProjectActionsMenu } from './ProjectActionsMenu'

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
      { onSuccess: (p) => navigate(`/projects/${p.id}/overview`) },
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
  favorite,
  onFavoriteChange,
  onMessage,
}: {
  project: ProjectListItem
  columns: RollupKey[]
  onOpenInitiative: (id: string) => void
  favorite: boolean
  onFavoriteChange: (projectId: string, favorite: boolean) => void
  onMessage: (message: string) => void
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
              to={`/projects/${project.id}/overview`}
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
          {project.current_user_role === 'owner' ? (
            <Link
              to={`/projects/${project.id}/settings`}
              className="inline-flex h-7 items-center gap-1.5 rounded-of border border-of-border bg-of-surface px-2 font-medium text-of-text transition-colors hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
            >
              설정
            </Link>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-0.5">
          <button
            type="button"
            aria-label={`${project.name} ${favorite ? '즐겨찾기 해제' : '즐겨찾기에 추가'}`}
            aria-pressed={favorite}
            className={cn(
              'flex h-8 w-7 items-center justify-center rounded-of text-of-muted transition-colors hover:bg-of-surface-2 hover:text-of-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus',
              favorite && 'text-of-accent',
            )}
            onClick={() => onFavoriteChange(project.id, !favorite)}
          >
            <Star size={14} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true" />
          </button>
          <ProjectActionsMenu
            project={project}
            favorite={favorite}
            onFavoriteChange={onFavoriteChange}
            onMessage={onMessage}
            placement="directory"
            triggerLabel={`${project.name} 프로젝트 목록 작업`}
          />
        </div>
      </div>
    </li>
  )
}

function ProjectCard({
  project,
  columns,
  onOpenInitiative,
  favorite,
  onFavoriteChange,
  onMessage,
}: {
  project: ProjectListItem
  columns: RollupKey[]
  onOpenInitiative: (id: string) => void
  favorite: boolean
  onFavoriteChange: (projectId: string, favorite: boolean) => void
  onMessage: (message: string) => void
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
    <li className="group flex min-h-64 min-w-0 flex-col overflow-hidden rounded-of border border-of-border bg-of-surface transition-[border-color,box-shadow] hover:border-of-border-strong hover:shadow-[var(--of-shadow-sm)]">
      <ProjectCover
        projectKey={project.key}
        projectName={project.name}
        attachmentId={project.cover_attachment_id}
        className="h-24 shrink-0 border-b border-of-border"
      >
        <Link
          to={`/projects/${project.id}/overview`}
          aria-label={`${project.name} Overview 열기`}
          className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
        />
        <span className="pointer-events-none absolute bottom-2 left-3 flex h-8 w-8 items-center justify-center rounded-of border border-white/50 bg-white/90 font-mono text-[11px] font-semibold text-of-accent shadow-sm">
          {project.key.slice(0, 2)}
        </span>
        <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
          <button
            type="button"
            aria-label={`${project.name} ${favorite ? '즐겨찾기 해제' : '즐겨찾기에 추가'}`}
            aria-pressed={favorite}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-of border border-white/60 bg-white/90 text-of-muted shadow-sm backdrop-blur-sm transition-colors hover:bg-white hover:text-of-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
              favorite && 'text-of-accent',
            )}
            onClick={() => onFavoriteChange(project.id, !favorite)}
          >
            <Star size={14} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true" />
          </button>
          <ProjectActionsMenu
            project={project}
            favorite={favorite}
            onFavoriteChange={onFavoriteChange}
            onMessage={onMessage}
            placement="directory"
            triggerLabel={`${project.name} 프로젝트 카드 작업`}
            triggerClassName="h-8 w-8 border border-white/60 bg-white/90 text-of-muted shadow-sm backdrop-blur-sm hover:bg-white hover:text-of-text focus-visible:ring-white"
          />
        </div>
      </ProjectCover>

      <div className="flex min-h-0 flex-1 flex-col p-3">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              to={`/projects/${project.id}/overview`}
              className="block truncate text-sm font-semibold hover:text-of-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
            >
              {project.name}
            </Link>
            <p className="truncate font-mono text-[11px] text-of-muted">{project.key}</p>
          </div>
          <ProjectHealthBadge health={project.health} note={project.health_note} />
        </div>
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
          {project.current_user_role === 'owner' ? (
            <Link
              to={`/projects/${project.id}/settings`}
              className="inline-flex h-7 items-center rounded-of px-2 text-xs font-medium text-of-secondary hover:bg-of-surface-2 hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
            >
              설정
            </Link>
          ) : null}
          <Link
            to={`/projects/${project.id}/overview`}
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
  const queryClient = useQueryClient()
  const sidebarPreferences = useSidebarPreferences()
  const [searchParams, setSearchParams] = useSearchParams()
  const [includeArchived, setIncludeArchived] = useState(false)
  const [legacyPreferences] = useState(loadLocalProjectDirectoryPreferences)
  const [preferences, setPreferences] = useState<ProjectDirectoryPreferences>(
    legacyPreferences.preferences,
  )
  const [preferenceSyncStatus, setPreferenceSyncStatus] = useState(
    projectDirectoryPreferenceWriter.getStatus(),
  )
  const migrationAttempted = useRef(false)
  const userChangedPreferences = useRef(false)
  const { columns, sort, layout } = preferences
  const [query, setQuery] = useState('')
  const [projectActionMessage, setProjectActionMessage] = useState('')
  const createRequested = searchParams.get('new') === '1'
  const [creating, setCreating] = useState(createRequested)
  const capabilities = useWorkspaceCapabilities()
  const initiativesEnabled = capabilities.data?.initiatives.enabled === true
  const availableColumns = initiativesEnabled
    ? ROLLUP_COLUMNS
    : ROLLUP_COLUMNS.filter((column) => column.key !== 'initiatives')
  const visibleColumns = columns.filter(
    (column) => column !== 'initiatives' || initiativesEnabled,
  )

  const { data, isPending, isFetching, isError, error, refetch } = useProjects(includeArchived)
  const preferenceQuery = useQuery({
    queryKey: ['me', 'project-directory-preferences'],
    queryFn: getProjectDirectoryPreferences,
  })

  useEffect(() => {
    if (!projectActionMessage) return
    const timer = window.setTimeout(() => setProjectActionMessage(''), 3200)
    return () => window.clearTimeout(timer)
  }, [projectActionMessage])

  useEffect(() => {
    if (createRequested) setCreating(true)
  }, [createRequested])

  useEffect(
    () => projectDirectoryPreferenceWriter.subscribeStatus(setPreferenceSyncStatus),
    [],
  )

  useEffect(
    () =>
      projectDirectoryPreferenceWriter.subscribeSaved((saved) => {
        queryClient.setQueryData(['me', 'project-directory-preferences'], saved)
      }),
    [queryClient],
  )

  useEffect(() => {
    if (!preferenceQuery.data) return
    if (userChangedPreferences.current) return
    if (preferenceSyncStatus !== 'idle') return
    if (!preferenceQuery.data.is_default) {
      const hydrated = parseProjectDirectoryPreferences(preferenceQuery.data)
      if (!hydrated) return
      setPreferences(hydrated)
      saveLocalProjectDirectoryPreferences(hydrated)
      return
    }
    if (
      !migrationAttempted.current &&
      !userChangedPreferences.current &&
      legacyPreferences.hasLegacy &&
      legacyPreferences.isValid
    ) {
      migrationAttempted.current = true
      projectDirectoryPreferenceWriter.queue(legacyPreferences.preferences)
    }
  }, [legacyPreferences, preferenceQuery.data, preferenceSyncStatus])

  const closeCreate = () => {
    setCreating(false)
    if (!createRequested) return
    const next = new URLSearchParams(searchParams)
    next.delete('new')
    setSearchParams(next, { replace: true })
  }

  const changeSort = (next: { key: ProjectSortKey; dir: SortDir }) => {
    userChangedPreferences.current = true
    const updated = { ...preferences, sort: next }
    setPreferences(updated)
    saveLocalProjectDirectoryPreferences(updated)
    projectDirectoryPreferenceWriter.queue(updated)
  }

  const toggleColumn = (key: RollupKey) => {
    userChangedPreferences.current = true
    const next = columns.includes(key) ? columns.filter((column) => column !== key) : [...columns, key]
    const updated = { ...preferences, columns: next }
    setPreferences(updated)
    saveLocalProjectDirectoryPreferences(updated)
    projectDirectoryPreferenceWriter.queue(updated)
  }

  const changeLayout = (next: ProjectLayout) => {
    userChangedPreferences.current = true
    const updated = { ...preferences, layout: next }
    setPreferences(updated)
    saveLocalProjectDirectoryPreferences(updated)
    projectDirectoryPreferenceWriter.queue(updated)
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
    <div className="flex min-h-full w-full flex-col bg-of-surface">
      <div className="sticky top-0 z-20 border-b border-of-border bg-of-surface/95 shadow-[var(--of-shadow-sm)] backdrop-blur">
        <section aria-label="프로젝트 요약" className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-of-border-subtle px-4 py-2 text-xs sm:px-6">
          <span><span className="text-of-muted">활성</span> <strong className="ml-1 font-semibold tabular-nums text-of-accent">{summary.active}</strong></span>
          <span><span className="text-of-muted">보관</span> <strong className="ml-1 font-semibold tabular-nums">{summary.archived}</strong></span>
          <span><span className="text-of-muted">열린 작업</span> <strong className="ml-1 font-semibold tabular-nums">{summary.open}</strong></span>
          <span><span className="text-of-muted">기한 초과</span> <strong className={cn('ml-1 font-semibold tabular-nums', summary.overdue > 0 && 'text-of-danger')}>{summary.overdue}</strong></span>
          {initiativesEnabled ? (
            <span><span className="text-of-muted">이니셔티브</span> <strong className="ml-1 font-semibold tabular-nums">{summary.initiatives}</strong></span>
          ) : null}
          <span className="ml-auto text-[11px] text-of-muted" aria-live="polite">{resultText}</span>
          <Button size="sm" onClick={() => setCreating(true)} disabled={creating}>
            <Plus size={14} /> 새 프로젝트
          </Button>
        </section>

        <section
          aria-label="프로젝트 보기 제어"
          className="flex flex-col gap-2 px-4 py-2 md:flex-row md:items-center md:justify-between sm:px-6"
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
                선택한 열은 브라우저와 계정에 저장됩니다.
              </DropdownMenuLabel>
            </DropdownMenuContent>
          </DropdownMenu>
          {preferenceQuery.isFetching ? (
            <span className="text-[11px] text-of-muted" aria-live="polite">
              보기 설정 불러오는 중
            </span>
          ) : preferenceQuery.isError ? (
            <span className="flex items-center gap-1 text-[11px] text-of-danger" role="status">
              브라우저 설정 사용 중
              <button
                type="button"
                className="underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                onClick={() => void preferenceQuery.refetch()}
              >
                재시도
              </button>
            </span>
          ) : preferenceSyncStatus === 'pending' ? (
            <span className="text-[11px] text-of-muted" aria-live="polite">
              보기 설정 저장 중
            </span>
          ) : preferenceSyncStatus === 'error' ? (
            <span className="flex items-center gap-1 text-[11px] text-of-danger" role="status">
              보기 설정 저장 실패
              <button
                type="button"
                className="underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                onClick={() => projectDirectoryPreferenceWriter.retry()}
              >
                재시도
              </button>
            </span>
          ) : null}
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
      </div>

      {creating ? <div className="mx-auto w-full max-w-7xl px-4 py-3 sm:px-6"><NewProjectForm onClose={closeCreate} /></div> : null}

      {data.total === 0 && !creating ? (
        <div className="px-4 sm:px-6"><EmptyState title="아직 프로젝트가 없습니다" hint="첫 프로젝트를 만들어 시작하세요.">
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} /> 새 프로젝트
          </Button>
        </EmptyState></div>
      ) : visibleProjects.length === 0 ? (
        <div className="px-4 sm:px-6"><EmptyState title="조건에 맞는 프로젝트가 없습니다" hint="검색어를 지우거나 보관 포함을 켜 보세요.">
          {query ? (
            <Button size="sm" variant="outline" onClick={() => setQuery('')}>
              검색 지우기
            </Button>
          ) : null}
        </EmptyState></div>
      ) : (
        <section className={cn('mx-auto w-full max-w-7xl min-w-0 px-4 py-3 sm:px-6', layout === 'list' && 'overflow-hidden rounded-of')}>
          {layout === 'list' ? (
            <div className="hidden grid-cols-[minmax(0,1.5fr)_9rem_minmax(12rem,0.8fr)_14rem_4rem] border-b border-of-border bg-of-surface-2 px-4 py-2 text-[11px] font-medium text-of-muted md:grid">
              <span>프로젝트</span>
              <span>상태</span>
              <span className="text-right">롤업</span>
              <span className="text-right">바로가기</span>
              <span className="text-right">작업</span>
            </div>
          ) : null}
          <div className={cn(layout === 'list' && 'overflow-hidden rounded-of border border-of-border bg-of-surface')}>
          <ul aria-label="프로젝트 디렉터리" className={cn(layout === 'grid' ? 'grid gap-3 md:grid-cols-2 2xl:grid-cols-3' : 'divide-y divide-of-border')}>
            {visibleProjects.map((project) => (
              layout === 'grid' ? (
                <ProjectCard
                  key={project.id}
                  project={project}
                  columns={visibleColumns}
                  onOpenInitiative={(id) => navigate(`/initiatives?highlight=${id}`)}
                  favorite={sidebarPreferences.preferences.favoriteProjectIds.includes(project.id)}
                  onFavoriteChange={sidebarPreferences.setFavoriteProject}
                  onMessage={setProjectActionMessage}
                />
              ) : (
                <ProjectRow
                  key={project.id}
                  project={project}
                  columns={visibleColumns}
                  onOpenInitiative={(id) => navigate(`/initiatives?highlight=${id}`)}
                  favorite={sidebarPreferences.preferences.favoriteProjectIds.includes(project.id)}
                  onFavoriteChange={sidebarPreferences.setFavoriteProject}
                  onMessage={setProjectActionMessage}
                />
              )
            ))}
          </ul>
          </div>
        </section>
      )}
      {projectActionMessage ? (
        <div
          role="status"
          aria-label="프로젝트 작업 결과"
          className="fixed bottom-4 left-1/2 z-[80] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-of border border-of-border bg-of-surface-raised px-3 py-2 text-xs text-of-text shadow-[var(--of-shadow-popover)]"
        >
          {projectActionMessage}
        </div>
      ) : null}
    </div>
  )
}
