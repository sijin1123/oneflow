import * as Dialog from '@radix-ui/react-dialog'
import {
  ArrowUpRight,
  Camera,
  Gauge,
  LayoutDashboard,
  ListChecks,
  Settings,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useRef, useState, type RefObject } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ModalContent, ModalOverlay } from '@/components/ui/modal'
import { useDeleteAttachment, useUploadAttachment } from '@/features/attachments/api'
import { useDashboard } from '@/features/dashboard/api'
import { RecentActivity } from '@/features/dashboard/RecentActivity'
import { useMe, useMembers } from '@/features/members/api'
import { PriorityChip, StatusChip } from '@/features/work-packages/chips'
import { ApiError } from '@/lib/api'
import { formatDateTime } from '@/lib/datetime'
import { cn } from '@/lib/utils'

import { getProject, useProject, useUpdateProject } from './api'
import { HEALTH_LABELS, HEALTH_STYLES, type Project } from './types'
import { ProjectCover } from './ProjectCover'
import { ProjectHealthHistoryTimeline } from './ProjectHealthHistoryTimeline'
import { ProjectLifecycleTimeline } from './ProjectLifecycleTimeline'
import { ProjectScheduleBaselinePanel } from './ProjectScheduleBaselinePanel'

const COVER_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

function OverviewMetric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="min-w-0 border-b border-of-border-subtle px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="text-[11px] font-medium text-of-muted">{label}</p>
      <p className={cn('mt-0.5 text-lg font-semibold tabular-nums', danger && 'text-of-danger')}>{value}</p>
    </div>
  )
}

function CoverDialog({
  project,
  open,
  onOpenChange,
  returnFocusRef,
}: {
  project: Project
  open: boolean
  onOpenChange: (open: boolean) => void
  returnFocusRef: RefObject<HTMLButtonElement | null>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const upload = useUploadAttachment(project.id)
  const cleanupUpload = useDeleteAttachment(project.id)
  const update = useUpdateProject(project.id)
  const [error, setError] = useState('')
  const busy = upload.isPending || update.isPending || cleanupUpload.isPending

  const choose = async (file: File | undefined) => {
    if (!file) return
    if (!COVER_TYPES.has(file.type)) {
      setError('PNG, JPEG, GIF 또는 WebP 이미지를 선택해 주세요.')
      return
    }
    setError('')
    let uploadedId: string | null = null
    try {
      const attachment = await upload.mutateAsync({ file })
      uploadedId = attachment.id
      await update.mutateAsync({ cover_attachment_id: attachment.id })
      onOpenChange(false)
    } catch (cause) {
      if (uploadedId) {
        let shouldCleanup = cause instanceof ApiError && cause.status >= 400 && cause.status < 500
        try {
          const latest = await getProject(project.id)
          if (latest.cover_attachment_id === uploadedId) {
            onOpenChange(false)
            return
          }
          shouldCleanup = true
        } catch {
          // An ambiguous write stays as a visible project attachment until reconciliation.
        }
        if (shouldCleanup) {
          try {
            await cleanupUpload.mutateAsync(uploadedId)
          } catch {
            // The uploaded file remains a visible project attachment, never hidden data.
          }
        }
      }
      setError(cause instanceof ApiError ? cause.message : '표지를 저장하지 못했습니다.')
    }
  }

  const remove = async () => {
    setError('')
    try {
      await update.mutateAsync({ cover_attachment_id: null })
      onOpenChange(false)
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : '표지를 제거하지 못했습니다.')
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}>
      <Dialog.Portal>
        <ModalOverlay className="bg-black/45" />
        <ModalContent
          className="w-[min(32rem,calc(100vw-2rem))] rounded-of border border-of-border bg-of-surface p-4 shadow-[var(--of-shadow-popover)]"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            returnFocusRef.current?.focus()
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Dialog.Title className="text-sm font-semibold">프로젝트 표지</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-5 text-of-muted">
                디렉터리 타일과 Overview에 함께 표시할 이미지를 선택합니다.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" aria-label="표지 창 닫기" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus">
                <X size={15} />
              </button>
            </Dialog.Close>
          </div>

          <ProjectCover
            projectKey={project.key}
            projectName={project.name}
            attachmentId={project.cover_attachment_id}
            className="mt-4 h-32 rounded-of border border-of-border"
          />

          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            className="sr-only"
            aria-label="프로젝트 표지 파일"
            onChange={(event) => {
              void choose(event.target.files?.[0])
              event.currentTarget.value = ''
            }}
          />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
              <Upload size={14} /> {project.cover_attachment_id ? '다른 이미지 선택' : '이미지 선택'}
            </Button>
            {project.cover_attachment_id ? (
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void remove()}>
                <Trash2 size={14} /> 표지 제거
              </Button>
            ) : null}
            {busy ? <span role="status" className="text-xs text-of-muted">저장 중...</span> : null}
          </div>
          {error ? <p role="alert" className="mt-3 text-xs text-of-danger">{error}</p> : null}
        </ModalContent>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function ProjectOverviewPage() {
  const { projectId } = useParams() as { projectId: string }
  const navigate = useNavigate()
  const project = useProject(projectId)
  const dashboard = useDashboard(projectId)
  const members = useMembers(projectId)
  const me = useMe()
  const [coverOpen, setCoverOpen] = useState(false)
  const coverTriggerRef = useRef<HTMLButtonElement>(null)

  if (project.isPending || dashboard.isPending) return <ListSkeleton />
  if (project.isError) return <ErrorState error={project.error} onRetry={() => project.refetch()} />
  if (dashboard.isError) return <ErrorState error={dashboard.error} onRetry={() => dashboard.refetch()} />

  const data = dashboard.data
  const myRole = members.data?.items.find((member) => member.user_id === me.data?.id)?.role
  const canManageProject = myRole === 'owner' && !project.data.archived_at
  const canChangeCover = canManageProject

  return (
    <div className="min-h-full bg-of-surface">
      <ProjectCover
        projectKey={project.data.key}
        projectName={project.data.name}
        attachmentId={project.data.cover_attachment_id}
        className="h-36 border-b border-of-border sm:h-44"
      >
        {canChangeCover ? (
          <div className="absolute right-3 top-3">
            <Button ref={coverTriggerRef} type="button" size="sm" variant="secondary" onClick={() => setCoverOpen(true)}>
              <Camera size={14} /> 표지 변경
            </Button>
          </div>
        ) : null}
      </ProjectCover>

      <div className="mx-auto w-full max-w-6xl px-4 pb-8 sm:px-6">
        <header className="flex min-w-0 flex-col gap-3 border-b border-of-border py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-of border border-of-border bg-of-surface-raised font-mono text-xs font-semibold text-of-accent shadow-[var(--of-shadow-sm)]">
              {project.data.key.slice(0, 2)}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="break-words text-lg font-semibold">{project.data.name}</h2>
                <Badge variant="outline">{project.data.key}</Badge>
                {project.data.archived_at ? <Badge variant="neutral">보관됨</Badge> : null}
              </div>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-of-muted">
                {project.data.description || '설명은 프로젝트 설정에서 추가할 수 있습니다.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Link to={`/projects/${projectId}/work-packages`} className="inline-flex h-8 items-center gap-1.5 rounded-of border border-of-border bg-of-surface px-2.5 text-xs font-medium hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus">
              <ListChecks size={14} /> Work items
            </Link>
            <Link to={`/projects/${projectId}/dashboard`} className="inline-flex h-8 items-center gap-1.5 rounded-of border border-of-border bg-of-surface px-2.5 text-xs font-medium hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus">
              <LayoutDashboard size={14} /> 대시보드
            </Link>
            {myRole === 'owner' ? (
              <Link to={`/projects/${projectId}/settings`} className="inline-flex h-8 w-8 items-center justify-center rounded-of border border-of-border bg-of-surface text-of-muted hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus" aria-label="프로젝트 설정">
                <Settings size={14} />
              </Link>
            ) : null}
          </div>
        </header>

        <section aria-label="프로젝트 진행 요약" className="grid border-b border-of-border sm:grid-cols-4">
          <OverviewMetric label="전체 작업" value={String(data.total_work_packages)} />
          <OverviewMetric label="진행 중" value={String(data.open_work_packages)} />
          <OverviewMetric label="완료율" value={`${data.completion_percent}%`} />
          <OverviewMetric label="기한 초과" value={String(data.overdue_count)} danger={data.overdue_count > 0} />
        </section>

        <div className="grid min-w-0 gap-6 py-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="min-w-0 space-y-6">
            <ProjectLifecycleTimeline projectId={projectId} />
            <ProjectScheduleBaselinePanel projectId={projectId} canManage={canManageProject} />
            <section aria-label="최근 작업" className="min-w-0">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">최근 작업</h3>
                <Button variant="ghost" size="sm" onClick={() => navigate(`/projects/${projectId}/work-packages`)}>
                  전체 보기 <ArrowUpRight size={13} />
                </Button>
              </div>
              {data.recent_work_packages.length === 0 ? (
                <p className="border-y border-of-border py-10 text-center text-xs text-of-muted">아직 작업이 없습니다.</p>
              ) : (
                <ul className="divide-y divide-of-border border-y border-of-border">
                  {data.recent_work_packages.map((item) => (
                    <li key={item.id}>
                      <button type="button" className="grid min-h-12 w-full min-w-0 gap-1 px-2 py-2 text-left hover:bg-of-surface-hover sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" onClick={() => navigate(`/projects/${projectId}/work-packages?wp=${item.id}`)}>
                        <span className="truncate text-[13px] font-medium">{item.subject}</span>
                        <span className="flex flex-wrap items-center gap-2 text-[11px] text-of-muted">
                          <StatusChip status={item.status} />
                          <PriorityChip priority={item.priority} />
                          <span>{item.assignee_name ?? '담당자 없음'}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <ProjectHealthHistoryTimeline projectId={projectId} />
            <RecentActivity projectId={projectId} />
          </div>

          <aside aria-label="프로젝트 정보" className="min-w-0 border-t border-of-border pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
            <div className="flex items-center gap-2 text-xs font-semibold"><Gauge size={14} /> 프로젝트 신호</div>
            <dl className="mt-3 divide-y divide-of-border text-xs">
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-of-muted">상태</dt>
                <dd>
                  {project.data.health ? (
                    <span className={cn('inline-flex min-h-5 items-center rounded-full px-2 font-medium', HEALTH_STYLES[project.data.health])}>{HEALTH_LABELS[project.data.health]}</span>
                  ) : <Badge variant="neutral">미설정</Badge>}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-of-muted">멤버</dt>
                <dd className="font-medium tabular-nums">{members.data?.total ?? '...'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-of-muted">예상 시간</dt>
                <dd className="font-medium tabular-nums">{data.total_estimated_hours}h</dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-of-muted">소요 시간</dt>
                <dd className="font-medium tabular-nums">{data.total_spent_hours}h</dd>
              </div>
              <div className="py-2.5">
                <dt className="text-of-muted">최근 업데이트</dt>
                <dd className="mt-1 font-medium">{formatDateTime(project.data.updated_at)}</dd>
              </div>
            </dl>
            {project.data.health_note ? (
              <p className="mt-4 border-l-2 border-of-accent px-3 text-xs leading-5 text-of-muted">{project.data.health_note}</p>
            ) : null}
          </aside>
        </div>
      </div>

      {canChangeCover ? (
        <CoverDialog
          project={project.data}
          open={coverOpen}
          onOpenChange={setCoverOpen}
          returnFocusRef={coverTriggerRef}
        />
      ) : null}
    </div>
  )
}
