import { FolderKanban, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api'

import { useCreateProject, useProjects } from './api'

const KEY_RE = /^[A-Z][A-Z0-9]{1,9}$/

function NewProjectForm({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const create = useCreateProject()
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [description, setDescription] = useState('')

  const keyValid = KEY_RE.test(key)
  const canSubmit = name.trim().length > 0 && keyValid && !create.isPending

  const submit = () => {
    if (!canSubmit) return
    create.mutate(
      { name: name.trim(), key, description: description.trim() || null },
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

export function ProjectsPage() {
  const [includeArchived, setIncludeArchived] = useState(false)
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
          {data.items.map((p) => (
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
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
