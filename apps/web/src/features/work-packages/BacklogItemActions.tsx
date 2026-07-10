import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Copy,
  ExternalLink,
  Eye,
  Link as LinkIcon,
  Lock,
  MoveRight,
  X,
} from 'lucide-react'

import { useDuplicateWorkPackage } from './api'
import type { WorkPackage } from './types'

function detailPath(projectId: string, wpId: string) {
  return `/projects/${projectId}/work-packages/${wpId}`
}

export function BacklogItemActions({
  wp,
  projectId,
  canWrite,
  top,
  left,
  onOpen,
  onOpenMove,
  onMessage,
  onClose,
}: {
  wp: WorkPackage
  projectId: string
  canWrite: boolean
  top: number
  left: number
  onOpen: (id: string) => void
  onOpenMove: (id: string) => void
  onMessage: (message: string, tone?: 'info' | 'success' | 'error') => void
  onClose: () => void
}) {
  const navigate = useNavigate()
  const duplicate = useDuplicateWorkPackage(projectId)
  const href = detailPath(projectId, wp.id)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const copyLink = async () => {
    const link = `${window.location.origin}${href}`
    window.localStorage.setItem('__copied_backlog_item_link', link)
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link)
        onMessage(`'${wp.subject}' 링크를 복사했습니다.`, 'success')
        onClose()
        return
      }
      onMessage(`'${wp.subject}' 링크를 준비했습니다.`, 'info')
    } catch {
      onMessage(`'${wp.subject}' 링크를 준비했습니다.`, 'info')
    }
    onClose()
  }

  const duplicateItem = () => {
    duplicate.mutate(wp.id, {
      onSuccess: (result) => {
        const skipped = result.skipped_custom_values
          ? ` · 복사되지 않은 커스텀 값 ${result.skipped_custom_values}건`
          : ''
        onMessage(`'${result.work_package.subject}' 생성됨${skipped}`, 'success')
        onClose()
      },
      onError: () => {
        onMessage('백로그 항목을 복제하지 못했습니다.', 'error')
        onClose()
      },
    })
  }

  return (
    <div
      role="menu"
      aria-label={`${wp.subject} 백로그 항목 작업`}
      className="fixed z-50 w-56 rounded-of border border-of-border bg-of-surface p-1 text-sm shadow-[var(--of-shadow-popover)]"
      style={{ top, left }}
    >
      <div className="flex items-center justify-between gap-2 px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-normal text-of-muted">
        <span className="truncate">백로그 항목</span>
        <button
          type="button"
          aria-label="백로그 항목 작업 닫기"
          className="rounded-[4px] p-0.5 hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
          onClick={onClose}
        >
          <X size={12} />
        </button>
      </div>
      <MenuButton
        onClick={() => {
          onOpen(wp.id)
          onClose()
        }}
      >
        <Eye size={13} /> 상세 드로어 열기
      </MenuButton>
      <MenuButton onClick={() => navigate(href)}>
        <ExternalLink size={13} /> 전체 페이지 열기
      </MenuButton>
      <MenuButton onClick={() => void copyLink()}>
        <LinkIcon size={13} /> 링크 복사
      </MenuButton>
      <div className="my-1 h-px bg-of-border" />
      {canWrite ? (
        <>
          <MenuButton disabled={duplicate.isPending} onClick={duplicateItem}>
            <Copy size={13} /> 복제
          </MenuButton>
          <MenuButton
            onClick={() => {
              onOpenMove(wp.id)
              onClose()
            }}
          >
            <MoveRight size={13} /> 이동 패널 열기
          </MenuButton>
        </>
      ) : (
        <div
          role="menuitem"
          aria-disabled="true"
          className="flex min-h-7 cursor-default select-none items-center gap-2 rounded-[4px] px-2 py-1.5 text-xs text-of-muted opacity-70"
        >
          <Lock size={13} /> 쓰기 권한 없음
        </div>
      )}
    </div>
  )
}

function MenuButton({
  children,
  disabled = false,
  onClick,
}: {
  children: ReactNode
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className="flex min-h-7 w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left text-xs outline-none transition-colors hover:bg-of-surface-hover focus-visible:bg-of-surface-hover disabled:opacity-50"
      onClick={onClick}
    >
      {children}
    </button>
  )
}
