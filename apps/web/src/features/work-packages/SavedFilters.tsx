import { Bookmark, BookmarkCheck, Lock, LockOpen, Save, Share2, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

import { parseColumns, serializeColumns } from './columns'
import { parseWorkPackageSort, serializeWorkPackageSort } from './displayOptions'

import {
  type SavedFilter,
  type SavedFilterParams,
  type ViewLayout,
  useCreateSavedFilter,
  useDeleteSavedFilter,
  useSavedFilters,
  useUpdateSavedFilter,
} from './savedFiltersApi'

const KEYS = [
  'status',
  'priority',
  'type',
  'assignee_id',
  'milestone_id',
  'cycle_id',
  'module_id',
  'q',
  'columns',
  'cf_field',
  'cf_op',
  'cf_value',
] as const

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
  tree: '트리',
  timeline: '타임라인',
  calendar: '캘린더',
}

function paramsSignature(params: SavedFilterParams, sort: string | null) {
  const normalized: SavedFilterParams = {}
  for (const key of KEYS) {
    const value = params[key]
    if (value) normalized[key] = value
  }
  return JSON.stringify({ params: normalized, sort: sort ?? null })
}

type SavedFiltersProps = {
  projectId: string
  activeControlCount?: number
  onClearCurrentView?: () => void
}

/* Named views (expansion Pass 2 PR-F): a saved filter now carries a layout,
   sort, and optional member-wide sharing. Applying a view navigates to its
   layout route with the captured filter params. */
export function SavedFilters({
  projectId,
  activeControlCount = 0,
  onClearCurrentView,
}: SavedFiltersProps) {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { data } = useSavedFilters(projectId)
  const create = useCreateSavedFilter(projectId)
  const update = useUpdateSavedFilter(projectId)
  const del = useDeleteSavedFilter(projectId)
  const [name, setName] = useState('')
  const [layout, setLayout] = useState<ViewLayout>('list')
  const [shared, setShared] = useState(false)
  const [saving, setSaving] = useState(false)

  const current: SavedFilterParams = {}
  for (const k of KEYS) {
    let v = searchParams.get(k)
    // The API 422s on unknown column keys — save exactly what the URL parser
    // renders, never the raw URL value (v32.1 R1-④).
    if (k === 'columns' && v !== null) v = serializeColumns(parseColumns(v))
    if (v) current[k] = v
  }
  const sort = serializeWorkPackageSort(parseWorkPackageSort(searchParams.get('sort')))
  const hasActive = Object.keys(current).length > 0 || sort !== null
  const activeSignature = paramsSignature(current, sort)
  const activeView = data?.items.find(
    (view) =>
      view.layout === 'list' &&
      paramsSignature(view.params, serializeWorkPackageSort(parseWorkPackageSort(view.sort))) ===
        activeSignature,
  )

  const apply = (view: SavedFilter) => {
    const next = new URLSearchParams()
    for (const k of KEYS) {
      const v = view.params[k]
      if (v) next.set(k, v)
    }
    const sort = serializeWorkPackageSort(parseWorkPackageSort(view.sort))
    if (sort) next.set('sort', sort)
    navigate(`/projects/${projectId}/${LAYOUT_ROUTES[view.layout]}?${next.toString()}`)
  }

  const save = () => {
    create.mutate(
      { name: name.trim(), params: current, layout, sort, is_shared: shared },
      {
        onSuccess: () => {
          setName('')
          setLayout('list')
          setShared(false)
          setSaving(false)
        },
      },
    )
  }

  return (
    <section
      aria-label="저장 뷰 관리"
      className="grid gap-2 border-t border-of-border/70 pt-2"
    >
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-of-muted">
            <Bookmark size={12} /> 저장 뷰
          </span>
          {data ? <Badge variant="outline">{data.total}개</Badge> : null}
          {activeView ? (
            <Badge variant="accent">
              <BookmarkCheck size={12} aria-hidden="true" />
              활성 {activeView.name}
            </Badge>
          ) : activeControlCount > 0 ? (
            <Badge variant="outline">필터 {activeControlCount}</Badge>
          ) : (
            <Badge variant="outline">기본 보기</Badge>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {onClearCurrentView && activeControlCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              aria-label="현재 보기 초기화"
              onClick={onClearCurrentView}
            >
              <X size={13} /> 초기화 {activeControlCount}
            </Button>
          ) : null}
          {!saving ? (
            <Button
              variant="outline"
              size="sm"
              disabled={!hasActive}
              title={hasActive ? undefined : '필터를 선택하면 뷰로 저장할 수 있습니다'}
              onClick={() => setSaving(true)}
            >
              <Save size={13} /> 현재 필터를 뷰로 저장
            </Button>
          ) : null}
        </div>
      </div>

      {data && data.total > 0 ? (
        <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
          {data.items.map((f) => (
            <div
              key={f.id}
              className="grid gap-1 rounded-of border border-of-border bg-of-surface px-2 py-1.5 text-xs shadow-[var(--of-shadow-hairline)]"
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <button
                  type="button"
                  aria-label={f.name}
                  className="min-w-0 truncate text-left font-medium hover:text-of-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                  title={`${LAYOUT_LABELS[f.layout]}${f.is_mine ? '' : ` · ${f.owner_name}`}`}
                  onClick={() => apply(f)}
                >
                  {f.name}
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  {f.is_mine ? (
                    <>
                      <button
                        type="button"
                        aria-label={`${f.name} 잠금 ${f.is_locked ? '해제' : '설정'}`}
                        aria-pressed={f.is_locked}
                        title={
                          f.is_locked ? '잠긴 뷰 — 해제해야 수정/삭제할 수 있습니다' : '실수 방지 잠금'
                        }
                        className={
                          f.is_locked ? 'text-of-accent' : 'text-of-muted hover:text-of-accent'
                        }
                        onClick={() => update.mutate({ id: f.id, is_locked: !f.is_locked })}
                      >
                        {f.is_locked ? <Lock size={12} /> : <LockOpen size={12} />}
                      </button>
                      {!f.is_locked ? (
                        <>
                          <button
                            type="button"
                            aria-label={`${f.name} 공유 ${f.is_shared ? '해제' : '설정'}`}
                            aria-pressed={f.is_shared}
                            className={
                              f.is_shared ? 'text-of-accent' : 'text-of-muted hover:text-of-accent'
                            }
                            onClick={() => update.mutate({ id: f.id, is_shared: !f.is_shared })}
                          >
                            <Share2 size={12} />
                          </button>
                          <button
                            type="button"
                            aria-label={`${f.name} 삭제`}
                            className="text-of-muted hover:text-of-danger"
                            onClick={() => del.mutate(f.id)}
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-1 text-[11px] text-of-muted">
                <span>{LAYOUT_LABELS[f.layout]}</span>
                {f.is_shared ? <span>공유됨</span> : <span>개인</span>}
                {f.is_locked ? <span>잠김</span> : null}
                {f.is_mine ? null : <span>{f.owner_name}</span>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-of border border-dashed border-of-border bg-of-surface-2 px-2.5 py-2 text-xs text-of-muted">
          저장 뷰 없음
        </div>
      )}

      {saving ? (
        <div className="rounded-of border border-of-border bg-of-surface-2 p-2">
          <div className="grid gap-2 sm:grid-cols-[minmax(10rem,1fr)_8rem_auto_auto_auto] sm:items-center">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="뷰 이름"
              aria-label="뷰 이름"
              className="h-7 w-full text-xs"
            />
            <Select
              aria-label="뷰 레이아웃"
              className="h-7 w-full text-xs"
              value={layout}
              onChange={(e) => setLayout(e.target.value as ViewLayout)}
            >
              {(Object.keys(LAYOUT_ROUTES) as ViewLayout[]).map((l) => (
                <option key={l} value={l}>
                  {LAYOUT_LABELS[l]}
                </option>
              ))}
            </Select>
            <label className="flex items-center gap-1 text-xs text-of-muted">
              <input
                type="checkbox"
                checked={shared}
                onChange={(e) => setShared(e.target.checked)}
                className="h-3 w-3 accent-of-accent"
              />
              공유
            </label>
            <Button size="sm" disabled={!name.trim() || create.isPending} onClick={save}>
              <Save size={13} /> 저장
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSaving(false)}>
              <X size={13} /> 취소
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
