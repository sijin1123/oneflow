import {
  CheckCircle2,
  CircleAlert,
  Copy,
  Database,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { FrameContextActions } from '@/components/shell/FrameContextActions'
import { ErrorState } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

type CheckStatus = 'ok' | 'warning' | 'error'
type CheckId = 'database' | 'schema' | 'storage' | 'auth'

type ReadinessCheck = {
  id: CheckId
  label: string
  status: CheckStatus
  detail: string
  observed: string | null
  expected: string | null
}

type StatusRead = {
  version: string
  readiness: {
    status: CheckStatus
    ok: number
    warnings: number
    errors: number
    generated_at: string
    checks: ReadinessCheck[]
  }
  database: {
    status: string
    current_revision: string | null
    expected_revision: string | null
    matches_head: boolean | null
  }
  counts: { projects: number | null; work_packages: number | null }
  config: {
    environment: string
    auth_mode: string
    oidc_provider_count: number
    ai_summary_enabled: boolean
    storage_backend: string
    upload_max_bytes: number
    project_storage_quota_bytes: number
  }
}

const checkIcons: Record<CheckId, LucideIcon> = {
  database: Database,
  schema: Database,
  storage: HardDrive,
  auth: ShieldCheck,
}

const statusCopy: Record<
  CheckStatus,
  {
    label: string
    summary: string
    icon: LucideIcon
    badge: 'success' | 'warning' | 'danger'
    tone: string
  }
> = {
  ok: {
    label: '배포 준비됨',
    summary: '필수 점검이 모두 정상입니다.',
    icon: CheckCircle2,
    badge: 'success',
    tone: 'border-of-success/20 bg-of-success-soft text-of-success',
  },
  warning: {
    label: '주의 필요',
    summary: '배포 전에 확인할 권고 항목이 있습니다.',
    icon: TriangleAlert,
    badge: 'warning',
    tone: 'border-of-warning/25 bg-of-warning-soft text-of-secondary',
  },
  error: {
    label: '조치 필요',
    summary: '배포를 막는 점검 오류가 있습니다.',
    icon: CircleAlert,
    badge: 'danger',
    tone: 'border-of-danger/20 bg-of-danger-soft text-of-danger',
  },
}

const mib = (n: number) => `${Math.round(n / 1_048_576)} MiB`

function StatusCanvas({
  children,
  busy = false,
  version,
}: {
  children: ReactNode
  busy?: boolean
  version?: string
}) {
  return (
    <div
      data-testid="system-status-scroll"
      className="h-full min-w-0 overflow-y-auto overscroll-contain bg-of-surface"
      aria-busy={busy}
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-6">
        <header className="flex min-w-0 flex-col gap-3 border-b border-of-border pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase text-of-muted">Operations</p>
            <h1 className="mt-1 text-xl font-semibold">시스템 상태</h1>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">
              실제 데이터베이스, 스키마, 파일 스토리지와 인증 구성을 점검합니다. 이 화면은
              읽기 전용이며 비밀값과 서버 경로를 노출하지 않습니다.
            </p>
          </div>
          {version ? <Badge variant="outline">OneFlow v{version}</Badge> : null}
        </header>
        <div className="py-5 pb-10">{children}</div>
      </div>
    </div>
  )
}

function StatusSkeleton() {
  return (
    <StatusCanvas busy>
      <div role="status" aria-label="시스템 상태 불러오는 중" className="space-y-5">
        <span className="sr-only">시스템 상태를 불러오는 중입니다.</span>
        <div className="grid grid-cols-2 gap-px border-y border-of-border-subtle bg-of-border-subtle sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="bg-of-surface px-3 py-3">
              <Skeleton className="h-2.5 w-14" />
              <Skeleton className="mt-2 h-4 w-20" />
            </div>
          ))}
        </div>
        <Skeleton className="h-28 w-full rounded-none" />
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-16 w-full rounded-none" />
          ))}
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          <Skeleton className="h-44 w-full rounded-none" />
          <Skeleton className="h-44 w-full rounded-none" />
          <Skeleton className="h-44 w-full rounded-none" />
        </div>
      </div>
    </StatusCanvas>
  )
}

function ReadinessSummary({ data }: { data: StatusRead['readiness'] }) {
  const copy = statusCopy[data.status]
  const Icon = copy.icon
  return (
    <section
      aria-labelledby="deployment-readiness-title"
      className="overflow-hidden border-y border-of-border-subtle"
    >
      <div className="flex min-w-0 items-start gap-3 p-4 sm:p-5">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-of border',
            copy.tone,
          )}
        >
          <Icon size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="deployment-readiness-title" className="text-sm font-semibold">
              배포 준비 상태
            </h2>
            <Badge variant={copy.badge}>{copy.label}</Badge>
          </div>
          <p className="mt-1 text-xs leading-5 text-of-muted">{copy.summary}</p>
          <p className="mt-1 text-[11px] text-of-muted">
            마지막 점검 {new Intl.DateTimeFormat('ko-KR', {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(data.generated_at))}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-3 border-t border-of-border-subtle bg-of-surface-2/55">
        {[
          ['정상', data.ok],
          ['주의', data.warnings],
          ['오류', data.errors],
        ].map(([label, value]) => (
          <div key={label} className="border-r border-of-border-subtle px-3 py-2.5 last:border-r-0">
            <dt className="text-[11px] text-of-muted">{label}</dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function CheckRow({ check }: { check: ReadinessCheck }) {
  const Icon = checkIcons[check.id]
  const copy = statusCopy[check.status]
  return (
    <li className="grid min-w-0 gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <span className={cn('mt-0.5 shrink-0', check.status === 'error' ? 'text-of-danger' : check.status === 'warning' ? 'text-of-warning' : 'text-of-success')}>
          <Icon size={16} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium">{check.label}</p>
            <Badge variant={copy.badge}>{copy.label}</Badge>
          </div>
          <p className="mt-1 text-xs leading-5 text-of-muted">{check.detail}</p>
        </div>
      </div>
      <div className="min-w-0 pl-7 text-left text-[11px] text-of-muted sm:max-w-52 sm:pl-0 sm:text-right">
        {check.observed ? <p className="break-all font-mono">현재 {check.observed}</p> : null}
        {check.expected && check.expected !== check.observed ? (
          <p className="break-all font-mono">기대 {check.expected}</p>
        ) : null}
      </div>
    </li>
  )
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-4 py-2.5">
      <dt className="text-xs text-of-muted">{label}</dt>
      <dd className="max-w-[60%] break-words text-right text-xs font-medium">{value}</dd>
    </div>
  )
}

function StatusFact({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'neutral' | 'success' | 'warning' | 'danger'
}) {
  return (
    <div className="min-w-0 bg-of-surface px-3 py-3">
      <dt className="text-[10px] font-medium uppercase text-of-muted">{label}</dt>
      <dd
        className={cn(
          'mt-1 truncate text-xs font-semibold',
          tone === 'success' && 'text-of-success',
          tone === 'warning' && 'text-of-warning',
          tone === 'danger' && 'text-of-danger',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

function SurfaceHeading({
  id,
  title,
  description,
}: {
  id: string
  title: string
  description: string
}) {
  return (
    <div className="border-b border-of-border-subtle pb-3">
      <h2 id={id} className="text-sm font-semibold">
        {title}
      </h2>
      <p className="mt-1 text-xs leading-5 text-of-muted">{description}</p>
    </div>
  )
}

export function StatusPage() {
  const [copyState, setCopyState] = useState<'pending' | 'success' | 'error' | null>(null)
  const [refreshError, setRefreshError] = useState(false)
  const query = useQuery({
    queryKey: ['ops-status'],
    queryFn: () => api<StatusRead>('/api/v1/ops/status'),
  })

  if (query.isPending) return <StatusSkeleton />
  if (!query.data) {
    return (
      <StatusCanvas>
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </StatusCanvas>
    )
  }

  const data = query.data
  const diagnosticReport = JSON.stringify(
    { schema: 'oneflow-deployment-diagnostics/v1', ...data },
    null,
    2,
  )

  const copyDiagnostics = async () => {
    setCopyState('pending')
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(diagnosticReport)
      setCopyState('success')
    } catch {
      setCopyState('error')
    }
  }

  const refresh = async () => {
    setCopyState(null)
    setRefreshError(false)
    const result = await query.refetch()
    setRefreshError(result.isError)
  }

  const readinessTone =
    data.readiness.status === 'ok'
      ? 'success'
      : data.readiness.status === 'warning'
        ? 'warning'
        : 'danger'

  return (
    <>
      <FrameContextActions>
        <Button
          variant="outline"
          size="sm"
          disabled={copyState === 'pending'}
          onClick={() => void copyDiagnostics()}
        >
          <Copy size={13} aria-hidden="true" />
          {copyState === 'pending'
            ? '복사 중…'
            : copyState === 'error'
              ? '진단 복사 다시 시도'
              : '진단 복사'}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={query.isFetching}
          onClick={() => void refresh()}
        >
          <RefreshCw
            size={13}
            className={query.isFetching ? 'animate-spin' : undefined}
            aria-hidden="true"
          />
          {refreshError ? '새로고침 다시 시도' : '새로고침'}
        </Button>
      </FrameContextActions>

      <StatusCanvas busy={query.isFetching} version={data.version}>
        <div className="space-y-5">
          <dl
            aria-label="시스템 상태 요약"
            className="grid grid-cols-2 gap-px border-y border-of-border-subtle bg-of-border-subtle sm:grid-cols-4"
          >
            <StatusFact
              label="배포 준비"
              value={statusCopy[data.readiness.status].label}
              tone={readinessTone}
            />
            <StatusFact label="정상 점검" value={`${data.readiness.ok} / ${data.readiness.checks.length}`} />
            <StatusFact
              label="내 프로젝트"
              value={data.counts.projects?.toLocaleString('ko-KR') ?? '확인 불가'}
            />
            <StatusFact
              label="내 워크패키지"
              value={data.counts.work_packages?.toLocaleString('ko-KR') ?? '확인 불가'}
            />
          </dl>

          <ReadinessSummary data={data.readiness} />

          <div className="min-h-5 space-y-1" aria-live="polite">
            {copyState === 'success' ? (
              <p role="status" className="text-xs text-of-success">
                진단 보고서를 복사했습니다.
              </p>
            ) : null}
            {copyState === 'error' ? (
              <p role="alert" className="text-xs text-of-danger">
                클립보드에 복사하지 못했습니다. 같은 진단을 다시 복사할 수 있습니다.
              </p>
            ) : null}
            {refreshError ? (
              <p role="alert" className="text-xs text-of-danger">
                최신 상태를 불러오지 못했습니다. 마지막으로 확인한 결과를 유지합니다.
              </p>
            ) : null}
          </div>

          <section aria-labelledby="readiness-checks-title">
            <SurfaceHeading
              id="readiness-checks-title"
              title="준비 상태 점검"
              description="각 점검은 현재 배포 환경을 직접 확인한 결과입니다."
            />
            {data.readiness.checks.length ? (
              <ul className="divide-y divide-of-border-subtle border-b border-of-border-subtle">
                {data.readiness.checks.map((check) => (
                  <CheckRow key={check.id} check={check} />
                ))}
              </ul>
            ) : (
              <p className="border-b border-of-border-subtle py-8 text-center text-xs text-of-muted">
                보고된 준비 상태 점검이 없습니다.
              </p>
            )}
          </section>

          <div className="grid gap-5 lg:grid-cols-3">
            <section aria-labelledby="safe-config-title">
              <SurfaceHeading
                id="safe-config-title"
                title="안전한 구성 요약"
                description="비밀이 아닌 allowlist 값만 표시합니다."
              />
              <dl className="divide-y divide-of-border-subtle border-b border-of-border-subtle">
                <ConfigRow label="환경" value={data.config.environment} />
                <ConfigRow label="인증 모드" value={data.config.auth_mode} />
                <ConfigRow label="OIDC 공급자" value={`${data.config.oidc_provider_count}개`} />
                <ConfigRow
                  label="AI 요약"
                  value={data.config.ai_summary_enabled ? '켜짐' : '꺼짐'}
                />
              </dl>
            </section>

            <section aria-labelledby="capacity-scope-title">
              <SurfaceHeading
                id="capacity-scope-title"
                title="용량과 범위"
                description="현재 사용자에게 허용된 범위만 집계합니다."
              />
              <dl className="divide-y divide-of-border-subtle border-b border-of-border-subtle">
                <ConfigRow label="스토리지" value={data.config.storage_backend} />
                <ConfigRow label="파일당 상한" value={mib(data.config.upload_max_bytes)} />
                <ConfigRow
                  label="프로젝트 쿼터"
                  value={mib(data.config.project_storage_quota_bytes)}
                />
                <ConfigRow
                  label="내 프로젝트"
                  value={data.counts.projects?.toString() ?? '확인 불가'}
                />
                <ConfigRow
                  label="내 워크패키지"
                  value={data.counts.work_packages?.toString() ?? '확인 불가'}
                />
              </dl>
            </section>

            <section aria-labelledby="database-state-title">
              <SurfaceHeading
                id="database-state-title"
                title="데이터베이스 상태"
                description="현재 revision과 애플리케이션 기대값을 비교합니다."
              />
              <dl className="divide-y divide-of-border-subtle border-b border-of-border-subtle">
                <ConfigRow label="연결 상태" value={data.database.status} />
                <ConfigRow
                  label="현재 revision"
                  value={data.database.current_revision ?? '확인 불가'}
                />
                <ConfigRow
                  label="기대 revision"
                  value={data.database.expected_revision ?? '확인 불가'}
                />
                <ConfigRow
                  label="Head 일치"
                  value={
                    data.database.matches_head === null
                      ? '확인 불가'
                      : data.database.matches_head
                        ? '일치'
                        : '불일치'
                  }
                />
              </dl>
            </section>
          </div>
        </div>
      </StatusCanvas>
    </>
  )
}
