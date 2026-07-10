import { FilePenLine, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { useCanWrite } from '@/features/members/useCanWrite'
import { useProjects } from '@/features/projects/api'

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
  const canResume = useCanWrite(draft.project_id)

  return (
    <li className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-of-border px-4 py-2.5 last:border-b-0">
      {canResume ? (
        <button
          type="button"
          className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
          onClick={() =>
            navigate(`/projects/${draft.project_id}/work-packages?new=1&draft=${draft.id}`)
          }
        >
          <p className="truncate text-sm font-medium text-of-fg">
            {draft.content.subject.trim() || '제목 없는 초안'}
          </p>
          <p className="mt-0.5 truncate text-xs text-of-muted">
            {projectKey} · {projectName} · {updatedLabel(draft.updated_at)} 수정
          </p>
        </button>
      ) : (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-of-fg">
            {draft.content.subject.trim() || '제목 없는 초안'}
          </p>
          <p className="mt-0.5 truncate text-xs text-of-muted">
            {projectKey} · {projectName} · 읽기 전용 · 삭제만 가능
          </p>
        </div>
      )}
      <div className="flex min-h-11 items-center gap-1">
        {confirming ? (
          <>
            <Button
              size="sm"
              variant="danger"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(
                  { id: draft.id, expectedVersion: draft.version },
                  { onSuccess: () => setConfirming(false) },
                )
              }
            >
              삭제
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              취소
            </Button>
          </>
        ) : (
          <>
            {canResume ? (
              <Button
                size="icon"
                variant="ghost"
                className="h-11 w-11 md:h-8 md:w-8"
                aria-label="초안 이어쓰기"
                title="초안 이어쓰기"
                onClick={() =>
                  navigate(`/projects/${draft.project_id}/work-packages?new=1&draft=${draft.id}`)
                }
              >
                <Pencil />
              </Button>
            ) : null}
            <Button
              size="icon"
              variant="ghost"
              className="h-11 w-11 md:h-8 md:w-8"
              aria-label="초안 삭제"
              title="초안 삭제"
              onClick={() => setConfirming(true)}
            >
              <Trash2 />
            </Button>
          </>
        )}
      </div>
    </li>
  )
}

export function WorkItemDraftsPage() {
  const drafts = useWorkItemDrafts()
  const projects = useProjects(true)
  const navigate = useNavigate()
  const projectById = new Map((projects.data?.items ?? []).map((project) => [project.id, project]))

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5 md:px-6">
      <header className="mb-4 flex items-end justify-between gap-4 border-b border-of-border pb-4">
        <div>
          <p className="text-xs font-medium text-of-muted">워크스페이스</p>
          <h1 className="mt-1 text-base font-semibold">작업 초안</h1>
        </div>
        {drafts.data ? (
          <span className="text-xs tabular-nums text-of-muted">{drafts.data.total}개</span>
        ) : null}
      </header>

      {drafts.isPending || projects.isPending ? (
        <div role="status" aria-label="초안 불러오는 중" className="divide-y divide-of-border border-y border-of-border">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-16 animate-pulse bg-of-surface-2/55" />
          ))}
        </div>
      ) : drafts.isError || projects.isError ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 border-y border-of-border text-center">
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
        <div className="flex min-h-64 flex-col items-center justify-center border-y border-of-border px-4 text-center">
          <FilePenLine className="mb-3 size-8 text-of-muted" />
          <p className="text-sm font-medium">저장된 작업 초안이 없습니다.</p>
          <p className="mt-1 text-xs text-of-muted">프로젝트 작업 목록에서 새 작업을 시작할 수 있습니다.</p>
          <Button className="mt-4" variant="outline" onClick={() => navigate('/projects')}>
            프로젝트 보기
          </Button>
        </div>
      ) : (
        <ul aria-label="작업 초안 목록" className="border-y border-of-border">
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
