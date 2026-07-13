import { UserRoundX } from 'lucide-react'

import { Avatar } from '@/components/ui/avatar'

export function AssigneeChip({ name }: { name?: string | null }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {name ? (
        <Avatar name={name} size="sm" className="h-5 w-5 text-[8px]" />
      ) : (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-dashed border-of-border text-of-faint">
          <UserRoundX size={11} aria-hidden />
        </span>
      )}
      <span className="truncate text-xs text-of-muted">{name ?? '미배정'}</span>
    </span>
  )
}
