import { LoaderCircle, Sparkles } from 'lucide-react'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { SettingsFrame, SettingsSection } from '@/features/settings/SettingsShell'
import { useAiPolicy, useUpdateAiPolicy } from '@/features/workspace-features/api'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function AiSettingsPage() {
  const policy = useAiPolicy()
  const update = useUpdateAiPolicy()

  if (policy.isPending) return <ListSkeleton />
  if (policy.isError) {
    if (policy.error instanceof ApiError && policy.error.status === 403) {
      return (
        <EmptyState
          title="접근 권한이 없습니다"
          hint="워크스페이스 AI 정책은 관리자만 변경할 수 있습니다."
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
      title="AI"
      description="OneFlow의 로컬 작업 요약 기능을 워크스페이스 전체에서 관리합니다."
      meta={`정책 revision ${data.revision}`}
    >
      <SettingsSection
        title="AI 요약 사용"
        description="활성화하면 구성원이 자신에게 보이는 작업의 상태, 일정, 설명과 활동 건수를 로컬 요약으로 확인할 수 있습니다."
      >
        <div className="flex min-w-0 flex-col gap-4 py-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-of border border-of-border bg-of-surface-2 text-of-muted">
              <Sparkles size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">작업 요약</p>
                <Badge variant={data.effective_enabled ? 'accent' : 'outline'}>
                  {data.effective_enabled ? '활성' : '비활성'}
                </Badge>
                <Badge variant="outline">local-extractive</Badge>
              </div>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">
                외부 AI 서비스나 API key를 사용하지 않으며 프로젝트 멤버십 범위 안에서만 실행됩니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={data.enabled}
            aria-label="AI 작업 요약 사용"
            disabled={update.isPending || !data.deployment_enabled}
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
        {!data.deployment_enabled ? (
          <p className="mt-3 text-xs leading-5 text-of-muted">
            배포 상한이 꺼져 있어 변경할 수 없습니다. 운영자가 `ONEFLOW_AI_SUMMARY=true`로 설정하고 서비스를 재기동해야 합니다.
          </p>
        ) : null}
        {update.isError ? (
          <p className="mt-3 text-xs leading-5 text-of-danger" role="alert">
            {stale
              ? '다른 관리자가 정책을 변경했습니다. 최신 상태를 불러왔으니 다시 시도해 주세요.'
              : update.error instanceof Error
                ? update.error.message
                : 'AI 정책을 변경하지 못했습니다.'}
          </p>
        ) : null}
      </SettingsSection>

      <SettingsSection title="정책 상태" description="배포 상한과 최근 정책 변경을 확인합니다.">
        <dl className="grid min-w-0 gap-3 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-of-muted">배포 상한</dt>
            <dd className="mt-1 font-medium">{data.deployment_enabled ? '허용' : '차단'}</dd>
          </div>
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
