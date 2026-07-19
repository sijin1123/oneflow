import { MoreHorizontal } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import type { WorkPackage } from './types'
import { WorkItemDropdownActionMenuContent } from './WorkItemDropdownActionItems'

export type BoardCardActionMessage = {
  kind: 'success' | 'info' | 'error'
  text: string
}

export function BoardCardActions({
  projectId,
  wp,
  canWrite,
  onOpenDrawer,
  onOpenMove,
  onMessage,
}: {
  projectId: string
  wp: WorkPackage
  canWrite: boolean
  onOpenDrawer: (id: string) => void
  onOpenMove: (id: string) => void
  onMessage: (message: BoardCardActionMessage) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${wp.subject} 카드 작업`}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-of border border-transparent text-of-muted opacity-100 transition-all hover:border-of-border hover:bg-of-surface-hover hover:text-of-fg focus-visible:border-of-border focus-visible:bg-of-surface-hover focus-visible:text-of-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <MoreHorizontal size={15} />
        </button>
      </DropdownMenuTrigger>
      <WorkItemDropdownActionMenuContent
        projectId={projectId}
        wp={wp}
        canWrite={canWrite}
        surfaceLabel="카드 작업"
        onOpenDrawer={onOpenDrawer}
        onOpenMove={onOpenMove}
        onMessage={(text, kind) => onMessage({ text, kind })}
      />
    </DropdownMenu>
  )
}
