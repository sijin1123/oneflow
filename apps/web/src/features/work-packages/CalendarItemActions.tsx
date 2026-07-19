import { MoreHorizontal } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import type { WorkPackage } from './types'
import { WorkItemDropdownActionMenuContent } from './WorkItemDropdownActionItems'

export type CalendarItemActionMessage = {
  kind: 'success' | 'info' | 'error'
  text: string
}

export function CalendarItemActions({
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
  onMessage: (message: CalendarItemActionMessage) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${wp.subject} 캘린더 항목 작업`}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-of border border-transparent text-of-accent opacity-100 transition-all hover:border-of-border hover:bg-of-surface hover:text-of-fg focus-visible:border-of-border focus-visible:bg-of-surface focus-visible:text-of-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <MoreHorizontal size={13} />
        </button>
      </DropdownMenuTrigger>
      <WorkItemDropdownActionMenuContent
        projectId={projectId}
        wp={wp}
        canWrite={canWrite}
        surfaceLabel="캘린더 항목"
        onOpenDrawer={onOpenDrawer}
        onOpenMove={onOpenMove}
        onMessage={(text, kind) => onMessage({ text, kind })}
      />
    </DropdownMenu>
  )
}
