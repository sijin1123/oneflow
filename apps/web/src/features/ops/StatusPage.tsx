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
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { ErrorState } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SettingsFrame, SettingsSection } from '@/features/settings/SettingsShell'
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

function StatusSkeleton() {
  return (
    <SettingsFrame
      eyebrow="Operations"
      title="시스템 상태"
      description="배포 준비 상태를 점검하고 안전한 진단 보고서를 확인합니다."
      className="max-w-5xl"
    >
      <div role="status" aria-label="시스템 상태 불러오는 중" className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-44 w-full" />
      </div>
    </SettingsFrame>
  )
}

function ReadinessSummary({ data }: { data: StatusRead['readiness'] }) {
  const copy = statusCopy[data.status]
  const Icon = copy.icon
  return (
    <section aria-labelledby="deployment-readiness-title" className="of-surface overflow-hidden">
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

export function StatusPage() {
  const [copyState, setCopyState] = useState<'success' | 'error' | null>(null)
  const query = useQuery({
    queryKey: ['ops-status'],
    queryFn: () => api<StatusRead>('/api/v1/ops/status'),
  })

  if (query.isPending) return <StatusSkeleton />
  if (query.isError) {
    return (
      <SettingsFrame
        eyebrow="Operations"
        title="시스템 상태"
        description="배포 준비 상태를 점검하고 안전한 진단 보고서를 확인합니다."
        className="max-w-5xl"
      >
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </SettingsFrame>
    )
  }

  const data = query.data
  const diagnosticReport = JSON.stringify(
    { schema: 'oneflow-deployment-diagnostics/v1', ...data },
    null,
    2,
  )

  const copyDiagnostics = async () => {
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
    await query.refetch()
  }

  return (
    <SettingsFrame
      eyebrow="Operations"
      title="시스템 상태"
      description="실제 데이터베이스, 스키마, 파일 스토리지와 인증 구성을 점검합니다. 이 화면은 읽기 전용이며 비밀값과 서버 경로를 노출하지 않습니다."
      meta={`v${data.version}`}
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => void copyDiagnostics()}>
            <Copy aria-hidden="true" /> 진단 복사
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={query.isFetching}
            onClick={() => void refresh()}
          >
            <RefreshCw className={query.isFetching ? 'animate-spin' : undefined} aria-hidden="true" />
            새로고침
          </Button>
        </>
      }
      className="max-w-5xl"
    >
      <div className="space-y-4" aria-busy={query.isFetching}>
        <ReadinessSummary data={data.readiness} />

        <div className="min-h-5" aria-live="polite">
          {copyState === 'success' ? (
            <p role="status" className="text-xs text-of-success">진단 보고서를 복사했습니다.</p>
          ) : null}
          {copyState === 'error' ? (
            <p role="alert" className="text-xs text-of-danger">클립보드에 복사하지 못했습니다. 브라우저 권한을 확인하세요.</p>
          ) : null}
        </div>

        <SettingsSection
          title="준비 상태 점검"
          description="각 점검은 현재 배포 환경을 직접 확인한 결과입니다."
        >
          <ul className="divide-y divide-of-border-subtle border-y border-of-border-subtle">
            {data.readiness.checks.map((check) => <CheckRow key={check.id} check={check} />)}
          </ul>
        </SettingsSection>

        <div className="grid gap-4 md:grid-cols-2">
          <SettingsSection title="안전한 구성 요약" description="설정 값은 비밀이 아닌 allowlist만 표시합니다.">
            <dl className="divide-y divide-of-border-subtle border-y border-of-border-subtle">
              <ConfigRow label="환경" value={data.config.environment} />
              <ConfigRow label="인증 모드" value={data.config.auth_mode} />
              <ConfigRow label="OIDC 공급자" value={`${data.config.oidc_provider_count}개`} />
              <ConfigRow label="AI 요약" value={data.config.ai_summary_enabled ? '켜짐' : '꺼짐'} />
            </dl>
          </SettingsSection>
          <SettingsSection title="용량과 범위" description="현재 사용자에게 허용된 범위만 집계합니다.">
            <dl className="divide-y divide-of-border-subtle border-y border-of-border-subtle">
              <ConfigRow label="스토리지" value={data.config.storage_backend} />
              <ConfigRow label="파일당 상한" value={mib(data.config.upload_max_bytes)} />
              <ConfigRow label="프로젝트 쿼터" value={mib(data.config.project_storage_quota_bytes)} />
              <ConfigRow label="내 프로젝트" value={data.counts.projects?.toString() ?? '확인 불가'} />
              <ConfigRow label="내 워크패키지" value={data.counts.work_packages?.toString() ?? '확인 불가'} />
            </dl>
          </SettingsSection>
        </div>
      </div>
    </SettingsFrame>
  )
}
