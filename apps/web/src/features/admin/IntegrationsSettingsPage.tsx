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
import { Link } from 'react-router-dom'

import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthConfig } from '@/features/auth/api'
import { useDataTransferJobs } from '@/features/ops/dataTransfersApi'
import { SettingsFrame, SettingsSection } from '@/features/settings/SettingsShell'
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
  onRetry,
}: IntegrationRowProps) {
  return (
    <li aria-label={`${title} 상태`} className="grid min-w-0 gap-3 py-4 first:pt-1 last:pb-1 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-of border border-of-border-subtle bg-of-surface-2 text-of-muted">
          <Icon size={17} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium">{title}</h3>
            {pending ? <Skeleton className="h-5 w-16" /> : <Badge variant={error ? 'danger' : tone}>{error ? '확인 실패' : status}</Badge>}
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">{description}</p>
          {pending ? (
            <div role="status" aria-label={`${title} 확인 중`} className="mt-2 flex gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
            </div>
          ) : error ? (
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2" role="alert">
              <p className="text-xs text-of-danger">현재 상태를 불러오지 못했습니다.</p>
              {onRetry ? (
                <Button size="sm" variant="ghost" onClick={onRetry} aria-label={`${title} 다시 시도`}>
                  <RefreshCw size={13} /> 다시 시도
                </Button>
              ) : null}
            </div>
          ) : (
            <ul aria-label={`${title} 세부 상태`} className="mt-2 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-[11px] text-of-muted">
              {facts.map((fact) => <li key={fact}>{fact}</li>)}
            </ul>
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

  const activeWebhooks = webhooks.data?.items.filter((item) => item.is_active).length ?? 0
  const latestTransfer = transfers.data?.items[0]
  const authProviders = auth.data?.oidc_providers ?? []
  const authReady = auth.data?.auth_mode === 'dev' || Boolean(auth.data?.oidc_login_enabled)

  return (
    <SettingsFrame
      eyebrow="Workspace administration"
      title="연결 및 통합"
      description="OneFlow 안에서 실제로 동작하는 자동화, 데이터 이동, AI 정책과 인증 준비 상태를 한 곳에서 확인합니다."
      meta="4개 기능"
      className="max-w-5xl"
    >
      <SettingsSection
        title="통합 상태"
        description="각 상태는 해당 서비스의 실제 API 응답이며, 설정과 이력은 기존 관리 화면에서 이어서 다룹니다."
        actions={<Cable size={16} className="text-of-muted" aria-hidden="true" />}
      >
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
            onRetry={() => void webhooks.refetch()}
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
            onRetry={() => void transfers.refetch()}
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
            onRetry={() => void ai.refetch()}
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
            onRetry={() => void auth.refetch()}
          />
        </ul>
      </SettingsSection>

      <SettingsSection
        title="외부 연결 원칙"
        description="외부 서비스는 운영 자격과 검증 가능한 서버 상태가 준비된 뒤에만 연결 기능을 노출합니다."
      >
        <div className="flex min-w-0 items-start gap-3 py-1">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-of border border-of-border-subtle bg-of-surface-2 text-of-muted">
            <ShieldCheck size={15} aria-hidden="true" />
          </span>
          <p className="max-w-3xl text-xs leading-5 text-of-muted">
            GitHub, GitLab, Slack, Notion 연결은 client credential과 callback 검증이 확보되기 전까지 제공하지 않습니다. 이 화면은 연결되지 않은 provider를 연결됨으로 추정하지 않습니다.
          </p>
        </div>
      </SettingsSection>
    </SettingsFrame>
  )
}
