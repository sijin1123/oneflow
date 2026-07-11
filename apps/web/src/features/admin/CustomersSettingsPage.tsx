import { Building2, LoaderCircle } from 'lucide-react'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { SettingsFrame, SettingsSection } from '@/features/settings/SettingsShell'
import { useCustomersPolicy, useUpdateCustomersPolicy } from '@/features/workspace-features/api'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function CustomersSettingsPage() {
  const policy = useCustomersPolicy()
  const update = useUpdateCustomersPolicy()

  if (policy.isPending) return <ListSkeleton />
  if (policy.isError) {
    if (policy.error instanceof ApiError && policy.error.status === 403) {
      return <EmptyState title="접근 권한이 없습니다" hint="워크스페이스 고객 정책은 관리자만 변경할 수 있습니다." />
    }
    return <ErrorState error={policy.error} onRetry={() => policy.refetch()} />
  }

  const data = policy.data
  const stale = update.error instanceof ApiError && update.error.status === 412

  return (
    <SettingsFrame eyebrow="Workspace administration" title="Customers" description="고객과 고객별 작업 진행 상황을 워크스페이스 전체에서 관리합니다." meta={`정책 revision ${data.revision}`}>
      <SettingsSection title="Customers 사용" description="끄면 고객 API와 고객 목록, 작업 항목의 고객 연결이 숨겨집니다. 저장된 고객과 작업 연결은 삭제되지 않으며 다시 켜면 그대로 사용할 수 있습니다.">
        <div className="flex min-w-0 flex-col gap-4 py-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-of border border-of-border bg-of-surface-2 text-of-muted"><Building2 size={18} aria-hidden="true" /></span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">고객 관리</p><Badge variant={data.enabled ? 'accent' : 'outline'}>{data.enabled ? '활성' : '비활성'}</Badge></div>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">고객 목록, 고객별 진행 현황과 작업 항목의 고객 연결을 함께 제어합니다.</p>
            </div>
          </div>
          <button type="button" role="switch" aria-checked={data.enabled} aria-label="Customers 사용" disabled={update.isPending} onClick={() => update.mutate({ enabled: !data.enabled, revision: data.revision })} className={cn('relative h-7 w-12 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-accent/50 disabled:cursor-not-allowed disabled:opacity-60', data.enabled ? 'border-of-accent bg-of-accent' : 'border-of-border bg-of-surface-2')}>
            <span className={cn('absolute top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm transition-transform', data.enabled ? 'translate-x-6' : 'translate-x-0.5')}>{update.isPending ? <LoaderCircle className="h-3 w-3 animate-spin text-of-muted" /> : null}</span>
          </button>
        </div>
        {update.isError ? <p className="mt-3 text-xs leading-5 text-of-danger" role="alert">{stale ? '다른 관리자가 정책을 변경했습니다. 최신 상태를 불러왔으니 다시 시도해 주세요.' : update.error instanceof Error ? update.error.message : '고객 정책을 변경하지 못했습니다.'}</p> : null}
      </SettingsSection>
      <SettingsSection title="변경 이력" description="최근 정책 변경 주체와 시간을 확인합니다.">
        <dl className="grid min-w-0 gap-3 text-xs sm:grid-cols-2"><div><dt className="text-of-muted">최근 변경자</dt><dd className="mt-1 break-words font-medium">{data.updated_by_name ?? '초기 워크스페이스 정책'}</dd></div><div><dt className="text-of-muted">최근 변경 시각</dt><dd className="mt-1 font-medium">{formatUpdatedAt(data.updated_at)}</dd></div></dl>
      </SettingsSection>
    </SettingsFrame>
  )
}
