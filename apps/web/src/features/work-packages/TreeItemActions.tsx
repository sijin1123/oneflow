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

import { Button } from '@/components/ui/button'
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

function detailPath(projectId: string, wpId: string) {
  return `/projects/${projectId}/work-packages/${wpId}`
}

export function TreeItemActions({
  wp,
  projectId,
  canWrite,
  onOpen,
  onOpenMove,
  onMessage,
}: {
  wp: WorkPackage
  projectId: string
  canWrite: boolean
  onOpen: (id: string) => void
  onOpenMove: (id: string) => void
  onMessage: (message: string, tone?: 'info' | 'success' | 'error') => void
}) {
  const navigate = useNavigate()
  const duplicate = useDuplicateWorkPackage(projectId)
  const href = detailPath(projectId, wp.id)

  const copyLink = async () => {
    const link = `${window.location.origin}${href}`
    window.localStorage.setItem('__copied_tree_item_link', link)
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link)
        onMessage(`'${wp.subject}' 링크를 복사했습니다.`, 'success')
        return
      }
      onMessage(`'${wp.subject}' 링크를 준비했습니다.`, 'info')
    } catch {
      onMessage(`'${wp.subject}' 링크를 준비했습니다.`, 'info')
    }
  }

  const duplicateItem = () => {
    duplicate.mutate(wp.id, {
      onSuccess: (result) => {
        const skipped = result.skipped_custom_values
          ? ` · 복사되지 않은 커스텀 값 ${result.skipped_custom_values}건`
          : ''
        onMessage(`'${result.work_package.subject}' 생성됨${skipped}`, 'success')
      },
      onError: () => onMessage('트리 항목을 복제하지 못했습니다.', 'error'),
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`${wp.subject} 트리 항목 작업`}
          className="h-7 w-7 shrink-0 text-of-muted opacity-100 transition-opacity hover:text-of-fg sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreHorizontal size={15} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate text-[11px] uppercase tracking-normal">
          트리 항목
        </DropdownMenuLabel>
        <DropdownMenuItem className="flex items-center gap-2 text-xs" onSelect={() => onOpen(wp.id)}>
          <Eye size={13} /> 상세 드로어 열기
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex items-center gap-2 text-xs"
          onSelect={() => navigate(href)}
        >
          <ExternalLink size={13} /> 전체 페이지 열기
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex items-center gap-2 text-xs"
          onSelect={() => void copyLink()}
        >
          <LinkIcon size={13} /> 링크 복사
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {canWrite ? (
          <>
            <DropdownMenuItem
              className="flex items-center gap-2 text-xs"
              disabled={duplicate.isPending}
              onSelect={duplicateItem}
            >
              <Copy size={13} /> 복제
            </DropdownMenuItem>
            <DropdownMenuItem
              className="flex items-center gap-2 text-xs"
              onSelect={() => onOpenMove(wp.id)}
            >
              <MoveRight size={13} /> 이동 패널 열기
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem disabled className="flex items-center gap-2 text-xs">
            <Lock size={13} /> 쓰기 권한 없음
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
