import {
  BrainCircuit,
  CheckCircle2,
  Database,
  History,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ServerCog,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { FrameContextActions } from '@/components/shell/FrameContextActions'
import { EmptyState, ErrorState } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAiPolicy, useUpdateAiPolicy } from '@/features/workspace-features/api'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

const actionClassName =
  'of-touch-target inline-flex h-7 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-of border border-of-border bg-of-surface px-2 text-xs font-medium text-of-text transition-colors hover:border-of-border-strong hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus'

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function AiPolicySkeleton() {
  return (
    <div role="status" aria-label="AI 정책 불러오는 중" className="space-y-5 py-5">
      <span className="sr-only">AI 정책을 불러오는 중입니다.</span>
      <div className="grid grid-cols-2 gap-px border-y border-of-border-subtle bg-of-border-subtle sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="bg-of-surface px-3 py-3">
            <Skeleton className="h-2.5 w-14" />
            <Skeleton className="mt-2 h-4 w-20" />
          </div>
        ))}
      </div>
      <Skeleton className="h-32 w-full rounded-none" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.6fr)]">
        <Skeleton className="h-64 w-full rounded-none" />
        <Skeleton className="h-64 w-full rounded-none" />
      </div>
    </div>
  )
}

function PolicyFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 bg-of-surface px-3 py-3">
      <dt className="text-[10px] font-medium uppercase text-of-muted">{label}</dt>
      <dd className="mt-1 truncate text-xs font-semibold">{value}</dd>
    </div>
  )
}

export function AiSettingsPage() {
  const policy = useAiPolicy()
  const update = useUpdateAiPolicy()
  const [failedTarget, setFailedTarget] = useState<boolean | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const data = policy.data
  const stale = update.error instanceof ApiError && update.error.status === 412
  const policyStale = Boolean(data && policy.isError)
  const policyFresh = Boolean(data && !policy.isFetching && !policyStale)
  const busy = policy.isFetching || update.isPending

  const changePolicy = (enabled: boolean) => {
    if (!data || !policyFresh) return
    setFailedTarget(null)
    setSuccessMessage(null)
    update.mutate(
      { enabled, revision: data.revision },
      {
        onSuccess: () => {
          setSuccessMessage(
            enabled ? 'AI 작업 요약을 활성화했습니다.' : 'AI 작업 요약을 비활성화했습니다.',
          )
        },
        onError: () => {
          setFailedTarget(enabled)
        },
      },
    )
  }

  const refresh = async () => {
    setSuccessMessage(null)
    await policy.refetch()
  }

  return (
    <div className="flex h-full min-w-0 flex-col bg-of-surface">
      <FrameContextActions>
        <Link to="/admin/overview" className={actionClassName}>
          <Settings2 size={13} aria-hidden="true" />
          관리 개요
        </Link>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void refresh()}>
          <RefreshCw
            size={13}
            className={policy.isFetching ? 'animate-spin' : undefined}
            aria-hidden="true"
          />
          새로고침
        </Button>
      </FrameContextActions>

      <div
        data-testid="ai-settings-scroll"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        aria-busy={busy}
      >
        <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-6">
          <header className="grid gap-4 border-b border-of-border pb-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase text-of-muted">
                Workspace administration
              </p>
              <h1 className="mt-1 text-xl font-semibold">AI</h1>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">
                로컬 작업 요약의 워크스페이스 정책, 실행 상한과 데이터 경계를 관리합니다.
              </p>
            </div>
            {data ? (
              <Badge variant="outline" className="justify-self-start">
                정책 revision {data.revision}
              </Badge>
            ) : null}
          </header>

          {policy.isPending ? <AiPolicySkeleton /> : null}

          {!data && policy.isError ? (
            <div className="py-5">
              {policy.error instanceof ApiError && policy.error.status === 403 ? (
                <EmptyState
                  title="접근 권한이 없습니다"
                  hint="워크스페이스 AI 정책은 관리자만 변경할 수 있습니다."
                />
              ) : (
                <ErrorState error={policy.error} onRetry={() => void policy.refetch()} />
              )}
            </div>
          ) : null}

          {data ? (
            <div className="space-y-5 py-5">
              {policyStale ? (
                <div
                  role="alert"
                  className="flex min-w-0 flex-wrap items-center gap-2 border-l-2 border-of-warning bg-of-warning-soft/30 px-3 py-2 text-xs leading-5 text-of-text"
                >
                  <p className="min-w-0 flex-1">
                    최신 AI 정책을 불러오지 못해 마지막으로 확인한 상태를 유지합니다. 복구 전까지 정책 변경은 사용할 수 없습니다.
                  </p>
                  <Button size="sm" variant="ghost" disabled={policy.isFetching} onClick={() => void refresh()}>
                    <RefreshCw size={13} aria-hidden="true" /> 다시 시도
                  </Button>
                </div>
              ) : null}

              <dl
                aria-label="AI 정책 요약"
                className="grid grid-cols-2 gap-px border-y border-of-border-subtle bg-of-border-subtle sm:grid-cols-4"
              >
                <PolicyFact
                  label="워크스페이스 정책"
                  value={data.enabled ? '활성' : '비활성'}
                />
                <PolicyFact
                  label="배포 상한"
                  value={data.deployment_enabled ? '허용' : '차단'}
                />
                <PolicyFact
                  label="실제 실행"
                  value={data.effective_enabled ? '사용 가능' : '안전 차단'}
                />
                <PolicyFact label="처리 엔진" value="local-extractive" />
              </dl>

              <section aria-labelledby="ai-policy-title">
                <div className="flex min-w-0 items-center justify-between gap-3 border-y border-of-border-subtle py-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-of border border-of-border bg-of-surface-2 text-of-muted">
                      <Sparkles size={18} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 id="ai-policy-title" className="text-sm font-semibold">
                          작업 요약
                        </h2>
                        <Badge variant={data.effective_enabled ? 'accent' : 'outline'}>
                          {data.effective_enabled ? '사용 가능' : '비활성'}
                        </Badge>
                        <Badge variant="outline">local-extractive</Badge>
                      </div>
                      <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">
                        구성원이 접근할 수 있는 작업의 상태, 일정, 설명과 활동 건수를
                        서버에서 결정적으로 요약합니다.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={data.enabled}
                    aria-label="AI 작업 요약 사용"
                    disabled={!policyFresh || busy || (!data.deployment_enabled && !data.enabled)}
                    onClick={() => changePolicy(!data.enabled)}
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
                      {update.isPending ? (
                        <LoaderCircle className="h-3 w-3 animate-spin text-of-muted" />
                      ) : null}
                    </span>
                  </button>
                </div>

                {!data.deployment_enabled ? (
                  <div className="flex min-w-0 items-start gap-2 border-b border-of-border-subtle py-3 text-xs leading-5 text-of-muted">
                    <ServerCog size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <p>
                      {data.enabled
                        ? '배포 상한이 꺼져 있어 실행이 차단되어 있습니다. 워크스페이스 정책은 안전하게 끌 수 있습니다.'
                        : '배포 상한이 꺼져 있어 변경할 수 없습니다.'}{' '}
                      새로 활성화하려면 운영자가 `ONEFLOW_AI_SUMMARY=true`로 설정하고
                      서비스를 재기동해야 합니다.
                    </p>
                  </div>
                ) : null}

                <div className="min-h-9 py-2" aria-live="polite">
                  {successMessage ? (
                    <p role="status" className="text-xs text-of-success">
                      {successMessage}
                    </p>
                  ) : null}
                  {update.isError ? (
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                      <p className="min-w-0 text-xs leading-5 text-of-danger" role="alert">
                        {stale
                          ? '다른 관리자가 정책을 변경했습니다. 최신 상태를 불러왔으니 같은 변경을 다시 시도할 수 있습니다.'
                          : update.error instanceof Error
                            ? update.error.message
                            : 'AI 정책을 변경하지 못했습니다.'}
                      </p>
                      {failedTarget !== null ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!policyFresh || busy || (failedTarget && !data.deployment_enabled)}
                          onClick={() => changePolicy(failedTarget)}
                        >
                          {failedTarget
                            ? 'AI 작업 요약 켜기 다시 시도'
                            : 'AI 작업 요약 끄기 다시 시도'}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </section>

              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.65fr)]">
                <section aria-labelledby="ai-execution-boundary-title">
                  <div className="border-b border-of-border-subtle pb-3">
                    <h2 id="ai-execution-boundary-title" className="text-sm font-semibold">
                      실행과 데이터 경계
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-of-muted">
                      활성 정책이 실제 요약 요청에 적용되는 범위입니다.
                    </p>
                  </div>
                  <ul className="divide-y divide-of-border-subtle border-b border-of-border-subtle">
                    <li className="flex min-w-0 items-start gap-3 py-3">
                      <BrainCircuit size={16} className="mt-0.5 shrink-0 text-of-muted" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium">로컬 추출 처리</p>
                        <p className="mt-0.5 text-xs leading-5 text-of-muted">
                          외부 AI 제공자, 모델 API 또는 API key 없이 OneFlow 서버에서
                          요약합니다.
                        </p>
                      </div>
                    </li>
                    <li className="flex min-w-0 items-start gap-3 py-3">
                      <Users size={16} className="mt-0.5 shrink-0 text-of-muted" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium">프로젝트 멤버십</p>
                        <p className="mt-0.5 text-xs leading-5 text-of-muted">
                          사용자가 멤버인 프로젝트의 작업만 조회하며 다른 프로젝트는 찾을 수
                          없는 상태로 응답합니다.
                        </p>
                      </div>
                    </li>
                    <li className="flex min-w-0 items-start gap-3 py-3">
                      <Database size={16} className="mt-0.5 shrink-0 text-of-muted" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium">권한 안의 작업 사실</p>
                        <p className="mt-0.5 text-xs leading-5 text-of-muted">
                          제목, 유형, 상태, 우선순위, 일정, 예상 시간, 설명과 코멘트·활동
                          건수만 사용합니다.
                        </p>
                      </div>
                    </li>
                  </ul>
                </section>

                <section aria-labelledby="ai-policy-audit-title">
                  <div className="border-b border-of-border-subtle pb-3">
                    <h2
                      id="ai-policy-audit-title"
                      className="flex items-center gap-2 text-sm font-semibold"
                    >
                      <History size={15} className="text-of-muted" aria-hidden="true" />
                      정책과 배포
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-of-muted">
                      서버가 확인한 유효 상태와 최근 변경입니다.
                    </p>
                  </div>
                  <dl className="divide-y divide-of-border-subtle border-b border-of-border-subtle">
                    <div className="py-3">
                      <dt className="text-[11px] text-of-muted">최근 변경자</dt>
                      <dd className="mt-1 break-words text-xs font-medium">
                        {data.updated_by_name ?? '초기 워크스페이스 정책'}
                      </dd>
                    </div>
                    <div className="py-3">
                      <dt className="text-[11px] text-of-muted">최근 변경 시각</dt>
                      <dd className="mt-1 text-xs font-medium">
                        {formatUpdatedAt(data.updated_at)}
                      </dd>
                    </div>
                    <div className="flex items-start gap-2 py-3 text-xs leading-5 text-of-muted">
                      {data.effective_enabled ? (
                        <CheckCircle2
                          size={15}
                          className="mt-0.5 shrink-0 text-of-success"
                          aria-hidden="true"
                        />
                      ) : (
                        <ShieldCheck
                          size={15}
                          className="mt-0.5 shrink-0 text-of-muted"
                          aria-hidden="true"
                        />
                      )}
                      <span>
                        revision {data.revision} ·{' '}
                        {data.effective_enabled
                          ? '정책과 배포 상한 모두 허용'
                          : data.deployment_enabled
                            ? '워크스페이스 정책으로 안전 차단'
                            : '배포 상한으로 안전 차단'}
                      </span>
                    </div>
                    <div className="flex items-start gap-2 py-3 text-xs leading-5 text-of-muted">
                      <LockKeyhole size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                      <span>설정 페이지와 정책 변경은 워크스페이스 관리자만 사용할 수 있습니다.</span>
                    </div>
                  </dl>
                </section>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
