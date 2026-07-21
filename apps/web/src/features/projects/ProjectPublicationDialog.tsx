import * as Dialog from '@radix-ui/react-dialog'
import { Copy, ExternalLink, Globe2, LoaderCircle, RefreshCw, ShieldCheck, X } from 'lucide-react'
import type { RefObject } from 'react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { ModalContent, ModalOverlay } from '@/components/ui/modal'
import { ApiError } from '@/lib/api'

import {
  useProjectPublication,
  usePublishProject,
  useRevokeProjectPublication,
} from './api'
import type { ProjectListItem } from './types'

type ProjectPublicationDialogProps = {
  project: ProjectListItem
  open: boolean
  onOpenChange: (open: boolean) => void
  onMessage: (message: string) => void
  returnFocusRef: RefObject<HTMLButtonElement | null>
}

function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof ApiError ? cause.message : fallback
}

export function ProjectPublicationDialog({
  project,
  open,
  onOpenChange,
  onMessage,
  returnFocusRef,
}: ProjectPublicationDialogProps) {
  const publication = useProjectPublication(project.id, open)
  const publish = usePublishProject(project.id)
  const revoke = useRevokeProjectPublication(project.id)
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const [localError, setLocalError] = useState('')
  const busy = publish.isPending || revoke.isPending
  const publicUrl = publication.data?.public_id
    ? `${window.location.origin}/public/projects/${publication.data.public_id}`
    : null

  const copyPublicLink = async () => {
    if (!publicUrl) return
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(publicUrl)
      onMessage(`'${project.name}' 공개 링크를 복사했습니다.`)
    } catch {
      onMessage(`복사할 공개 링크: ${publicUrl}`)
    }
  }

  const createPublication = () => {
    setLocalError('')
    publish.mutate(undefined, {
      onSuccess: () => onMessage(`'${project.name}' 프로젝트를 공개했습니다.`),
      onError: (cause) => setLocalError(errorMessage(cause, '프로젝트를 공개하지 못했습니다.')),
    })
  }

  const revokePublication = () => {
    setLocalError('')
    revoke.mutate(undefined, {
      onSuccess: () => {
        setConfirmRevoke(false)
        onMessage(`'${project.name}' 공개를 중지했습니다.`)
      },
      onError: (cause) => setLocalError(errorMessage(cause, '공개를 중지하지 못했습니다.')),
    })
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (busy) return
        setConfirmRevoke(false)
        setLocalError('')
        onOpenChange(next)
      }}
    >
      <Dialog.Portal>
        <ModalOverlay className="bg-black/40" />
        <ModalContent
          className="w-[min(31rem,calc(100vw-1.5rem))] rounded-of-lg border border-of-border bg-of-surface-raised shadow-[var(--of-shadow-popover)]"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            returnFocusRef.current?.focus()
          }}
        >
          <header className="flex items-start gap-3 border-b border-of-border-subtle px-4 py-3.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-of bg-of-accent-soft text-of-accent">
              <Globe2 size={16} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="truncate text-sm font-semibold">프로젝트 공개</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs leading-5 text-of-muted">
                {project.name}의 제한된 요약을 로그인 없이 볼 수 있는 링크로 공유합니다.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="프로젝트 공개 창 닫기" disabled={busy}>
                <X size={14} />
              </Button>
            </Dialog.Close>
          </header>

          <div className="px-4 py-4">
            {publication.isPending ? (
              <div role="status" className="flex min-h-32 items-center justify-center gap-2 text-xs text-of-muted">
                <LoaderCircle className="animate-spin" size={15} /> 공개 상태 확인 중…
              </div>
            ) : publication.isError ? (
              <div className="py-5 text-center">
                <p role="alert" className="text-xs text-of-danger">공개 상태를 확인하지 못했습니다.</p>
                <Button type="button" className="mt-3" size="sm" variant="outline" onClick={() => void publication.refetch()}>
                  <RefreshCw size={13} /> 다시 시도
                </Button>
              </div>
            ) : publication.data?.published && publicUrl ? (
              <div className="space-y-4">
                <div className="flex items-start gap-2 border-y border-of-border-subtle py-3">
                  <ShieldCheck className="mt-0.5 shrink-0 text-emerald-600" size={16} aria-hidden="true" />
                  <div>
                    <p className="text-xs font-semibold text-of-text">공개 중</p>
                    <p className="mt-0.5 text-[11px] leading-5 text-of-muted">
                      링크를 가진 사람은 프로젝트 이름·설명과 작업 집계만 읽을 수 있습니다.
                    </p>
                  </div>
                </div>
                <label className="block text-xs font-medium text-of-text">
                  공개 링크
                  <div className="mt-1 flex min-w-0 gap-2">
                    <input
                      aria-label="프로젝트 공개 링크"
                      className="h-8 min-w-0 flex-1 truncate rounded-of border border-of-border bg-of-surface-2 px-2 text-xs text-of-secondary outline-none"
                      readOnly
                      value={publicUrl}
                    />
                    <Button type="button" size="sm" variant="outline" onClick={() => void copyPublicLink()}>
                      <Copy size={13} /> 복사
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="공개 페이지 새 탭에서 열기"
                      onClick={() => window.open(publicUrl, '_blank', 'noopener,noreferrer')}
                    >
                      <ExternalLink size={14} />
                    </Button>
                  </div>
                </label>
                <div className="text-[11px] leading-5 text-of-muted">
                  공개되지 않는 정보: 작업 제목과 설명, 회원, 예산, 상태 메모, 문서, 파일, 댓글.
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-of-border-subtle pt-3">
                  {confirmRevoke ? (
                    <>
                      <span className="mr-auto text-[11px] text-of-danger">현재 링크가 즉시 무효화됩니다.</span>
                      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmRevoke(false)}>
                        취소
                      </Button>
                      <Button type="button" size="sm" variant="danger" disabled={busy} onClick={revokePublication}>
                        {revoke.isPending ? '중지 중…' : '공개 중지'}
                      </Button>
                    </>
                  ) : (
                    <Button type="button" size="sm" variant="subtleDanger" onClick={() => setConfirmRevoke(true)}>
                      공개 중지
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <div className="border-y border-of-border-subtle py-3 text-xs leading-5 text-of-secondary">
                  공개하면 프로젝트 이름·설명과 전체/진행/완료 작업 수만 공유됩니다. 개별 작업과 내부 협업 정보는 포함하지 않습니다.
                </div>
                <div className="mt-4 flex justify-end">
                  <Button type="button" size="sm" disabled={busy || Boolean(project.archived_at)} onClick={createPublication}>
                    <Globe2 size={13} /> {publish.isPending ? '공개 중…' : '프로젝트 공개'}
                  </Button>
                </div>
              </div>
            )}
            {localError ? <p role="alert" className="mt-3 text-xs text-of-danger">{localError}</p> : null}
          </div>
        </ModalContent>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
