import { Archive, ChevronLeft, ChevronRight, Copy, LoaderCircle, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import {
  type ProjectTemplate,
  useApplyProjectTemplate,
  useArchiveProjectTemplate,
  useCreateProjectTemplate,
  useDeleteProjectTemplate,
  useProjectTemplates,
  useProjectTemplateSources,
  useRefreshProjectTemplate,
} from './api'

const KEY_RE = /^[A-Z][A-Z0-9]{1,9}$/

function ErrorText({ error }: { error: unknown }) {
  if (!error) return null
  return (
    <p className="mt-2 text-xs text-of-danger" role="alert">
      {error instanceof Error ? error.message : '요청을 완료하지 못했습니다.'}
    </p>
  )
}

function CreateTemplateForm({ onClose }: { onClose: () => void }) {
  const sources = useProjectTemplateSources()
  const create = useCreateProjectTemplate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sourceProjectId, setSourceProjectId] = useState('')
  const activeProjects = sources.data?.items ?? []
  const canSubmit = Boolean(name.trim() && sourceProjectId && !create.isPending)

  return (
    <form
      className="border-b border-of-border bg-of-surface-2 p-3"
      aria-label="새 템플릿 생성"
      onSubmit={(event) => {
        event.preventDefault()
        if (!canSubmit) return
        create.mutate(
          {
            name: name.trim(),
            description: description.trim() || null,
            source_project_id: sourceProjectId,
          },
          { onSuccess: onClose },
        )
      }}
    >
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
        <label className="text-xs font-medium text-of-muted">
          템플릿 이름
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 min-h-11"
            maxLength={120}
            required
          />
        </label>
        <label className="text-xs font-medium text-of-muted">
          원본 프로젝트
          <Select
            value={sourceProjectId}
            onChange={(event) => setSourceProjectId(event.target.value)}
            className="mt-1 min-h-11"
            required
          >
            <option value="">프로젝트 선택</option>
            {activeProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name} ({project.key})
              </option>
            ))}
          </Select>
        </label>
        <div className="flex gap-2">
          <Button type="submit" disabled={!canSubmit} className="min-h-11">
            {create.isPending ? <LoaderCircle className="animate-spin" /> : <Plus />} 만들기
          </Button>
          <Button type="button" variant="ghost" className="min-h-11" onClick={onClose}>
            취소
          </Button>
        </div>
      </div>
      <label className="mt-2 block text-xs font-medium text-of-muted">
        설명
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="mt-1 min-h-16"
          maxLength={20000}
          placeholder="템플릿 용도와 적용 범위를 적으세요."
        />
      </label>
      {activeProjects.length === 0 && !sources.isPending ? (
        <p className="mt-2 text-xs text-of-danger">
          소유한 활성 프로젝트가 있어야 템플릿을 만들 수 있습니다.
        </p>
      ) : null}
      <ErrorText error={create.error} />
    </form>
  )
}

function ApplyForm({ template, onClose }: { template: ProjectTemplate; onClose: () => void }) {
  const navigate = useNavigate()
  const apply = useApplyProjectTemplate(template.id)
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [description, setDescription] = useState('')
  const keyValid = KEY_RE.test(key)
  const canSubmit = Boolean(name.trim() && keyValid && !apply.isPending)

  return (
    <form
      className="border-t border-of-border bg-of-surface-2 p-3"
      aria-label={`${template.name} 적용`}
      onSubmit={(event) => {
        event.preventDefault()
        if (!canSubmit) return
        apply.mutate(
          { name: name.trim(), key, description: description.trim() || null },
          { onSuccess: (project) => navigate(`/projects/${project.id}/work-packages`) },
        )
      }}
    >
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_9rem_minmax(0,1fr)_auto] md:items-end">
        <label className="text-xs font-medium text-of-muted">
          새 프로젝트 이름
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 min-h-11"
            maxLength={120}
            required
          />
        </label>
        <label className="text-xs font-medium text-of-muted">
          키
          <Input
            value={key}
            onChange={(event) => setKey(event.target.value.toUpperCase())}
            className="mt-1 min-h-11 font-mono"
            aria-invalid={Boolean(key && !keyValid)}
            aria-describedby={`template-${template.id}-key-help`}
            placeholder="ONE"
            maxLength={10}
            required
          />
        </label>
        <label className="text-xs font-medium text-of-muted">
          설명
          <Input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="mt-1 min-h-11"
          />
        </label>
        <div className="flex gap-2">
          <Button type="submit" disabled={!canSubmit} className="min-h-11">
            {apply.isPending ? <LoaderCircle className="animate-spin" /> : <Copy />} 적용
          </Button>
          <Button type="button" variant="ghost" className="min-h-11" onClick={onClose}>
            취소
          </Button>
        </div>
      </div>
      <p
        id={`template-${template.id}-key-help`}
        className={`mt-2 text-xs ${key && !keyValid ? 'text-of-danger' : 'text-of-muted'}`}
      >
        키는 대문자로 시작하는 2-10자여야 합니다.
      </p>
      <ErrorText error={apply.error} />
    </form>
  )
}

function DeleteTemplateDialog({
  template,
  onClose,
}: {
  template: ProjectTemplate
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const remove = useDeleteProjectTemplate(template.id)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    cancelRef.current?.focus()
    return () => dialog.close()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      aria-label={`${template.name} 삭제 확인`}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] border border-of-border bg-of-surface p-4 text-of-text shadow-lg backdrop:bg-black/30"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <p className="text-sm font-medium">보관된 템플릿을 삭제할까요?</p>
      <p className="mt-1 text-xs text-of-muted">이 작업은 되돌릴 수 없습니다.</p>
      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          variant="danger"
          className="min-h-11"
          disabled={remove.isPending}
          onClick={() => remove.mutate(undefined, { onSuccess: onClose })}
        >
          삭제
        </Button>
        <Button
          ref={cancelRef}
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={onClose}
        >
          취소
        </Button>
      </div>
      <ErrorText error={remove.error} />
    </dialog>
  )
}

function TemplateRow({ template }: { template: ProjectTemplate }) {
  const [applying, setApplying] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const refresh = useRefreshProjectTemplate(template.id)
  const archive = useArchiveProjectTemplate(template.id, true)
  const restore = useArchiveProjectTemplate(template.id, false)
  const revision = template.latest_revision
  const snapshotCount = revision
    ? revision.statuses + revision.types + revision.custom_fields + revision.automation_rules
    : 0
  const updated = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(
    new Date(template.updated_at),
  )
  const archiveAction = template.archived_at ? restore : archive

  return (
    <li className="bg-of-surface">
      <div className="flex min-w-0 flex-col gap-3 px-3 py-3 md:flex-row md:items-center md:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium">{template.name}</p>
            {template.archived_at ? <Badge variant="outline">보관됨</Badge> : null}
            <Badge variant="outline">v{revision?.version ?? 0}</Badge>
          </div>
          <p className="mt-1 line-clamp-1 text-xs text-of-muted">
            {template.description || '설명 없음'}
          </p>
          <p className="mt-1 text-[11px] text-of-muted">
            원본: {template.source_project_name || '삭제된 프로젝트'} · 작성자:{' '}
            {template.creator_name || '알 수 없음'} · 스냅샷 항목 {snapshotCount}개 · 업데이트{' '}
            {updated}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!template.archived_at ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={() => setApplying((value) => !value)}
            >
              <Copy size={14} /> 적용
            </Button>
          ) : null}
          {template.can_manage ? (
            <>
              {!template.archived_at && template.source_project_id ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11"
                  disabled={refresh.isPending}
                  onClick={() => refresh.mutate({ source_project_id: template.source_project_id! })}
                >
                  <RefreshCw size={14} className={refresh.isPending ? 'animate-spin' : undefined} />
                  스냅샷 갱신
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11"
                disabled={archiveAction.isPending}
                onClick={() => archiveAction.mutate()}
              >
                <Archive size={14} /> {template.archived_at ? '복원' : '보관'}
              </Button>
              {template.archived_at ? (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  className="min-h-11"
                  onClick={() => setConfirmingDelete(true)}
                >
                  <Trash2 size={14} /> 삭제
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
      {applying ? <ApplyForm template={template} onClose={() => setApplying(false)} /> : null}
      {confirmingDelete ? (
        <DeleteTemplateDialog template={template} onClose={() => setConfirmingDelete(false)} />
      ) : null}
      <ErrorText error={refresh.error || archive.error || restore.error} />
    </li>
  )
}

export function TemplatesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [creating, setCreating] = useState(false)
  const query = searchParams.get('q') ?? ''
  const includeArchived = searchParams.get('include_archived') === 'true'
  const rawOffset = searchParams.get('offset')
  const parsedOffset = Number(rawOffset ?? 0)
  const offset = Number.isInteger(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0
  const [searchDraft, setSearchDraft] = useState(query)
  const templates = useProjectTemplates(query, includeArchived, offset)
  const total = templates.data?.total
  const normalizedOffset =
    total === undefined
      ? undefined
      : total === 0
        ? 0
        : offset < total
          ? offset
          : Math.floor((total - 1) / 50) * 50
  const canonicalOffset =
    normalizedOffset === undefined || normalizedOffset === 0 ? null : String(normalizedOffset)
  const offsetNeedsNormalization =
    total !== undefined && (rawOffset || null) !== canonicalOffset

  useEffect(() => setSearchDraft(query), [query])
  useEffect(() => {
    if (!offsetNeedsNormalization) return
    const next = new URLSearchParams(searchParams)
    if (canonicalOffset) next.set('offset', canonicalOffset)
    else next.delete('offset')
    setSearchParams(next, { replace: true })
  }, [canonicalOffset, offsetNeedsNormalization, searchParams, setSearchParams])

  const setParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    setSearchParams(next, { replace: true })
  }

  if (templates.isPending) return <ListSkeleton />
  if (templates.isError) return <ErrorState error={templates.error} onRetry={() => templates.refetch()} />
  if (offsetNeedsNormalization) return <ListSkeleton />

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6">
      <header className="flex flex-col gap-3 border-b border-of-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase text-of-muted">Workspace configuration</p>
          <h1 className="mt-1 text-base font-semibold">프로젝트 템플릿</h1>
          <p className="mt-1 text-xs leading-5 text-of-muted">
            검증된 프로젝트 구성을 스냅샷으로 보관하고 새 프로젝트에 적용합니다.
          </p>
        </div>
        <Button type="button" className="min-h-11" onClick={() => setCreating(true)}>
          <Plus /> 새 템플릿
        </Button>
      </header>
      {creating ? <CreateTemplateForm onClose={() => setCreating(false)} /> : null}
      <section
        aria-label="템플릿 보기 제어"
        className="flex flex-col gap-2 border border-of-border bg-of-surface p-3 sm:flex-row sm:items-center"
      >
        <div className="relative min-w-0 flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-of-muted"
          />
          <Input
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                setParams({ q: event.currentTarget.value.trim() || null, offset: null })
              }
            }}
            placeholder="템플릿 검색 (Enter)"
            aria-label="템플릿 검색어"
            className="min-h-11 pl-9 pr-9"
          />
          {searchDraft ? (
            <button
              type="button"
              aria-label="검색어 지우기"
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-of-muted"
              onClick={() => {
                setSearchDraft('')
                setParams({ q: null, offset: null })
              }}
            >
              <X size={15} />
            </button>
          ) : null}
        </div>
        <label className="flex min-h-11 items-center gap-2 border border-of-border px-3 text-xs text-of-muted">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(event) => {
              setParams({
                include_archived: event.target.checked ? 'true' : null,
                offset: null,
              })
            }}
            className="h-4 w-4 accent-of-accent"
          />
          <Archive size={14} /> 보관 포함
        </label>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => templates.refetch()}
        >
          <RefreshCw className={templates.isFetching ? 'animate-spin' : undefined} /> 새로고침
        </Button>
      </section>
      {templates.data.total === 0 ? (
        <EmptyState
          title={query ? '조건에 맞는 템플릿이 없습니다' : '아직 프로젝트 템플릿이 없습니다'}
          hint="소유한 활성 프로젝트의 구성으로 템플릿을 만들 수 있습니다."
        >
          {query ? (
            <Button type="button" variant="outline" onClick={() => setParams({ q: null })}>
              검색 지우기
            </Button>
          ) : (
            <Button type="button" onClick={() => setCreating(true)}>
              <Plus /> 새 템플릿
            </Button>
          )}
        </EmptyState>
      ) : (
        <section className="overflow-hidden border border-of-border bg-of-surface">
          <ul aria-label="프로젝트 템플릿 목록" className="divide-y divide-of-border">
            {templates.data.items.map((template) => (
              <TemplateRow key={template.id} template={template} />
            ))}
          </ul>
        </section>
      )}
      {offset > 0 || offset + templates.data.items.length < templates.data.total ? (
        <nav aria-label="템플릿 페이지" className="flex items-center justify-between gap-3">
          <span className="text-xs tabular-nums text-of-muted">
            {offset + 1}-{Math.min(offset + templates.data.items.length, templates.data.total)} /{' '}
            {templates.data.total}
          </span>
          <div className="flex gap-1">
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="이전 페이지"
              disabled={offset === 0}
              onClick={() => setParams({ offset: offset > 50 ? String(offset - 50) : null })}
            >
              <ChevronLeft />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="다음 페이지"
              disabled={offset + templates.data.items.length >= templates.data.total}
              onClick={() => setParams({ offset: String(offset + 50) })}
            >
              <ChevronRight />
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  )
}
