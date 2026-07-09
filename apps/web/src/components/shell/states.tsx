import type * as React from 'react'
import { CircleAlert, Inbox } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

export function ListSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div
      className={cn('w-full min-w-0 px-4 py-4 sm:px-6', className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="불러오는 중"
    >
      <span className="sr-only">불러오는 중</span>
      <div className="space-y-2">
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className="grid h-10 min-w-0 grid-cols-[minmax(0,1fr)_72px] items-center gap-3 rounded-of border border-of-border/70 bg-of-surface px-3 sm:grid-cols-[minmax(0,1fr)_96px_72px]"
          >
            <Skeleton className={cn('h-3 min-w-0', i % 3 === 1 ? 'w-3/5' : 'w-4/5')} />
            <Skeleton className="h-5 w-full justify-self-end" />
            <Skeleton className="hidden h-5 w-full justify-self-end sm:block" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function EmptyState({
  title,
  hint,
  children,
  className,
}: {
  title: string
  hint?: string
  children?: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'flex min-h-[280px] w-full min-w-0 items-center justify-center px-4 py-12 text-center sm:px-6',
        className,
      )}
      aria-live="polite"
    >
      <div className="flex max-w-[28rem] min-w-0 flex-col items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-of border border-of-border bg-of-surface-2 text-of-muted">
          <Inbox size={20} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <p className="max-w-full break-words text-sm font-medium text-of-text">{title}</p>
        {hint ? (
          <p className="max-w-full break-words text-xs leading-5 text-of-muted">{hint}</p>
        ) : null}
        {children ? (
          <div className="mt-2 flex max-w-full flex-wrap items-center justify-center gap-2">
            {children}
          </div>
        ) : null}
      </div>
    </section>
  )
}

export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown
  onRetry: () => void
  className?: string
}) {
  const requestId = error instanceof ApiError ? error.requestId : null
  const message = error instanceof Error ? error.message : '알 수 없는 오류'
  return (
    <section
      className={cn(
        'flex min-h-[280px] w-full min-w-0 items-center justify-center px-4 py-12 text-center sm:px-6',
        className,
      )}
      role="alert"
    >
      <div className="flex max-w-[30rem] min-w-0 flex-col items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-of border border-of-border bg-of-surface-2 text-of-danger">
          <CircleAlert size={20} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <p className="max-w-full break-words text-sm font-medium text-of-text">
          데이터를 불러오지 못했습니다
        </p>
        <p className="max-w-full break-words text-xs leading-5 text-of-muted">{message}</p>
        {requestId ? (
          <p className="max-w-full break-all text-[11px] leading-5 text-of-muted">
            요청 ID: {requestId}
          </p>
        ) : null}
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          다시 시도
        </Button>
      </div>
    </section>
  )
}
