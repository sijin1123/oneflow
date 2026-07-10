import {
  Copy,
  ExternalLink,
  Eye,
  Link as LinkIcon,
  Lock,
  MoreHorizontal,
  MoveRight,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { useDuplicateWorkPackage } from './api'
import type { WorkPackage } from './types'

export type CalendarItemActionMessage = {
  kind: 'success' | 'info' | 'error'
  text: string
}

type CalendarItemActionsProps = {
  projectId: string
  wp: WorkPackage
  canWrite: boolean
  onOpenDrawer: (id: string) => void
  onOpenMove: (id: string) => void
  onMessage: (message: CalendarItemActionMessage) => void
}

function detailPath(projectId: string, wpId: string) {
  return `/projects/${projectId}/work-packages/${wpId}`
}

export function CalendarItemActions({
  projectId,
  wp,
  canWrite,
  onOpenDrawer,
  onOpenMove,
  onMessage,
}: CalendarItemActionsProps) {
  const navigate = useNavigate()
  const duplicate = useDuplicateWorkPackage(projectId)
  const path = detailPath(projectId, wp.id)

  const copyLink = async () => {
    const href = `${window.location.origin}${path}`
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(href)
      onMessage({ kind: 'success', text: `'${wp.subject}' 링크를 복사했습니다.` })
    } catch {
      onMessage({ kind: 'info', text: `복사할 링크: ${href}` })
    }
  }

  const duplicateItem = () => {
    duplicate.mutate(wp.id, {
      onSuccess: (result) => {
        const skipped =
          result.skipped_custom_values > 0
            ? ` · 복사되지 않은 커스텀 값 ${result.skipped_custom_values}건`
            : ''
        onMessage({ kind: 'success', text: `'${result.work_package.subject}' 생성됨${skipped}` })
      },
      onError: () => onMessage({ kind: 'error', text: `'${wp.subject}' 복제에 실패했습니다.` }),
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="캘린더 항목 작업"
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-of border border-transparent text-of-accent opacity-100 transition-all hover:border-of-border hover:bg-of-surface hover:text-of-fg focus-visible:border-of-border focus-visible:bg-of-surface focus-visible:text-of-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <MoreHorizontal size={13} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56" onClick={(event) => event.stopPropagation()}>
        <DropdownMenuLabel>캘린더 항목</DropdownMenuLabel>
        <DropdownMenuItem className="flex items-center gap-2 text-xs" onSelect={() => onOpenDrawer(wp.id)}>
          <Eye size={13} /> 상세 드로어 열기
        </DropdownMenuItem>
        <DropdownMenuItem className="flex items-center gap-2 text-xs" onSelect={() => navigate(path)}>
          <ExternalLink size={13} /> 전체 페이지 열기
        </DropdownMenuItem>
        <DropdownMenuItem className="flex items-center gap-2 text-xs" onSelect={() => void copyLink()}>
          <LinkIcon size={13} /> 링크 복사
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        {canWrite ? (
          <>
            <DropdownMenuLabel>변경</DropdownMenuLabel>
            <DropdownMenuItem
              className="flex items-center gap-2 text-xs"
              disabled={duplicate.isPending}
              onSelect={duplicateItem}
            >
              <Copy size={13} /> 복제
            </DropdownMenuItem>
            <DropdownMenuItem
              className="flex items-center gap-2 text-xs"
              onSelect={() => {
                onOpenMove(wp.id)
                onMessage({ kind: 'info', text: `'${wp.subject}' 이동 패널을 열었습니다.` })
              }}
            >
              <MoveRight size={13} /> 이동
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuLabel className="flex items-center gap-2 text-xs normal-case text-of-muted">
            <Lock size={12} /> 읽기 전용
          </DropdownMenuLabel>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
