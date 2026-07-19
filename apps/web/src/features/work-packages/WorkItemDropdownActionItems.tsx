import { Copy, ExternalLink, Eye, Link as LinkIcon, Lock, MoveRight } from 'lucide-react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

import { useDuplicateWorkPackage } from './api'
import type { WorkPackage } from './types'

export type WorkItemActionTone = 'success' | 'info' | 'error'

type WorkItemDropdownActionProps = {
  projectId: string
  wp: WorkPackage
  canWrite: boolean
  surfaceLabel: string
  onOpenDrawer: (id: string) => void
  onOpenMove: (id: string) => void
  onMessage: (text: string, tone: WorkItemActionTone) => void
}

export function WorkItemDropdownActionMenuContent(props: WorkItemDropdownActionProps) {
  const accessibleSurfaceLabel = props.surfaceLabel.endsWith('작업')
    ? props.surfaceLabel
    : `${props.surfaceLabel} 작업`

  return (
    <DropdownMenuContent
      align="end"
      aria-label={`${props.wp.subject} ${accessibleSurfaceLabel}`}
      className="w-56"
      loop
      onClick={(event) => event.stopPropagation()}
    >
      <WorkItemDropdownActionItems {...props} />
    </DropdownMenuContent>
  )
}

function WorkItemDropdownActionItems({
  projectId,
  wp,
  canWrite,
  surfaceLabel,
  onOpenDrawer,
  onOpenMove,
  onMessage,
}: WorkItemDropdownActionProps) {
  const navigate = useNavigate()
  const duplicate = useDuplicateWorkPackage(projectId)
  const path = `/projects/${projectId}/work-packages/${wp.id}`

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[data-work-item-primary-action]')?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])

  const copyLink = async () => {
    const href = `${window.location.origin}${path}`
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(href)
      onMessage(`'${wp.subject}' 링크를 복사했습니다.`, 'success')
    } catch {
      onMessage(`복사할 링크: ${href}`, 'info')
    }
  }

  const duplicateItem = async () => {
    try {
      const result = await duplicate.mutateAsync(wp.id)
      const skipped =
        result.skipped_custom_values > 0
          ? ` · 복사되지 않은 커스텀 값 ${result.skipped_custom_values}건`
          : ''
      onMessage(`'${result.work_package.subject}' 생성됨${skipped}`, 'success')
    } catch {
      onMessage(`'${wp.subject}' 복제에 실패했습니다.`, 'error')
    }
  }

  return (
    <>
      <DropdownMenuLabel className="truncate text-[11px] uppercase tracking-normal">
        {surfaceLabel}
      </DropdownMenuLabel>
      <DropdownMenuItem
        data-work-item-primary-action
        className="flex items-center gap-2 text-xs"
        onSelect={() => onOpenDrawer(wp.id)}
      >
        <Eye size={13} /> 상세 드로어 열기
      </DropdownMenuItem>
      <DropdownMenuItem
        className="flex items-center gap-2 text-xs"
        onSelect={() => navigate(path)}
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
          <DropdownMenuLabel>변경</DropdownMenuLabel>
          <DropdownMenuItem
            className="flex items-center gap-2 text-xs"
            disabled={duplicate.isPending}
            onSelect={() => void duplicateItem()}
          >
            <Copy size={13} /> 복제
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex items-center gap-2 text-xs"
            onSelect={() => {
              onOpenMove(wp.id)
              onMessage(`'${wp.subject}' 이동 패널을 열었습니다.`, 'info')
            }}
          >
            <MoveRight size={13} /> 이동 패널 열기
          </DropdownMenuItem>
        </>
      ) : (
        <DropdownMenuItem disabled className="flex items-center gap-2 text-xs">
          <Lock size={13} /> 읽기 전용
        </DropdownMenuItem>
      )}
    </>
  )
}
