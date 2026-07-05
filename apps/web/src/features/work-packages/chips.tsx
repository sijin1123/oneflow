import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
  type WpPriority,
  type WpStatus,
  type WpType,
} from './types'

/* Status/priority chips instead of heavy cards (UI direction doc). Colors are
   OneFlow's own tokens — dots keep information visible without color-only cues. */

const STATUS_DOT: Record<WpStatus, string> = {
  backlog: 'bg-gray-400',
  todo: 'bg-sky-500',
  in_progress: 'bg-amber-500',
  in_review: 'bg-violet-500',
  done: 'bg-emerald-500',
  cancelled: 'bg-gray-300',
}

export function StatusChip({ status, label }: { status: WpStatus; label?: string }) {
  return (
    <Badge variant="neutral" className="whitespace-nowrap">
      <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[status])} aria-hidden />
      {label ?? STATUS_LABELS[status]}
    </Badge>
  )
}

const PRIORITY_STYLE: Record<WpPriority, string> = {
  none: 'text-of-muted',
  low: 'text-sky-700',
  medium: 'text-amber-700',
  high: 'text-orange-700',
  urgent: 'text-of-danger font-semibold',
}

export function PriorityChip({ priority }: { priority: WpPriority }) {
  if (priority === 'none') return <span className="text-xs text-of-muted">—</span>
  return (
    <span className={cn('whitespace-nowrap text-xs', PRIORITY_STYLE[priority])}>
      {PRIORITY_LABELS[priority]}
    </span>
  )
}

export function TypeChip({ type }: { type: WpType }) {
  return (
    <Badge variant="outline" className="whitespace-nowrap">
      {TYPE_LABELS[type]}
    </Badge>
  )
}
