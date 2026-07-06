import { Bookmark, Share2, X } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

import {
  type SavedFilter,
  type SavedFilterParams,
  type ViewLayout,
  useCreateSavedFilter,
  useDeleteSavedFilter,
  useSavedFilters,
  useUpdateSavedFilter,
} from './savedFiltersApi'

const KEYS = ['status', 'priority', 'type', 'assignee_id', 'cycle_id', 'module_id', 'q'] as const

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

/* Named views (expansion Pass 2 PR-F): a saved filter now carries a layout,
   sort, and optional member-wide sharing. Applying a view navigates to its
   layout route with the captured filter params. */
export function SavedFilters({ projectId }: { projectId: string }) {
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
    const v = searchParams.get(k)
    if (v) current[k] = v
  }
  const sort = searchParams.get('sort')
  const hasActive = Object.keys(current).length > 0 || sort !== null

  const apply = (view: SavedFilter) => {
    const next = new URLSearchParams()
    for (const k of KEYS) {
      const v = view.params[k]
      if (v) next.set(k, v)
    }
    if (view.sort && view.sort !== 'created') next.set('sort', view.sort)
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
    <div className="flex flex-wrap items-center gap-1.5 border-b border-of-border px-4 py-1.5">
      <span className="flex items-center gap-1 text-xs text-of-muted">
        <Bookmark size={12} /> 뷰
      </span>

      {data && data.total > 0 ? (
        data.items.map((f) => (
          <span
            key={f.id}
            className="flex items-center gap-1 rounded-of border border-of-border bg-of-surface px-1.5 py-0.5 text-xs"
          >
            <button
              type="button"
              className="hover:text-of-accent"
              title={`${LAYOUT_LABELS[f.layout]}${f.is_mine ? '' : ` · ${f.owner_name}`}`}
              onClick={() => apply(f)}
            >
              {f.name}
              {f.is_mine ? null : (
                <span className="ml-1 text-[10px] text-of-muted">({f.owner_name})</span>
              )}
            </button>
            {f.is_mine ? (
              <>
                <button
                  type="button"
                  aria-label={`${f.name} 공유 ${f.is_shared ? '해제' : '설정'}`}
                  aria-pressed={f.is_shared}
                  className={f.is_shared ? 'text-of-accent' : 'text-of-muted hover:text-of-accent'}
                  onClick={() => update.mutate({ id: f.id, is_shared: !f.is_shared })}
                >
                  <Share2 size={11} />
                </button>
                <button
                  type="button"
                  aria-label={`${f.name} 삭제`}
                  className="text-of-muted hover:text-of-danger"
                  onClick={() => del.mutate(f.id)}
                >
                  <X size={11} />
                </button>
              </>
            ) : null}
          </span>
        ))
      ) : (
        <span className="text-xs text-of-muted">없음</span>
      )}

      <div className="ml-auto">
        {saving ? (
          <span className="flex items-center gap-1">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="뷰 이름"
              aria-label="뷰 이름"
              className="h-7 w-32 text-xs"
            />
            <Select
              aria-label="뷰 레이아웃"
              className="h-7 w-24 text-xs"
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
              저장
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSaving(false)}>
              취소
            </Button>
          </span>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={!hasActive}
            title={hasActive ? undefined : '필터를 선택하면 뷰로 저장할 수 있습니다'}
            onClick={() => setSaving(true)}
          >
            현재 필터를 뷰로 저장
          </Button>
        )}
      </div>
    </div>
  )
}
