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
  backlog: 'bg-of-faint',
  todo: 'bg-of-info',
  in_progress: 'bg-of-warning',
  in_review: 'bg-of-accent',
  done: 'bg-of-success',
  cancelled: 'bg-of-border-strong',
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
  low: 'text-of-priority-low',
  medium: 'text-of-priority-medium font-medium',
  high: 'text-of-priority-high font-medium',
  urgent: 'text-of-priority-urgent font-semibold',
}

export function PriorityChip({ priority }: { priority: WpPriority }) {
  if (priority === 'none') return <span className="text-xs text-of-muted">—</span>
  return (
    <span className={cn('whitespace-nowrap text-xs', PRIORITY_STYLE[priority])}>
      {PRIORITY_LABELS[priority]}
    </span>
  )
}

export function TypeChip({ type, label }: { type: WpType; label?: string }) {
  // Project-scoped surfaces pass the configured label (useTypeLabels);
  // cross-project surfaces (search, my-work) keep the built-in default.
  return (
    <Badge variant="outline" className="whitespace-nowrap">
      {label ?? TYPE_LABELS[type]}
    </Badge>
  )
}
