import { Compass, LoaderCircle } from 'lucide-react'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { SettingsFrame, SettingsSection } from '@/features/settings/SettingsShell'
import {
  useInitiativesPolicy,
  useUpdateInitiativesPolicy,
} from '@/features/workspace-features/api'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function InitiativesSettingsPage() {
  const policy = useInitiativesPolicy()
  const update = useUpdateInitiativesPolicy()

  if (policy.isPending) return <ListSkeleton />
  if (policy.isError) {
    if (policy.error instanceof ApiError && policy.error.status === 403) {
      return (
        <EmptyState
          title="접근 권한이 없습니다"
          hint="워크스페이스 이니셔티브 정책은 관리자만 변경할 수 있습니다."
        />
      )
    }
    return <ErrorState error={policy.error} onRetry={() => policy.refetch()} />
  }

  const data = policy.data
  const stale = update.error instanceof ApiError && update.error.status === 412

  return (
    <SettingsFrame
      eyebrow="Workspace administration"
      title="Initiatives"
      description="프로젝트를 전략 목표로 묶는 이니셔티브 기능을 워크스페이스 전체에서 관리합니다."
      meta={`정책 revision ${data.revision}`}
    >
      <SettingsSection
        title="이니셔티브 사용"
        description="끄면 이니셔티브 API와 탐색·검색·프로젝트 요약에서 결과가 숨겨집니다. 저장된 이니셔티브와 프로젝트 연결은 삭제되지 않습니다."
      >
        <div className="flex min-w-0 flex-col gap-4 py-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-of border border-of-border bg-of-surface-2 text-of-muted">
              <Compass size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">전략 이니셔티브</p>
                <Badge variant={data.enabled ? 'accent' : 'outline'}>
                  {data.enabled ? '활성' : '비활성'}
                </Badge>
              </div>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">
                이니셔티브 목록, 프로젝트 연결, 헬스 상태와 통합 검색을 함께 제어합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={data.enabled}
            aria-label="이니셔티브 사용"
            disabled={update.isPending}
            onClick={() => update.mutate({ enabled: !data.enabled, revision: data.revision })}
            className={cn(
              'relative h-7 w-12 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-accent/50 disabled:cursor-not-allowed disabled:opacity-60',
              data.enabled
                ? 'border-of-accent bg-of-accent'
                : 'border-of-border bg-of-surface-2',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm transition-transform',
                data.enabled ? 'translate-x-6' : 'translate-x-0.5',
              )}
            >
              {update.isPending ? <LoaderCircle className="h-3 w-3 animate-spin text-of-muted" /> : null}
            </span>
          </button>
        </div>
        {update.isError ? (
          <p className="mt-3 text-xs leading-5 text-of-danger" role="alert">
            {stale
              ? '다른 관리자가 정책을 변경했습니다. 최신 상태를 불러왔으니 다시 시도해 주세요.'
              : update.error instanceof Error
                ? update.error.message
                : '이니셔티브 정책을 변경하지 못했습니다.'}
          </p>
        ) : null}
      </SettingsSection>

      <SettingsSection title="변경 이력" description="최근 정책 변경 주체와 시간을 확인합니다.">
        <dl className="grid min-w-0 gap-3 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-of-muted">최근 변경자</dt>
            <dd className="mt-1 break-words font-medium">
              {data.updated_by_name ?? '초기 워크스페이스 정책'}
            </dd>
          </div>
          <div>
            <dt className="text-of-muted">최근 변경 시각</dt>
            <dd className="mt-1 font-medium">{formatUpdatedAt(data.updated_at)}</dd>
          </div>
        </dl>
      </SettingsSection>
    </SettingsFrame>
  )
}
