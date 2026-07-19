import { MoreHorizontal } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import type { WorkPackage } from './types'
import { WorkItemDropdownActionMenuContent } from './WorkItemDropdownActionItems'

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
      <WorkItemDropdownActionMenuContent
        projectId={projectId}
        wp={wp}
        canWrite={canWrite}
        surfaceLabel="트리 항목"
        onOpenDrawer={onOpen}
        onOpenMove={onOpenMove}
        onMessage={(text, tone) => onMessage(text, tone)}
      />
    </DropdownMenu>
  )
}
