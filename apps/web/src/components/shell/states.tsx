import { CircleAlert, Inbox } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api'

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4" aria-label="불러오는 중">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <Inbox className="text-of-muted" size={28} strokeWidth={1.5} />
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="text-xs text-of-muted">{hint}</p> : null}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const requestId = error instanceof ApiError ? error.requestId : null
  const message = error instanceof Error ? error.message : '알 수 없는 오류'
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <CircleAlert className="text-of-danger" size={28} strokeWidth={1.5} />
      <p className="text-sm font-medium">데이터를 불러오지 못했습니다</p>
      <p className="max-w-md text-xs text-of-muted">{message}</p>
      {requestId ? (
        <p className="text-[11px] text-of-muted">요청 ID: {requestId}</p>
      ) : null}
      <Button variant="outline" size="sm" onClick={onRetry}>
        다시 시도
      </Button>
    </div>
  )
}
