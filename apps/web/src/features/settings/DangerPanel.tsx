import * as Dialog from '@radix-ui/react-dialog'
import {
  Archive,
  CheckCircle2,
  Database,
  LockKeyhole,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  X,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { useParams } from 'react-router-dom'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ModalContent, ModalOverlay } from '@/components/ui/modal'
import { useArchiveProject, useProject } from '@/features/projects/api'
import { ApiError } from '@/lib/api'

function actionError(error: unknown, archive: boolean) {
  if (error instanceof ApiError && error.message) return error.message
  return archive
    ? '프로젝트를 보관하지 못했습니다.'
    : '프로젝트를 복원하지 못했습니다.'
}

export function DangerPanel({ isOwner }: { isOwner: boolean }) {
  const { projectId } = useParams() as { projectId: string }
  const project = useProject(projectId)
  const archive = useArchiveProject(projectId)
  const actionButtonRef = useRef<HTMLButtonElement>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [failedAction, setFailedAction] = useState<boolean | null>(null)
  const [feedback, setFeedback] = useState('')

  if (project.isPending && !project.data) {
    return (
      <section aria-label="프로젝트 위험 구역" className="min-w-0">
        <ListSkeleton rows={4} />
      </section>
    )
  }
  if (!project.data) {
    return (
      <ErrorState
        error={project.error}
        onRetry={() => void project.refetch()}
      />
    )
  }

  const archived = project.data.archived_at !== null
  const projectStale = project.isError
  const actionBlocked = archive.isPending || projectStale
  const runAction = async (shouldArchive: boolean) => {
    if (projectStale) return
    setFeedback('')
    setFailedAction(null)
    try {
      await archive.mutateAsync(shouldArchive)
      setConfirmOpen(false)
      setFeedback(
        shouldArchive
          ? '프로젝트를 보관했습니다. 모든 변경이 잠겼습니다.'
          : '프로젝트를 복원했습니다. 다시 변경할 수 있습니다.',
      )
    } catch {
      setFailedAction(shouldArchive)
    }
  }

  return (
    <>
      <section
        aria-label="프로젝트 위험 구역"
        aria-busy={project.isFetching}
        className="min-w-0 overflow-hidden rounded-of border border-of-border bg-of-surface"
      >
        <header className="flex min-w-0 flex-col gap-3 border-b border-of-border px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-of bg-of-danger-soft text-of-danger">
              <ShieldAlert size={16} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase text-of-muted">
                Project lifecycle
              </p>
              <h2 className="mt-1 text-sm font-semibold">프로젝트 보관</h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">
                프로젝트를 보관하거나 복원하고 팀에 미치는 영향을 확인합니다.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 self-start">
            {projectStale ? (
              <Badge variant="warning">최신 상태 확인 필요</Badge>
            ) : null}
            <Badge variant={archived ? 'warning' : 'success'}>
              {archived ? '보관됨 · 읽기 전용' : '활성 · 변경 가능'}
            </Badge>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="프로젝트 상태 새로고침"
              title="프로젝트 상태 새로고침"
              disabled={project.isFetching || archive.isPending}
              onClick={() => void project.refetch()}
            >
              <RefreshCw
                size={14}
                aria-hidden="true"
                className={project.isFetching ? 'animate-spin' : undefined}
              />
            </Button>
          </div>
        </header>

        {projectStale ? (
          <div
            role="alert"
            className="flex min-w-0 flex-col gap-2 border-b border-of-warning/20 bg-of-warning-soft px-4 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="min-w-0 break-words text-of-warning">
              프로젝트 최신 상태를 확인하지 못해 마지막 확인 상태를 표시합니다. 복구 전에는 보관과 복원이 잠깁니다.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full shrink-0 sm:w-auto"
              disabled={project.isFetching}
              onClick={() => void project.refetch()}
            >
              <RefreshCw
                size={13}
                aria-hidden="true"
                className={project.isFetching ? 'animate-spin' : undefined}
              />
              프로젝트 상태 다시 시도
            </Button>
          </div>
        ) : null}

        <div className="divide-y divide-of-border-subtle">
          <LifecycleRow
            icon={LockKeyhole}
            title={archived ? '모든 변경이 잠겨 있습니다' : '보관 즉시 변경이 잠깁니다'}
            description={
              archived
                ? '작업, 설정, 문서와 프로젝트 데이터의 쓰기 요청이 차단됩니다.'
                : '보관 후에는 프로젝트 전체가 읽기 전용으로 전환됩니다.'
            }
          />
          <LifecycleRow
            icon={Database}
            title="프로젝트 데이터는 유지됩니다"
            description="작업, 파일, 문서와 활동 기록은 삭제되지 않으며 계속 조회할 수 있습니다."
          />
          <LifecycleRow
            icon={RotateCcw}
            title="소유자가 언제든 복원할 수 있습니다"
            description="복원하면 기존 데이터와 구성 그대로 프로젝트 변경이 다시 허용됩니다."
          />
        </div>

        <footer className="flex min-w-0 flex-col gap-3 border-t border-of-border bg-of-surface-2/35 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 text-xs leading-5 text-of-muted">
            {isOwner
              ? archived
                ? '복원하면 프로젝트가 즉시 활성 상태로 돌아갑니다.'
                : '보관 전 팀의 진행 중인 변경을 확인하세요.'
              : '프로젝트 소유자만 보관하거나 복원할 수 있습니다.'}
          </p>
          {isOwner ? (
            archived ? (
              <Button
                ref={actionButtonRef}
                type="button"
                size="sm"
                variant="outline"
                className="w-full shrink-0 sm:w-auto"
                disabled={actionBlocked}
                onClick={() => void runAction(false)}
              >
                <RotateCcw size={14} aria-hidden="true" />
                {archive.isPending ? '복원 중…' : '프로젝트 복원'}
              </Button>
            ) : (
              <Button
                ref={actionButtonRef}
                type="button"
                size="sm"
                variant="danger"
                className="w-full shrink-0 sm:w-auto"
                disabled={actionBlocked}
                onClick={() => {
                  setFeedback('')
                  setFailedAction(null)
                  setConfirmOpen(true)
                }}
              >
                <Archive size={14} aria-hidden="true" />
                프로젝트 보관
              </Button>
            )
          ) : (
            <Badge variant="outline" className="shrink-0 self-start sm:self-auto">
              읽기 전용
            </Badge>
          )}
        </footer>

        {feedback ? (
          <p
            role="status"
            className="flex items-center gap-2 border-t border-of-success/15 bg-of-success-soft px-4 py-2.5 text-xs text-of-success"
          >
            <CheckCircle2 size={14} aria-hidden="true" />
            {feedback}
          </p>
        ) : null}
        {failedAction === false ? (
          <div
            role="alert"
            className="flex min-w-0 flex-col gap-2 border-t border-of-danger/15 bg-of-danger-soft px-4 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="min-w-0 break-words text-of-danger">
              {actionError(archive.error, false)}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full shrink-0 sm:w-auto"
              disabled={actionBlocked}
              onClick={() => void runAction(false)}
            >
              <RefreshCw size={13} aria-hidden="true" />
              복원 다시 시도
            </Button>
          </div>
        ) : null}
      </section>

      <Dialog.Root
        open={confirmOpen}
        onOpenChange={(next) => {
          if (archive.isPending) return
          setConfirmOpen(next)
          if (!next) setFailedAction(null)
        }}
      >
        <Dialog.Portal>
          <ModalOverlay className="bg-black/40" />
          <ModalContent
            className="w-[min(29rem,calc(100vw-1.5rem))] rounded-of-lg border border-of-border bg-of-surface-raised shadow-[var(--of-shadow-popover)]"
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              actionButtonRef.current?.focus()
            }}
          >
            <header className="flex items-start gap-3 border-b border-of-border-subtle px-4 py-3.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-of bg-of-danger-soft text-of-danger">
                <Archive size={15} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <Dialog.Title className="text-sm font-semibold">
                  프로젝트를 보관할까요?
                </Dialog.Title>
                <Dialog.Description className="mt-1 break-words text-xs leading-5 text-of-muted">
                  <span className="font-medium text-of-text">{project.data.name}</span>
                  의 모든 변경이 즉시 잠깁니다. 데이터는 삭제되지 않습니다.
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="보관 확인 창 닫기"
                  disabled={archive.isPending}
                >
                  <X size={14} aria-hidden="true" />
                </Button>
              </Dialog.Close>
            </header>

            <div className="px-4 py-4">
              <ul className="list-disc space-y-2 pl-4 text-xs leading-5 text-of-muted">
                <li>작업, 설정, 문서와 파일의 변경이 차단됩니다.</li>
                <li>프로젝트와 기존 기록은 계속 조회할 수 있습니다.</li>
                <li>프로젝트 소유자가 언제든 복원할 수 있습니다.</li>
              </ul>
              {failedAction === true ? (
                <p
                  role="alert"
                  className="mt-4 rounded-of border border-of-danger/15 bg-of-danger-soft px-3 py-2 text-xs leading-5 text-of-danger"
                >
                  {actionError(archive.error, true)}
                </p>
              ) : null}
              {projectStale ? (
                <div
                  role="alert"
                  className="mt-4 flex min-w-0 flex-col gap-2 rounded-of border border-of-warning/20 bg-of-warning-soft px-3 py-2 text-xs leading-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <p className="min-w-0 break-words text-of-warning">
                    최신 프로젝트 상태를 확인할 때까지 보관할 수 없습니다.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full shrink-0 sm:w-auto"
                    disabled={project.isFetching}
                    onClick={() => void project.refetch()}
                  >
                    <RefreshCw
                      size={13}
                      aria-hidden="true"
                      className={project.isFetching ? 'animate-spin' : undefined}
                    />
                    프로젝트 상태 다시 시도
                  </Button>
                </div>
              ) : null}
            </div>

            <footer className="flex flex-col-reverse gap-2 border-t border-of-border-subtle px-4 py-3 sm:flex-row sm:justify-end">
              <Dialog.Close asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={archive.isPending}
                >
                  취소
                </Button>
              </Dialog.Close>
              <Button
                type="button"
                size="sm"
                variant="danger"
                disabled={actionBlocked}
                onClick={() => void runAction(true)}
              >
                <Archive size={14} aria-hidden="true" />
                {archive.isPending
                  ? '보관 중…'
                  : failedAction === true
                    ? '보관 다시 시도'
                    : '프로젝트 보관'}
              </Button>
            </footer>
          </ModalContent>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}

function LifecycleRow({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof ShieldAlert
  title: string
  description: string
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 px-4 py-3">
      <Icon
        size={15}
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-of-muted"
      />
      <div className="min-w-0">
        <p className="text-xs font-medium">{title}</p>
        <p className="mt-0.5 text-[11px] leading-5 text-of-muted">
          {description}
        </p>
      </div>
    </div>
  )
}
