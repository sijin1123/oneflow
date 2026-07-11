import {
  Bookmark,
  ExternalLink,
  LayoutGrid,
  List,
  LoaderCircle,
  Lock,
  LockOpen,
  Plus,
  Share2,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useCanWrite } from '@/features/members/useCanWrite'
import { confirmDestructive } from '@/lib/guards'

import {
  type SavedFilter,
  type ViewLayout,
  useCreateSavedFilter,
  useDeleteSavedFilter,
  useSavedFilters,
  useUpdateSavedFilter,
} from './savedFiltersApi'

const LAYOUT_ROUTES: Record<ViewLayout, string> = {
  list: 'work-packages',
  board: 'board',
  tree: 'tree',
  timeline: 'timeline',
  calendar: 'calendar',
}

const LAYOUT_LABELS: Record<ViewLayout, string> = {
  list: '목록',
  board: '보드',
  tree: '계층',
  timeline: '타임라인',
  calendar: '캘린더',
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

function ViewCard({ view, projectId, canWrite }: { view: SavedFilter; projectId: string; canWrite: boolean }) {
  const update = useUpdateSavedFilter(projectId)
  const remove = useDeleteSavedFilter(projectId)
  const editable = view.is_mine && canWrite
  const error = update.error ?? remove.error

  return (
    <li className="grid min-w-0 gap-3 rounded-of border border-of-border bg-of-surface p-3 shadow-[var(--of-shadow-hairline)]">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <h2 className="truncate text-sm font-semibold">{view.name}</h2>
            <Badge variant="outline">{LAYOUT_LABELS[view.layout]}</Badge>
            <Badge variant={view.is_shared ? 'accent' : 'outline'}>
              {view.is_shared ? '공유' : '개인'}
            </Badge>
            {view.is_locked ? <Badge variant="neutral">잠김</Badge> : null}
          </div>
          <p className="mt-1 text-[11px] text-of-muted">
            {view.is_mine ? '내가 만든 뷰' : `${view.owner_name}님이 공유`}
          </p>
        </div>
        <Link
          to={viewHref(projectId, view)}
          aria-label={`${view.name} 열기`}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-of border border-of-border bg-of-surface px-2 text-xs font-medium hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
        >
          <ExternalLink size={13} /> 열기
        </Link>
      </div>

      {editable ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-of-border pt-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={update.isPending}
            aria-pressed={view.is_locked}
            onClick={() => update.mutate({ id: view.id, is_locked: !view.is_locked })}
          >
            {view.is_locked ? <LockOpen size={13} /> : <Lock size={13} />}
            {view.is_locked ? '잠금 해제' : '잠금'}
          </Button>
          {!view.is_locked ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                disabled={update.isPending}
                aria-pressed={view.is_shared}
                onClick={() => update.mutate({ id: view.id, is_shared: !view.is_shared })}
              >
                <Share2 size={13} /> {view.is_shared ? '공유 해제' : '공유'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={remove.isPending}
                onClick={() => {
                  if (confirmDestructive(`'${view.name}' 뷰를 삭제할까요?`)) remove.mutate(view.id)
                }}
              >
                <Trash2 size={13} /> 삭제
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
      {error ? <p role="alert" className="text-xs text-of-danger">뷰를 변경하지 못했습니다.</p> : null}
    </li>
  )
}

export function ViewsPage() {
  const { projectId = '' } = useParams()
  const views = useSavedFilters(projectId)
  const create = useCreateSavedFilter(projectId)
  const canWrite = useCanWrite(projectId)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [layout, setLayout] = useState<ViewLayout>('list')
  const [shared, setShared] = useState(false)

  if (views.isPending) return <ListSkeleton />
  if (views.isError) return <ErrorState error={views.error} onRetry={() => views.refetch()} />

  const submit = () => {
    create.mutate(
      { name: name.trim(), params: {}, layout, sort: null, is_shared: shared },
      {
        onSuccess: () => {
          setName('')
          setLayout('list')
          setShared(false)
          setCreating(false)
        },
      },
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-4 px-4 py-5 sm:px-6">
      <header className="flex min-w-0 flex-col gap-3 border-b border-of-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase text-of-muted">Project workspace</p>
          <h1 className="mt-1 flex items-center gap-2 text-base font-semibold">
            <Bookmark size={17} aria-hidden="true" /> 프로젝트 뷰
          </h1>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">
            반복해서 사용하는 필터와 레이아웃을 저장하고 팀과 공유합니다.
          </p>
        </div>
        {canWrite ? (
          <Button size="sm" onClick={() => setCreating(true)} disabled={creating}>
            <Plus size={14} /> 뷰 만들기
          </Button>
        ) : null}
      </header>

      {creating ? (
        <form
          aria-label="새 프로젝트 뷰"
          className="grid gap-3 border-b border-of-border pb-4 sm:grid-cols-[minmax(12rem,1fr)_9rem_auto_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault()
            if (name.trim()) submit()
          }}
        >
          <label className="space-y-1 text-xs font-medium text-of-muted">
            뷰 이름
            <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoFocus />
          </label>
          <label className="space-y-1 text-xs font-medium text-of-muted">
            레이아웃
            <Select value={layout} onChange={(event) => setLayout(event.target.value as ViewLayout)}>
              {Object.entries(LAYOUT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </label>
          <label className="flex h-8 items-center gap-2 text-xs text-of-muted">
            <input type="checkbox" checked={shared} onChange={(event) => setShared(event.target.checked)} /> 팀과 공유
          </label>
          <div className="flex gap-1.5">
            <Button size="sm" type="submit" disabled={!name.trim() || create.isPending}>
              {create.isPending ? <LoaderCircle className="animate-spin" /> : <LayoutGrid size={13} />} 저장
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>취소</Button>
          </div>
          {create.isError ? <p role="alert" className="text-xs text-of-danger sm:col-span-4">뷰를 만들지 못했습니다.</p> : null}
        </form>
      ) : null}

      {views.data.total === 0 ? (
        <EmptyState
          title="저장된 프로젝트 뷰가 없습니다"
          hint={canWrite ? '필터와 레이아웃을 재사용할 첫 뷰를 만드세요.' : '팀원이 공유한 뷰가 이곳에 표시됩니다.'}
        />
      ) : (
        <section aria-label="프로젝트 뷰 목록">
          <div className="mb-3 flex items-center gap-2 text-xs text-of-muted">
            <List size={14} aria-hidden="true" /> {views.data.total}개 뷰
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {views.data.items.map((view) => (
              <ViewCard key={view.id} view={view} projectId={projectId} canWrite={canWrite} />
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
