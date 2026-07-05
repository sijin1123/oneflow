import { Bookmark, X } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import {
  type SavedFilterParams,
  useCreateSavedFilter,
  useDeleteSavedFilter,
  useSavedFilters,
} from './savedFiltersApi'

const KEYS = ['status', 'priority', 'type', 'q'] as const

export function SavedFilters({ projectId }: { projectId: string }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const { data } = useSavedFilters(projectId)
  const create = useCreateSavedFilter(projectId)
  const del = useDeleteSavedFilter(projectId)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const current: SavedFilterParams = {}
  for (const k of KEYS) {
    const v = searchParams.get(k)
    if (v) current[k] = v
  }
  const hasActive = Object.keys(current).length > 0

  const apply = (params: SavedFilterParams) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const k of KEYS) {
        const v = params[k]
        if (v) next.set(k, v)
        else next.delete(k)
      }
      return next
    })
  }

  const save = () => {
    create.mutate(
      { name: name.trim(), params: current },
      {
        onSuccess: () => {
          setName('')
          setSaving(false)
        },
      },
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-of-border px-4 py-1.5">
      <span className="flex items-center gap-1 text-xs text-of-muted">
        <Bookmark size={12} /> 저장된 필터
      </span>

      {data && data.total > 0 ? (
        data.items.map((f) => (
          <span
            key={f.id}
            className="flex items-center gap-1 rounded-of border border-of-border bg-of-surface px-1.5 py-0.5 text-xs"
          >
            <button type="button" className="hover:text-of-accent" onClick={() => apply(f.params)}>
              {f.name}
            </button>
            <button
              type="button"
              aria-label={`${f.name} 삭제`}
              className="text-of-muted hover:text-of-danger"
              onClick={() => del.mutate(f.id)}
            >
              <X size={11} />
            </button>
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
              placeholder="필터 이름"
              aria-label="필터 이름"
              className="h-7 w-32 text-xs"
            />
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
            title={hasActive ? undefined : '필터를 선택하면 저장할 수 있습니다'}
            onClick={() => setSaving(true)}
          >
            현재 필터 저장
          </Button>
        )}
      </div>
    </div>
  )
}
