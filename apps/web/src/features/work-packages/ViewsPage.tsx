import * as Dialog from '@radix-ui/react-dialog'
import {
  CalendarDays,
  ExternalLink,
  Filter,
  List,
  LoaderCircle,
  Lock,
  LockOpen,
  Network,
  Plus,
  Search,
  Share2,
  SquareKanban,
  Timeline,
  Trash2,
  X,
} from 'lucide-react'
import { type FormEvent, type RefObject, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'

import { FrameContextActions } from '@/components/shell/FrameContextActions'
import { ReadOnlyNotice } from '@/components/shell/ReadOnlyNotice'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useCanWrite } from '@/features/members/useCanWrite'
import { formatDateTime } from '@/lib/datetime'
import { confirmDestructive } from '@/lib/guards'
import { cn } from '@/lib/utils'

import {
  type SavedFilter,
  type ViewLayout,
  useCreateSavedFilter,
  useDeleteSavedFilter,
  useSavedFilters,
  useUpdateSavedFilter,
} from './savedFiltersApi'

type ViewScope = 'all' | 'mine' | 'shared'
type ViewSort = 'created_desc' | 'created_asc' | 'name_asc' | 'name_desc'

const LAYOUT_ROUTES: Record<ViewLayout, string> = {
  list: 'work-packages',
  board: 'board',
  tree: 'tree',
  timeline: 'timeline',
  calendar: 'calendar',
}

const LAYOUT_META: Record<ViewLayout, { label: string; icon: typeof List }> = {
  list: { label: '목록', icon: List },
  board: { label: '보드', icon: SquareKanban },
  tree: { label: '계층', icon: Network },
  timeline: { label: '타임라인', icon: Timeline },
  calendar: { label: '캘린더', icon: CalendarDays },
}

const SCOPES: Array<{ value: ViewScope; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'mine', label: '내 뷰' },
  { value: 'shared', label: '공유됨' },
]

function viewScopeFrom(value: string | null): ViewScope {
  return value === 'mine' || value === 'shared' ? value : 'all'
}

function viewSortFrom(value: string | null): ViewSort {
  return value === 'created_asc' || value === 'name_asc' || value === 'name_desc'
    ? value
    : 'created_desc'
}

function viewLayoutFrom(value: string | null): ViewLayout | 'all' {
  return value === 'list' ||
    value === 'board' ||
    value === 'tree' ||
    value === 'timeline' ||
    value === 'calendar'
    ? value
    : 'all'
}

function viewHref(projectId: string, view: SavedFilter) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(view.params)) {
    if (value) params.set(key, value)
  }
  if (view.sort) params.set('sort', view.sort)
  const query = params.toString()
  return `/projects/${projectId}/${LAYOUT_ROUTES[view.layout]}${query ? `?${query}` : ''}`
}

function CreateViewDialog({
  projectId,
  open,
  returnFocusRef,
  onOpenChange,
}: {
  projectId: string
  open: boolean
  returnFocusRef: RefObject<HTMLButtonElement | null>
  onOpenChange: (open: boolean) => void
}) {
  const create = useCreateSavedFilter(projectId)
  const [name, setName] = useState('')
  const [layout, setLayout] = useState<ViewLayout>('list')
  const [shared, setShared] = useState(false)

  const close = () => {
    if (create.isPending) return
    create.reset()
    setName('')
    setLayout('list')
    setShared(false)
    onOpenChange(false)
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!name.trim() || create.isPending) return
    create.mutate(
      {
        name: name.trim(),
        params: {},
        layout,
        sort: null,
        is_shared: shared,
      },
      { onSuccess: close },
    )
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-80 bg-black/35 backdrop-blur-[1px] data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:fade-in motion-reduce:animate-none" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-81 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-of border border-of-border bg-of-surface shadow-xl data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 motion-reduce:animate-none"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            returnFocusRef.current?.focus()
          }}
        >
          <form aria-label="새 프로젝트 뷰" onSubmit={submit}>
            <div className="border-b border-of-border px-5 py-4">
              <Dialog.Title className="text-base font-semibold">뷰 만들기</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-5 text-of-muted">
                다시 사용할 작업 범위와 기본 레이아웃을 저장합니다.
              </Dialog.Description>
            </div>
            <div className="space-y-4 px-5 py-4">
              <label className="block text-xs font-medium">
                뷰 이름
                <Input
                  autoFocus
                  value={name}
                  maxLength={80}
                  aria-label="뷰 이름"
                  placeholder="예: 이번 주 긴급 작업"
                  className="mt-1"
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="block text-xs font-medium">
                레이아웃
                <Select
                  value={layout}
                  aria-label="레이아웃"
                  className="mt-1"
                  onChange={(event) => setLayout(event.target.value as ViewLayout)}
                >
                  {Object.entries(LAYOUT_META).map(([value, item]) => (
                    <option key={value} value={value}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={shared}
                  aria-label="팀과 공유"
                  onChange={(event) => setShared(event.target.checked)}
                />
                팀과 공유
              </label>
              {create.isError ? (
                <p role="alert" className="text-xs text-of-danger">
                  뷰를 만들지 못했습니다. 잠시 후 다시 시도하세요.
                </p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-of-border px-5 py-3">
              <Button type="button" variant="outline" disabled={create.isPending} onClick={close}>
                취소
              </Button>
              <Button
                type="submit"
                disabled={!name.trim() || create.isPending}
                aria-busy={create.isPending}
              >
                {create.isPending ? <LoaderCircle className="animate-spin" /> : <Plus size={14} />}
                {create.isPending ? '저장 중' : '저장'}
              </Button>
            </div>
          </form>
          <button
            type="button"
            aria-label="뷰 만들기 창 닫기"
            disabled={create.isPending}
            className="absolute right-3 top-3 grid size-8 place-items-center rounded-of text-of-muted hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
            onClick={close}
          >
            <X size={15} />
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function ViewRow({
  view,
  projectId,
  canWrite,
}: {
  view: SavedFilter
  projectId: string
  canWrite: boolean
}) {
  const update = useUpdateSavedFilter(projectId)
  const remove = useDeleteSavedFilter(projectId)
  const editable = view.is_mine && canWrite
  const error = update.error ?? remove.error
  const layout = LAYOUT_META[view.layout]
  const LayoutIcon = layout.icon

  return (
    <li className="min-w-0 border-b border-of-border-subtle last:border-b-0">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 transition-colors hover:bg-of-surface-hover sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-of bg-of-surface-2 text-of-muted">
            <LayoutIcon size={15} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <Link
                to={viewHref(projectId, view)}
                aria-label={`${view.name} 열기`}
                className="truncate rounded-[2px] text-sm font-medium hover:text-of-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
              >
                {view.name}
              </Link>
              <Badge variant="outline">{layout.label}</Badge>
              <Badge variant={view.is_shared ? 'accent' : 'outline'}>
                {view.is_shared ? '공유' : '개인'}
              </Badge>
              {view.is_locked ? <Badge variant="neutral">잠김</Badge> : null}
            </div>
            <p className="mt-1 truncate text-[11px] text-of-muted">
              {view.is_mine ? '내가 만든 뷰' : `${view.owner_name}님이 공유`}
              <span aria-hidden="true"> · </span>
              {formatDateTime(view.created_at)}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {editable ? (
            <>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                disabled={update.isPending}
                aria-label={`${view.name} ${view.is_locked ? '잠금 해제' : '잠금'}`}
                title={view.is_locked ? '잠금 해제' : '잠금'}
                aria-pressed={view.is_locked}
                onClick={() => update.mutate({ id: view.id, is_locked: !view.is_locked })}
              >
                {view.is_locked ? <LockOpen size={13} /> : <Lock size={13} />}
              </Button>
              {!view.is_locked ? (
                <>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    disabled={update.isPending}
                    aria-label={`${view.name} ${view.is_shared ? '공유 해제' : '공유'}`}
                    title={view.is_shared ? '공유 해제' : '공유'}
                    aria-pressed={view.is_shared}
                    onClick={() => update.mutate({ id: view.id, is_shared: !view.is_shared })}
                  >
                    <Share2 size={13} />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-of-danger"
                    disabled={remove.isPending}
                    aria-label={`${view.name} 삭제`}
                    title="삭제"
                    onClick={() => {
                      if (confirmDestructive(`'${view.name}' 뷰를 삭제할까요?`)) {
                        remove.mutate(view.id)
                      }
                    }}
                  >
                    <Trash2 size={13} />
                  </Button>
                </>
              ) : null}
            </>
          ) : null}
          <Link
            to={viewHref(projectId, view)}
            aria-label={`${view.name} 빠른 열기`}
            title="뷰 열기"
            className="of-touch-target inline-flex h-7 w-7 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-2 hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
          >
            <ExternalLink size={13} />
          </Link>
        </div>
      </div>
      {error ? (
        <p role="alert" className="px-14 pb-2 text-xs text-of-danger">
          뷰를 변경하지 못했습니다.
        </p>
      ) : null}
    </li>
  )
}

export function ViewsPage() {
  const { projectId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const views = useSavedFilters(projectId)
  const canWrite = useCanWrite(projectId)
  const createTriggerRef = useRef<HTMLButtonElement>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(
    params.has('scope') || params.has('layout'),
  )

  const query = params.get('q')?.trim() ?? ''
  const scope = viewScopeFrom(params.get('scope'))
  const layoutFilter = viewLayoutFrom(params.get('layout'))
  const sort = viewSortFrom(params.get('sort'))
  const filterCount = Number(scope !== 'all') + Number(layoutFilter !== 'all')
  const items = useMemo(() => views.data?.items ?? [], [views.data?.items])

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.toLocaleLowerCase()
    return items
      .filter((view) => {
        if (scope === 'mine' && !view.is_mine) return false
        if (scope === 'shared' && !view.is_shared) return false
        if (layoutFilter !== 'all' && view.layout !== layoutFilter) return false
        return !normalizedQuery || view.name.toLocaleLowerCase().includes(normalizedQuery)
      })
      .sort((left, right) => {
        if (sort === 'created_asc') return left.created_at.localeCompare(right.created_at)
        if (sort === 'name_asc') return left.name.localeCompare(right.name, 'ko')
        if (sort === 'name_desc') return right.name.localeCompare(left.name, 'ko')
        return right.created_at.localeCompare(left.created_at)
      })
  }, [items, layoutFilter, query, scope, sort])

  const updateParams = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    Object.entries(changes).forEach(([key, value]) => {
      if (value) next.set(key, value)
      else next.delete(key)
    })
    setParams(next, { replace: true })
  }

  return (
    <div className="flex h-full min-w-0 flex-col bg-of-surface">
      <h1 className="sr-only">프로젝트 뷰</h1>
      <FrameContextActions>
        <label className="relative min-w-32 flex-1 sm:w-40 sm:flex-none">
          <span className="sr-only">프로젝트 뷰 검색</span>
          <Search
            size={13}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-of-muted"
            aria-hidden="true"
          />
          <Input
            value={query}
            aria-label="프로젝트 뷰 검색"
            placeholder="뷰 검색"
            className="h-7 pl-7 pr-7 text-xs"
            onChange={(event) => updateParams({ q: event.target.value || null })}
          />
          {query ? (
            <button
              type="button"
              aria-label="프로젝트 뷰 검색 지우기"
              className="absolute right-1 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-of text-of-muted hover:bg-of-surface-hover"
              onClick={() => updateParams({ q: null })}
            >
              <X size={12} />
            </button>
          ) : null}
        </label>
        <Select
          value={sort}
          aria-label="프로젝트 뷰 정렬"
          className="h-7 w-28 text-xs"
          onChange={(event) =>
            updateParams({
              sort: event.target.value === 'created_desc' ? null : event.target.value,
            })
          }
        >
          <option value="created_desc">최근 생성</option>
          <option value="created_asc">오래된 생성</option>
          <option value="name_asc">이름 오름차순</option>
          <option value="name_desc">이름 내림차순</option>
        </Select>
        <Button
          size="sm"
          variant="outline"
          aria-expanded={filtersOpen}
          aria-controls="project-view-filters"
          onClick={() => setFiltersOpen((open) => !open)}
        >
          <Filter size={13} />
          필터{filterCount ? ` ${filterCount}` : ''}
        </Button>
        {canWrite ? (
          <Button ref={createTriggerRef} size="sm" onClick={() => setCreateOpen(true)}>
            <Plus size={14} />
            뷰 만들기
          </Button>
        ) : null}
      </FrameContextActions>

      <div className="flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-of-border px-3 py-1">
        <nav aria-label="프로젝트 뷰 범위" className="flex min-w-0 items-stretch gap-1 overflow-x-auto">
          {SCOPES.map((item) => {
            const active = scope === item.value
            return (
              <button
                key={item.value}
                type="button"
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative inline-flex h-10 shrink-0 items-center px-2 text-xs font-medium text-of-muted transition-colors hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-of-focus',
                  active &&
                    'text-of-text after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-of-accent',
                )}
                onClick={() =>
                  updateParams({ scope: item.value === 'all' ? null : item.value })
                }
              >
                {item.label}
              </button>
            )
          })}
        </nav>
        <span className="shrink-0 text-[11px] tabular-nums text-of-muted" aria-live="polite">
          {visibleItems.length}/{items.length}
        </span>
      </div>

      {filtersOpen ? (
        <div
          id="project-view-filters"
          className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 border-b border-of-border-subtle bg-of-surface-raised px-3 py-1.5 data-[state=open]:animate-in data-[state=open]:fade-in motion-reduce:animate-none"
          data-state="open"
        >
          <Select
            value={layoutFilter}
            aria-label="프로젝트 뷰 레이아웃 필터"
            className="h-7 w-32 text-xs"
            onChange={(event) =>
              updateParams({
                layout: event.target.value === 'all' ? null : event.target.value,
              })
            }
          >
            <option value="all">모든 레이아웃</option>
            {Object.entries(LAYOUT_META).map(([value, item]) => (
              <option key={value} value={value}>
                {item.label}
              </option>
            ))}
          </Select>
          {filterCount ? (
            <Button
              size="sm"
              variant="ghost"
              aria-label="프로젝트 뷰 필터 초기화"
              onClick={() => updateParams({ scope: null, layout: null })}
            >
              <X size={13} />
              초기화
            </Button>
          ) : (
            <span className="text-[11px] text-of-muted">
              범위 또는 레이아웃을 선택해 결과를 좁힙니다.
            </span>
          )}
        </div>
      ) : null}

      <main
        data-testid="project-views-scroll"
        className="of-scrollbar min-h-0 flex-1 overflow-y-auto bg-of-bg"
      >
        {!canWrite && !views.isPending ? <ReadOnlyNotice className="mx-3 mt-3" /> : null}
        {views.isPending ? (
          <div className="p-3 sm:p-5">
            <ListSkeleton />
          </div>
        ) : views.isError ? (
          <ErrorState error={views.error} onRetry={() => views.refetch()} />
        ) : views.data.total === 0 ? (
          <EmptyState
            title="저장된 프로젝트 뷰가 없습니다"
            hint={
              canWrite
                ? '필터와 레이아웃을 재사용할 첫 뷰를 만드세요.'
                : '팀원이 공유한 뷰가 이곳에 표시됩니다.'
            }
          >
            {canWrite ? (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus size={14} />
                뷰 만들기
              </Button>
            ) : null}
          </EmptyState>
        ) : visibleItems.length === 0 ? (
          <EmptyState
            title="조건에 맞는 뷰가 없습니다"
            hint="검색어 또는 필터를 바꾸어 다시 확인하세요."
          >
            <Button
              size="sm"
              variant="outline"
              onClick={() => updateParams({ q: null, scope: null, layout: null })}
            >
              조건 지우기
            </Button>
          </EmptyState>
        ) : (
          <section aria-label="프로젝트 뷰 목록" className="min-w-0 py-2">
            <ul className="min-w-0 border-y border-of-border bg-of-surface">
              {visibleItems.map((view) => (
                <ViewRow
                  key={view.id}
                  view={view}
                  projectId={projectId}
                  canWrite={canWrite}
                />
              ))}
            </ul>
          </section>
        )}
      </main>

      <CreateViewDialog
        projectId={projectId}
        open={createOpen}
        returnFocusRef={createTriggerRef}
        onOpenChange={setCreateOpen}
      />
    </div>
  )
}
