import {
  ArrowUpRight,
  Bot,
  Cable,
  DatabaseZap,
  RefreshCw,
  ShieldCheck,
  Webhook,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { FrameContextActions } from '@/components/shell/FrameContextActions'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthConfig } from '@/features/auth/api'
import { useDataTransferJobs } from '@/features/ops/dataTransfersApi'
import { useAiPolicy } from '@/features/workspace-features/api'

import { useWebhooks } from './webhooksApi'

type StatusTone = NonNullable<BadgeProps['variant']>

type IntegrationRowProps = {
  icon: LucideIcon
  title: string
  description: string
  status: string
  tone: StatusTone
  facts: string[]
  href: string
  action: string
  pending?: boolean
  error?: unknown
  hasSnapshot?: boolean
  onRetry?: () => void
}

const actionClassName =
  'of-touch-target inline-flex h-7 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-of border border-of-border bg-of-surface px-2 text-xs font-medium text-of-text transition-colors hover:border-of-border-strong hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus'

function IntegrationRow({
  icon: Icon,
  title,
  description,
  status,
  tone,
  facts,
  href,
  action,
  pending = false,
  error,
  hasSnapshot = false,
  onRetry,
}: IntegrationRowProps) {
  const stale = Boolean(error && hasSnapshot)

  return (
    <li aria-label={`${title} 상태`} className="grid min-w-0 gap-3 py-4 first:pt-1 last:pb-1 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-of border border-of-border-subtle bg-of-surface-2 text-of-muted">
          <Icon size={17} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium">{title}</h3>
            {pending ? (
              <Skeleton className="h-5 w-16" />
            ) : (
              <Badge variant={stale ? 'warning' : error ? 'danger' : tone}>
                {stale ? `${status} · 갱신 필요` : error ? '확인 실패' : status}
              </Badge>
            )}
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">{description}</p>
          {pending && !hasSnapshot ? (
            <div role="status" aria-label={`${title} 확인 중`} className="mt-2 flex gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
            </div>
          ) : error && !hasSnapshot ? (
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2" role="alert">
              <p className="text-xs text-of-danger">현재 상태를 불러오지 못했습니다.</p>
              {onRetry ? (
                <Button size="sm" variant="ghost" onClick={onRetry} aria-label={`${title} 다시 시도`}>
                  <RefreshCw size={13} /> 다시 시도
                </Button>
              ) : null}
            </div>
          ) : (
            <>
              <ul aria-label={`${title} 세부 상태`} className="mt-2 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-[11px] text-of-muted">
                {facts.map((fact) => <li key={fact}>{fact}</li>)}
              </ul>
              {stale ? (
                <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2" role="alert">
                  <p className="text-xs text-of-warning">이전 확인 결과를 유지했습니다. 현재 상태를 다시 확인해 주세요.</p>
                  {onRetry ? (
                    <Button size="sm" variant="ghost" onClick={onRetry} aria-label={`${title} 다시 시도`}>
                      <RefreshCw size={13} aria-hidden="true" /> 다시 시도
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
      <Link to={href} className={actionClassName} aria-label={`${title} ${action}`}>
        {action}
        <ArrowUpRight size={13} aria-hidden="true" />
      </Link>
    </li>
  )
}

const sourceLabel = { oneflow: 'OneFlow', jira: 'Jira', linear: 'Linear' } as const

export function IntegrationsSettingsPage() {
  const webhooks = useWebhooks()
  const transfers = useDataTransferJobs()
  const ai = useAiPolicy()
  const auth = useAuthConfig()
  const [failedRefreshes, setFailedRefreshes] = useState<string[]>([])

  const activeWebhooks = webhooks.data?.items.filter((item) => item.is_active).length ?? 0
  const latestTransfer = transfers.data?.items[0]
  const authProviders = auth.data?.oidc_providers ?? []
  const authReady = auth.data?.auth_mode === 'dev' || Boolean(auth.data?.oidc_login_enabled)
  const queries = [webhooks, transfers, ai, auth]
  const confirmedCount = queries.filter((query) => query.data !== undefined).length
  const failedCount = queries.filter((query) => query.isError).length
  const refreshing = queries.some((query) => query.isFetching)

  const refreshAll = async () => {
    const results = await Promise.all([
      webhooks.refetch(),
      transfers.refetch(),
      ai.refetch(),
      auth.refetch(),
    ])
    const labels = ['Webhooks', '데이터 전송', 'AI 작업 요약', '인증']
    setFailedRefreshes(results.flatMap((result, index) => result.isError ? [labels[index]] : []))
  }

  const retryOne = async (label: string, refetch: () => Promise<{ isError: boolean }>) => {
    const result = await refetch()
    if (!result.isError) {
      setFailedRefreshes((current) => current.filter((item) => item !== label))
    }
  }

  const refreshActionLabel = failedRefreshes.length > 0 ? '모두 새로고침 다시 시도' : '모두 새로고침'

  return (
    <div className="flex h-full min-w-0 flex-col bg-of-surface">
      <FrameContextActions>
        <Link to="/operations" className={actionClassName} aria-label="운영 허브" title="운영 허브">
          <DatabaseZap size={13} aria-hidden="true" />
          <span className="hidden min-[360px]:inline">운영 허브</span>
        </Link>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={refreshing}
          onClick={() => void refreshAll()}
          aria-label={refreshActionLabel}
          title={refreshActionLabel}
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : undefined} aria-hidden="true" />
          <span className="hidden min-[360px]:inline">{refreshActionLabel}</span>
        </Button>
      </FrameContextActions>

      <div
        data-testid="integrations-scroll"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        aria-busy={refreshing}
      >
        <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-6">
          <header className="grid gap-4 border-b border-of-border pb-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase text-of-muted">Workspace administration</p>
              <h1 className="mt-1 text-xl font-semibold">연결 및 통합</h1>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">
                자동화, 데이터 이동, AI 정책과 인증 준비 상태를 실제 서버 응답으로 확인합니다.
              </p>
            </div>
            <dl
              aria-label="통합 상태 요약"
              className="grid grid-cols-3 divide-x divide-of-border-subtle border-y border-of-border-subtle sm:min-w-72"
            >
              <div className="px-3 py-2">
                <dt className="text-[11px] text-of-muted">기능</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums">4</dd>
              </div>
              <div className="px-3 py-2">
                <dt className="text-[11px] text-of-muted">확인</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums">{confirmedCount}</dd>
              </div>
              <div className="px-3 py-2">
                <dt className="text-[11px] text-of-muted">실패</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums">{failedCount}</dd>
              </div>
            </dl>
          </header>

          {failedRefreshes.length > 0 ? (
            <div role="alert" className="mt-4 border-l-2 border-of-warning bg-of-warning-soft/30 px-3 py-2 text-xs leading-5 text-of-text">
              {failedRefreshes.join(', ')} 상태를 새로고침하지 못했습니다. 마지막 성공 결과를 유지했으며 상단에서 같은 전체 요청을 다시 시도할 수 있습니다.
            </div>
          ) : null}

          <section aria-labelledby="integration-status-title" className="py-6">
            <div className="flex min-w-0 items-start justify-between gap-3 border-b border-of-border-subtle pb-3">
              <div className="min-w-0">
                <h2 id="integration-status-title" className="text-sm font-semibold">통합 상태</h2>
                <p className="mt-1 text-xs leading-5 text-of-muted">
                  한 기능의 조회 실패는 다른 통합 상태와 관리 동선을 막지 않습니다.
                </p>
              </div>
              <Cable size={16} className="mt-0.5 shrink-0 text-of-muted" aria-hidden="true" />
            </div>
            <ul className="divide-y divide-of-border-subtle" aria-label="워크스페이스 통합 상태">
              <IntegrationRow
                icon={Webhook}
                title="Webhooks"
                description="작업 이벤트를 허용된 HTTPS endpoint로 서명해 전달하고 전송 결과를 감사합니다."
                status={!webhooks.data?.enabled ? '운영 설정 필요' : activeWebhooks > 0 ? '전송 중' : '준비됨'}
                tone={!webhooks.data?.enabled ? 'warning' : activeWebhooks > 0 ? 'success' : 'neutral'}
                facts={webhooks.data ? [
                  `endpoint ${webhooks.data.total}개`,
                  `활성 ${activeWebhooks}개`,
                  webhooks.data.active_signing_key_id ? `signing key ${webhooks.data.active_signing_key_id}` : 'signing key 미설정',
                ] : []}
                href="/admin/webhooks"
                action="관리"
                pending={webhooks.isPending}
                error={webhooks.error}
                hasSnapshot={webhooks.data !== undefined}
                onRetry={() => void retryOne('Webhooks', webhooks.refetch)}
              />

              <IntegrationRow
                icon={DatabaseZap}
                title="데이터 전송"
                description="프로젝트 CSV 가져오기와 시점이 고정된 내보내기 파일의 실제 처리 이력을 확인합니다."
                status={(transfers.data?.total ?? 0) > 0 ? '이력 있음' : '기록 없음'}
                tone={(transfers.data?.total ?? 0) > 0 ? 'success' : 'neutral'}
                facts={transfers.data ? [
                  `전체 ${transfers.data.total}건`,
                  latestTransfer
                    ? `최근 ${sourceLabel[latestTransfer.source]} ${latestTransfer.direction === 'import' ? '가져오기' : '내보내기'}`
                    : '최근 작업 없음',
                  latestTransfer ? `유효 ${latestTransfer.valid_rows} · 오류 ${latestTransfer.invalid_rows}` : '프로젝트별 실행 가능',
                ] : []}
                href="/operations"
                action="운영 허브"
                pending={transfers.isPending}
                error={transfers.error}
                hasSnapshot={transfers.data !== undefined}
                onRetry={() => void retryOne('데이터 전송', transfers.refetch)}
              />

              <IntegrationRow
                icon={Bot}
                title="AI 작업 요약"
                description="외부 provider 없이 멤버십 범위 안에서 실행되는 로컬 작업 요약 정책입니다."
                status={!ai.data?.deployment_enabled ? '배포 차단' : ai.data.effective_enabled ? '활성' : '비활성'}
                tone={!ai.data?.deployment_enabled ? 'warning' : ai.data.effective_enabled ? 'success' : 'neutral'}
                facts={ai.data ? [
                  `워크스페이스 정책 ${ai.data.enabled ? '사용' : '중지'}`,
                  `배포 상한 ${ai.data.deployment_enabled ? '허용' : '차단'}`,
                  `revision ${ai.data.revision}`,
                ] : []}
                href="/admin/ai"
                action="정책 관리"
                pending={ai.isPending}
                error={ai.error}
                hasSnapshot={ai.data !== undefined}
                onRetry={() => void retryOne('AI 작업 요약', ai.refetch)}
              />

              <IntegrationRow
                icon={ShieldCheck}
                title="인증"
                description="현재 배포가 공개한 로그인 방식과 provider 준비 상태만 표시합니다. 비밀값은 노출하지 않습니다."
                status={authReady ? (auth.data?.auth_mode === 'oidc' ? 'OIDC 준비됨' : '개발 모드') : '설정 필요'}
                tone={authReady ? (auth.data?.auth_mode === 'oidc' ? 'success' : 'info') : 'warning'}
                facts={auth.data ? [
                  `모드 ${auth.data.auth_mode}`,
                  auth.data.auth_mode === 'oidc' ? `provider ${authProviders.length}개` : `비밀번호 ${auth.data.password_required ? '필수' : '선택'}`,
                  `세션 관리 ${auth.data.session_management_enabled ? '사용' : '중지'}`,
                ] : []}
                href="/status"
                action="시스템 상태"
                pending={auth.isPending}
                error={auth.error}
                hasSnapshot={auth.data !== undefined}
                onRetry={() => void retryOne('인증', auth.refetch)}
              />
            </ul>
          </section>

          <section aria-labelledby="external-connections-title" className="border-t border-of-border py-6">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-of border border-of-border-subtle bg-of-surface-2 text-of-muted">
                <ShieldCheck size={15} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 id="external-connections-title" className="text-sm font-semibold">외부 연결 원칙</h2>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-of-muted">
                  GitHub, GitLab, Slack, Notion 연결은 client credential과 callback 검증이 확보된 뒤에만 제공합니다. 이 화면은 연결되지 않은 provider를 연결됨으로 추정하지 않습니다.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
