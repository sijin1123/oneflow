import * as Dialog from '@radix-ui/react-dialog'
import {
  ArrowUpRight,
  Camera,
  Check,
  Gauge,
  LayoutDashboard,
  ListChecks,
  Loader2,
  Pencil,
  RefreshCw,
  Settings,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { FrameContextActions } from '@/components/shell/FrameContextActions'
import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ModalContent, ModalOverlay } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/textarea'
import { useDeleteAttachment, useUploadAttachment } from '@/features/attachments/api'
import { useDashboard } from '@/features/dashboard/api'
import { RecentActivity } from '@/features/dashboard/RecentActivity'
import { useMe, useMembers } from '@/features/members/api'
import { PriorityChip, StatusChip } from '@/features/work-packages/chips'
import { ApiError } from '@/lib/api'
import { formatDateTime } from '@/lib/datetime'
import { useUnsavedChangesPrompt } from '@/lib/guards'
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

function mutationMessage(error: unknown, fallback: string) {
  return error instanceof ApiError && error.message ? error.message : fallback
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
  const [failedAction, setFailedAction] = useState<'upload' | 'remove' | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const busy = upload.isPending || update.isPending || cleanupUpload.isPending

  useEffect(() => {
    if (open) return
    setError('')
    setFailedAction(null)
    setPendingFile(null)
  }, [open])

  const choose = async (file: File | undefined) => {
    if (!file) return
    if (!COVER_TYPES.has(file.type)) {
      setError('PNG, JPEG, GIF 또는 WebP 이미지를 선택해 주세요.')
      setFailedAction(null)
      setPendingFile(null)
      return
    }
    setPendingFile(file)
    setError('')
    setFailedAction(null)
    let uploadedId: string | null = null
    try {
      const attachment = await upload.mutateAsync({ file })
      uploadedId = attachment.id
      await update.mutateAsync({ cover_attachment_id: attachment.id })
      setPendingFile(null)
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
      setFailedAction('upload')
    }
  }

  const remove = async () => {
    setError('')
    setFailedAction(null)
    try {
      await update.mutateAsync({ cover_attachment_id: null })
      onOpenChange(false)
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : '표지를 제거하지 못했습니다.')
      setFailedAction('remove')
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
          {error ? (
            <div role="alert" className="mt-3 flex items-center justify-between gap-3 border-t border-of-danger/15 pt-3 text-xs text-of-danger">
              <span>{error}</span>
              {failedAction ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || (failedAction === 'upload' && !pendingFile)}
                  onClick={() => {
                    if (failedAction === 'remove') void remove()
                    else if (pendingFile) void choose(pendingFile)
                  }}
                >
                  <RefreshCw size={13} /> 다시 시도
                </Button>
              ) : null}
            </div>
          ) : null}
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
  const updateBrief = useUpdateProject(projectId)
  const [coverOpen, setCoverOpen] = useState(false)
  const [briefEditing, setBriefEditing] = useState(false)
  const [briefDraft, setBriefDraft] = useState('')
  const [briefNotice, setBriefNotice] = useState('')
  const [briefFailed, setBriefFailed] = useState(false)
  const coverTriggerRef = useRef<HTMLButtonElement>(null)
  const briefTriggerRef = useRef<HTMLButtonElement>(null)
  const briefInputRef = useRef<HTMLTextAreaElement>(null)
  const restoreBriefFocusRef = useRef(false)

  const persistedBrief = project.data?.description?.trim() ?? ''
  const normalizedBrief = briefDraft.trim()
  const briefDirty = briefEditing && normalizedBrief !== persistedBrief

  useUnsavedChangesPrompt(
    briefDirty,
    '저장하지 않은 프로젝트 개요 변경이 있습니다. 페이지를 이동할까요?',
  )

  useEffect(() => {
    if (!briefEditing && project.data) setBriefDraft(project.data.description ?? '')
  }, [briefEditing, project.data])

  useEffect(() => {
    if (!briefEditing) return
    const frame = window.requestAnimationFrame(() => briefInputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [briefEditing])

  useEffect(() => {
    if (briefEditing || !restoreBriefFocusRef.current) return
    restoreBriefFocusRef.current = false
    const frame = window.requestAnimationFrame(() => briefTriggerRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [briefEditing])

  if (project.isPending) return <ListSkeleton />
  if (project.isError) return <ErrorState error={project.error} onRetry={() => project.refetch()} />

  const myRole = members.data?.items.find((member) => member.user_id === me.data?.id)?.role
  const canManageProject = myRole === 'owner' && !project.data.archived_at
  const canChangeCover = canManageProject
  const memberQueryFailed = members.isError || me.isError
  const briefError = mutationMessage(updateBrief.error, '프로젝트 개요를 저장하지 못했습니다.')

  const startBriefEdit = () => {
    updateBrief.reset()
    setBriefFailed(false)
    setBriefNotice('')
    setBriefDraft(project.data.description ?? '')
    setBriefEditing(true)
  }

  const saveBrief = async () => {
    if (!briefDirty || updateBrief.isPending) return
    updateBrief.reset()
    setBriefFailed(false)
    try {
      await updateBrief.mutateAsync({ description: normalizedBrief || null })
      setBriefNotice('프로젝트 개요를 저장했습니다.')
      restoreBriefFocusRef.current = true
      setBriefEditing(false)
    } catch {
      setBriefFailed(true)
    }
  }

  const cancelBriefEdit = () => {
    if (updateBrief.isPending) return
    setBriefDraft(project.data.description ?? '')
    setBriefFailed(false)
    updateBrief.reset()
    restoreBriefFocusRef.current = true
    setBriefEditing(false)
  }

  return (
    <div className="flex h-full min-w-0 flex-col bg-of-surface">
      <h1 className="sr-only">{project.data.name} Overview</h1>
      <FrameContextActions>
        {canManageProject ? (
          <>
            <Button
              ref={briefTriggerRef}
              type="button"
              size="sm"
              variant="outline"
              disabled={briefEditing || updateBrief.isPending}
              onClick={startBriefEdit}
            >
              <Pencil size={13} /> 개요 편집
            </Button>
            <Button
              ref={coverTriggerRef}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setCoverOpen(true)}
            >
              <Camera size={13} /> 표지 변경
            </Button>
          </>
        ) : null}
        <Link
          to={`/projects/${projectId}/work-packages`}
          className="of-touch-target inline-flex h-7 items-center justify-center gap-1.5 whitespace-nowrap rounded-of border border-of-border bg-of-surface px-2 text-xs font-medium hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
        >
          <ListChecks size={13} /> Work items
        </Link>
        <Link
          to={`/projects/${projectId}/dashboard`}
          className="of-touch-target inline-flex h-7 items-center justify-center gap-1.5 whitespace-nowrap rounded-of border border-of-border bg-of-surface px-2 text-xs font-medium hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
        >
          <LayoutDashboard size={13} /> 대시보드
        </Link>
        {myRole === 'owner' ? (
          <Link
            to={`/projects/${projectId}/settings`}
            className="of-touch-target inline-flex h-7 w-7 items-center justify-center rounded-of border border-of-border bg-of-surface text-of-muted hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
            aria-label="프로젝트 설정"
          >
            <Settings size={13} />
          </Link>
        ) : null}
      </FrameContextActions>

      <div data-testid="project-overview-scroll" className="of-scrollbar min-h-0 flex-1 overflow-y-auto">
        <ProjectCover
          projectKey={project.data.key}
          projectName={project.data.name}
          attachmentId={project.data.cover_attachment_id}
          className="h-32 border-b border-of-border sm:h-40"
        >
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 via-black/20 to-transparent px-4 pb-3 pt-12 text-white sm:px-6">
            <div className="mx-auto flex w-full max-w-6xl min-w-0 items-end gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-of border border-white/35 bg-white/90 font-mono text-xs font-semibold text-of-accent shadow-[var(--of-shadow-sm)]">
                {project.data.key.slice(0, 2)}
              </span>
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h2 className="truncate text-base font-semibold sm:text-lg">{project.data.name}</h2>
                  <span className="rounded-of border border-white/30 bg-black/20 px-1.5 py-0.5 font-mono text-[10px]">
                    {project.data.key}
                  </span>
                  {project.data.archived_at ? (
                    <span className="rounded-of border border-white/30 bg-black/20 px-1.5 py-0.5 text-[10px]">보관됨</span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </ProjectCover>

        <div className="mx-auto w-full max-w-6xl min-w-0 px-3 pb-8 sm:px-5">
          <section aria-label="프로젝트 개요" className="border-b border-of-border py-4">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">프로젝트 개요</h3>
                <p className="mt-0.5 text-[11px] text-of-muted">
                  팀이 공유하는 목표와 범위를 한곳에서 확인합니다.
                </p>
              </div>
              {briefNotice ? (
                <span role="status" className="flex shrink-0 items-center gap-1 text-[11px] text-of-success">
                  <Check size={12} /> {briefNotice}
                </span>
              ) : null}
            </div>
            {briefEditing ? (
              <div className="mt-3">
                <Textarea
                  ref={briefInputRef}
                  aria-label="프로젝트 개요 내용"
                  value={briefDraft}
                  maxLength={20_000}
                  disabled={updateBrief.isPending}
                  className="min-h-28 resize-y text-xs leading-5"
                  placeholder="프로젝트의 목표, 범위와 성공 기준을 입력하세요."
                  onChange={(event) => {
                    setBriefDraft(event.target.value)
                    setBriefFailed(false)
                    updateBrief.reset()
                  }}
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[10px] tabular-nums text-of-muted">
                    {briefDraft.length.toLocaleString()} / 20,000
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button type="button" size="sm" variant="outline" disabled={updateBrief.isPending} onClick={cancelBriefEdit}>
                      취소
                    </Button>
                    <Button type="button" size="sm" disabled={!briefDirty || updateBrief.isPending} onClick={() => void saveBrief()}>
                      {updateBrief.isPending ? <Loader2 className="animate-spin" size={13} /> : <Check size={13} />}
                      {briefFailed ? '저장 다시 시도' : updateBrief.isPending ? '저장 중...' : '저장'}
                    </Button>
                  </div>
                </div>
                {briefFailed ? (
                  <div role="alert" className="mt-2 flex items-center justify-between gap-3 border-t border-of-danger/15 pt-2 text-xs text-of-danger">
                    <span>{briefError}</span>
                    <Button type="button" size="sm" variant="outline" disabled={updateBrief.isPending} onClick={() => void saveBrief()}>
                      <RefreshCw size={13} /> 다시 시도
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-of-secondary">
                {project.data.description || '아직 프로젝트 개요가 없습니다.'}
              </p>
            )}
          </section>

          <section aria-label="프로젝트 진행 요약" className="grid border-b border-of-border sm:grid-cols-4">
            {dashboard.isPending ? (
              [0, 1, 2, 3].map((item) => (
                <div key={item} className="border-b border-of-border-subtle px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
                  <div className="h-3 w-16 animate-pulse rounded bg-of-surface-hover" />
                  <div className="mt-2 h-5 w-10 animate-pulse rounded bg-of-surface-hover" />
                </div>
              ))
            ) : dashboard.isError ? (
              <div role="alert" className="col-span-full flex min-h-20 flex-wrap items-center justify-between gap-3 px-3 py-4 text-xs">
                <span className="text-of-danger">프로젝트 진행 요약을 불러오지 못했습니다.</span>
                <Button type="button" size="sm" variant="outline" onClick={() => void dashboard.refetch()}>
                  <RefreshCw size={13} /> 다시 시도
                </Button>
              </div>
            ) : (
              <>
                <OverviewMetric label="전체 작업" value={String(dashboard.data.total_work_packages)} />
                <OverviewMetric label="진행 중" value={String(dashboard.data.open_work_packages)} />
                <OverviewMetric label="완료율" value={`${dashboard.data.completion_percent}%`} />
                <OverviewMetric label="기한 초과" value={String(dashboard.data.overdue_count)} danger={dashboard.data.overdue_count > 0} />
              </>
            )}
          </section>

          <div className="grid min-w-0 gap-6 py-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
            <div className="min-w-0 space-y-6">
              <ProjectLifecycleTimeline projectId={projectId} />
              <ProjectScheduleBaselinePanel projectId={projectId} canManage={canManageProject} />
              {dashboard.data ? (
                <section aria-label="최근 작업" className="min-w-0">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold">최근 작업</h3>
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/projects/${projectId}/work-packages`)}>
                      전체 보기 <ArrowUpRight size={13} />
                    </Button>
                  </div>
                  {dashboard.data.recent_work_packages.length === 0 ? (
                    <p className="border-y border-of-border py-10 text-center text-xs text-of-muted">아직 작업이 없습니다.</p>
                  ) : (
                    <ul className="divide-y divide-of-border border-y border-of-border">
                      {dashboard.data.recent_work_packages.map((item) => (
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
              ) : null}
              <ProjectHealthHistoryTimeline projectId={projectId} />
              <RecentActivity projectId={projectId} />
            </div>

            <aside aria-label="프로젝트 정보" className="min-w-0 border-t border-of-border pt-4 lg:sticky lg:top-4 lg:self-start lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
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
                  <dd className="font-medium tabular-nums">
                    {members.isPending || me.isPending ? '...' : memberQueryFailed ? '확인 실패' : members.data.total}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="text-of-muted">예상 시간</dt>
                  <dd className="font-medium tabular-nums">{dashboard.data ? `${dashboard.data.total_estimated_hours}h` : '-'}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="text-of-muted">소요 시간</dt>
                  <dd className="font-medium tabular-nums">{dashboard.data ? `${dashboard.data.total_spent_hours}h` : '-'}</dd>
                </div>
                <div className="py-2.5">
                  <dt className="text-of-muted">최근 업데이트</dt>
                  <dd className="mt-1 font-medium">{formatDateTime(project.data.updated_at)}</dd>
                </div>
              </dl>
              {memberQueryFailed ? (
                <div role="alert" className="mt-3 border-t border-of-danger/15 pt-3 text-xs text-of-danger">
                  <p>멤버와 내 권한을 확인하지 못했습니다.</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => {
                      void members.refetch()
                      void me.refetch()
                    }}
                  >
                    <RefreshCw size={13} /> 다시 시도
                  </Button>
                </div>
              ) : null}
              {project.data.health_note ? (
                <p className="mt-4 border-l-2 border-of-accent px-3 text-xs leading-5 text-of-muted">{project.data.health_note}</p>
              ) : null}
            </aside>
          </div>
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
