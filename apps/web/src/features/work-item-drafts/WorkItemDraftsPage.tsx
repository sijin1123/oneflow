import {
  FilePenLine,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useCanWrite } from '@/features/members/useCanWrite'
import { useProjects } from '@/features/projects/api'
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
} from '@/features/work-packages/types'

import { type WorkItemDraft, useDeleteWorkItemDraft, useWorkItemDrafts } from './api'

function updatedLabel(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function DraftRow({
  draft,
  projectName,
  projectKey,
}: {
  draft: WorkItemDraft
  projectName: string
  projectKey: string
}) {
  const navigate = useNavigate()
  const remove = useDeleteWorkItemDraft()
  const [confirming, setConfirming] = useState(false)
  const [deleteRequest, setDeleteRequest] = useState<{
    id: string
    expectedVersion: number
  } | null>(null)
  const canResume = useCanWrite(draft.project_id)
  const resume = () =>
    navigate(`/projects/${draft.project_id}/work-packages?new=1&draft=${draft.id}`)
  const requestDelete = () => {
    setDeleteRequest({ id: draft.id, expectedVersion: draft.version })
    setConfirming(true)
    remove.reset()
  }
  const runDelete = () => {
    if (!deleteRequest) return
    remove.mutate(deleteRequest, {
      onSuccess: () => {
        setConfirming(false)
        setDeleteRequest(null)
      },
    })
  }
  const cancelDelete = () => {
    if (remove.isPending) return
    setConfirming(false)
    setDeleteRequest(null)
    remove.reset()
  }

  return (
    <li className="relative min-w-0 border-b border-of-border last:border-b-0">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_2.75rem] items-stretch">
        {canResume ? (
          <button
            type="button"
            className="grid min-h-[4.5rem] min-w-0 gap-1 px-4 py-2.5 text-left hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-of-focus sm:grid-cols-[minmax(0,1fr)_12rem_9rem] sm:items-center sm:px-6"
            onClick={resume}
          >
            <DraftSummary draft={draft} />
            <span className="min-w-0 truncate text-xs text-of-muted">
              {projectKey} · {projectName}
            </span>
            <span className="text-xs text-of-muted sm:text-right">
              {updatedLabel(draft.updated_at)} 수정
            </span>
          </button>
        ) : (
          <div className="grid min-h-[4.5rem] min-w-0 gap-1 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_12rem_9rem] sm:items-center sm:px-6">
            <DraftSummary draft={draft} />
            <span className="min-w-0 truncate text-xs text-of-muted">
              {projectKey} · {projectName}
            </span>
            <span className="text-xs text-of-muted sm:text-right">읽기 전용 · 삭제만 가능</span>
          </div>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`${draft.content.subject.trim() || '제목 없는 초안'} 초안 작업`}
              disabled={confirming || remove.isPending}
              className="my-2 mr-2 grid min-h-9 min-w-9 place-items-center self-start rounded-of text-of-muted hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus disabled:opacity-50"
            >
              {remove.isPending ? (
                <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" />
              ) : (
                <MoreHorizontal size={15} />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canResume ? (
              <DropdownMenuItem onSelect={resume} className="flex items-center gap-2">
                <Pencil size={14} aria-hidden="true" /> 초안 이어쓰기
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              onSelect={requestDelete}
              className="flex items-center gap-2 text-of-danger data-[highlighted]:text-of-danger"
            >
              <Trash2 size={14} aria-hidden="true" /> 초안 삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {confirming ? (
        <div
          role={remove.isError ? 'alert' : 'group'}
          aria-label={remove.isError ? undefined : '초안 삭제 확인'}
          className={`flex min-h-10 flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-xs sm:px-6 ${
            remove.isError
              ? 'border-of-danger/20 bg-of-danger/5 text-of-danger'
              : 'border-of-border bg-of-surface-2 text-of-muted'
          }`}
        >
          <span>
            {remove.isError
              ? '초안을 삭제하지 못했습니다. 초안은 그대로 유지됩니다.'
              : '이 초안을 삭제할까요? 삭제 후 복구할 수 없습니다.'}
          </span>
          <span className="flex items-center gap-1">
            <Button
              size="sm"
              variant="danger"
              disabled={remove.isPending}
              onClick={runDelete}
            >
              {remove.isPending ? (
                <LoaderCircle className="animate-spin motion-reduce:animate-none" />
              ) : null}
              {remove.isError ? '다시 시도' : remove.isPending ? '삭제 중' : '삭제'}
            </Button>
            <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={cancelDelete}>
              취소
            </Button>
          </span>
        </div>
      ) : null}
    </li>
  )
}

function DraftSummary({ draft }: { draft: WorkItemDraft }) {
  return (
    <span className="min-w-0">
      <span className="block truncate text-sm font-medium text-of-fg">
        {draft.content.subject.trim() || '제목 없는 초안'}
      </span>
      <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-of-muted">
        <span>{TYPE_LABELS[draft.content.type] ?? draft.content.type}</span>
        <span aria-hidden="true">·</span>
        <span>{STATUS_LABELS[draft.content.status]}</span>
        {draft.content.priority !== 'none' ? (
          <>
            <span aria-hidden="true">·</span>
            <span>{PRIORITY_LABELS[draft.content.priority]}</span>
          </>
        ) : null}
      </span>
    </span>
  )
}

export function WorkItemDraftsPage() {
  const drafts = useWorkItemDrafts()
  const projects = useProjects(true)
  const navigate = useNavigate()
  const projectById = new Map((projects.data?.items ?? []).map((project) => [project.id, project]))

  return (
    <main className="mx-auto w-full max-w-5xl min-w-0 px-4 py-4 md:px-6">
      <header className="flex min-h-11 items-center justify-between gap-4 border-b border-of-border">
        <div className="min-w-0">
          <p className="truncate text-[11px] text-of-muted">개인 작업</p>
          <h1 className="truncate text-sm font-semibold">작업 초안</h1>
        </div>
        {drafts.data ? (
          <span className="shrink-0 text-xs tabular-nums text-of-muted">
            {drafts.data.total}개
          </span>
        ) : null}
      </header>

      {drafts.isPending || projects.isPending ? (
        <div role="status" aria-label="초안 불러오는 중" className="divide-y divide-of-border border-b border-of-border">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-[4.5rem] animate-pulse bg-of-surface-2/55" />
          ))}
        </div>
      ) : drafts.isError || projects.isError ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 border-b border-of-border text-center">
          <p role="alert" className="text-sm font-medium">초안을 불러오지 못했습니다.</p>
          <Button
            variant="outline"
            onClick={() => {
              void drafts.refetch()
              void projects.refetch()
            }}
          >
            <RefreshCw /> 다시 시도
          </Button>
        </div>
      ) : drafts.data.items.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center border-b border-of-border px-4 text-center">
          <FilePenLine className="mb-3 size-8 text-of-muted" />
          <p className="text-sm font-medium">저장된 작업 초안이 없습니다.</p>
          <p className="mt-1 text-xs text-of-muted">프로젝트 작업 목록에서 새 작업을 시작할 수 있습니다.</p>
          <Button className="mt-4" variant="outline" onClick={() => navigate('/projects')}>
            프로젝트 보기
          </Button>
        </div>
      ) : (
        <ul aria-label="작업 초안 목록" className="border-b border-of-border">
          {drafts.data.items.map((draft) => {
            const project = projectById.get(draft.project_id)
            return (
              <DraftRow
                key={draft.id}
                draft={draft}
                projectName={project?.name ?? '접근 가능한 프로젝트'}
                projectKey={project?.key ?? '—'}
              />
            )
          })}
        </ul>
      )}
    </main>
  )
}
