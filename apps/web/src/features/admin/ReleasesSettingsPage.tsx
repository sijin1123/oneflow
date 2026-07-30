import {
  Archive,
  CalendarRange,
  CheckCircle2,
  FileSearch,
  Flag,
  History,
  LayoutPanelLeft,
  LoaderCircle,
  RefreshCw,
  Settings2,
  ShieldCheck,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { FrameContextActions } from '@/components/shell/FrameContextActions'
import { EmptyState, ErrorState } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useReleasesPolicy,
  useUpdateReleasesPolicy,
} from '@/features/workspace-features/api'
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

function PolicyFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 bg-of-surface px-3 py-3">
      <dt className="text-[10px] font-medium uppercase text-of-muted">{label}</dt>
      <dd className="mt-1 truncate text-xs font-semibold">{value}</dd>
    </div>
  )
}

function ReleasesPolicySkeleton() {
  return (
    <div role="status" aria-label="Releases 정책 불러오는 중" className="space-y-5 py-5">
      <span className="sr-only">Releases 정책을 불러오는 중입니다.</span>
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

export function ReleasesSettingsPage() {
  const policy = useReleasesPolicy()
  const update = useUpdateReleasesPolicy()
  const lastSuccessfulPolicy = useRef(policy.data)
  const [failedTarget, setFailedTarget] = useState<boolean | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  if (policy.data) lastSuccessfulPolicy.current = policy.data
  const data = policy.data ?? lastSuccessfulPolicy.current
  const stale = update.error instanceof ApiError && update.error.status === 412
  const policyStale = Boolean(data && policy.isError)
  const policyFresh = Boolean(data && !policy.isFetching && !policyStale)
  const busy = update.isPending
  const refreshing = policy.isFetching

  const changePolicy = (enabled: boolean) => {
    if (!data || !policyFresh) return
    update.reset()
    setFailedTarget(null)
    setSuccessMessage(null)
    update.mutate(
      { enabled, revision: data.revision },
      {
        onSuccess: () => {
          setSuccessMessage(
            enabled
              ? 'Releases를 활성화했습니다.'
              : 'Releases를 비활성화했습니다. 기존 마일스톤과 작업 연결은 유지됩니다.',
          )
        },
        onError: () => setFailedTarget(enabled),
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
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || refreshing}
          onClick={() => void refresh()}
        >
          <RefreshCw
            size={13}
            className={policy.isFetching ? 'animate-spin' : undefined}
            aria-hidden="true"
          />
          새로고침
        </Button>
      </FrameContextActions>

      <div
        data-testid="releases-settings-scroll"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        aria-busy={busy || refreshing}
      >
        <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-6">
          <header className="grid gap-4 border-b border-of-border pb-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase text-of-muted">
                Workspace administration
              </p>
              <h1 className="mt-1 text-xl font-semibold">Releases</h1>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">
                마일스톤, 작업 릴리스 연결과 일정 보고의 워크스페이스 정책을 관리합니다.
              </p>
            </div>
            {data ? (
              <Badge variant="outline" className="justify-self-start">
                정책 revision {data.revision}
              </Badge>
            ) : null}
          </header>

          {!data && policy.isPending ? <ReleasesPolicySkeleton /> : null}

          {!data && policy.isError ? (
            <div className="py-5">
              {policy.error instanceof ApiError && policy.error.status === 403 ? (
                <EmptyState
                  title="접근 권한이 없습니다"
                  hint="워크스페이스 Releases 정책은 관리자만 변경할 수 있습니다."
                />
              ) : (
                <ErrorState error={policy.error} onRetry={() => void policy.refetch()} />
              )}
            </div>
          ) : null}

          {data ? (
            <div className="space-y-5 py-5">
              <dl
                aria-label="Releases 정책 요약"
                className="grid grid-cols-2 gap-px border-y border-of-border-subtle bg-of-border-subtle sm:grid-cols-4"
              >
                <PolicyFact label="현재 상태" value={data.enabled ? '활성' : '비활성'} />
                <PolicyFact
                  label="프로젝트 계획"
                  value={data.enabled ? '사용 가능' : '숨김'}
                />
                <PolicyFact
                  label="필터·타임라인"
                  value={data.enabled ? '표시됨' : '제외됨'}
                />
                <PolicyFact label="마일스톤 데이터" value="보존됨" />
              </dl>

              <section aria-labelledby="releases-policy-title">
                <div className="flex min-w-0 items-center justify-between gap-3 border-y border-of-border-subtle py-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-of border border-of-border bg-of-surface-2 text-of-muted">
                      <Flag size={18} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 id="releases-policy-title" className="text-sm font-semibold">
                          마일스톤 릴리스 계획
                        </h2>
                        <Badge variant={data.enabled ? 'accent' : 'outline'}>
                          {data.enabled ? '활성' : '비활성'}
                        </Badge>
                      </div>
                      <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">
                        마일스톤 관리, 작업 연결, 저장 필터와 포트폴리오 일정을 함께
                        제어합니다.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={data.enabled}
                    aria-label="Releases 사용"
                    disabled={busy || !policyFresh}
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
                            : 'Releases 정책을 변경하지 못했습니다.'}
                      </p>
                      {failedTarget !== null ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy || !policyFresh}
                          onClick={() => changePolicy(failedTarget)}
                        >
                          {failedTarget
                            ? 'Releases 켜기 다시 시도'
                            : 'Releases 끄기 다시 시도'}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  {policyStale ? (
                    <div
                      role="alert"
                      className="flex min-w-0 flex-col gap-2 border-y border-of-danger/15 bg-of-danger-soft px-3 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between"
                    >
                      <p className="min-w-0 break-words text-of-danger">
                        최신 정책을 불러오지 못했습니다. 마지막으로 확인한 상태를
                        유지합니다. 복구 전까지 정책 변경은 사용할 수 없습니다.
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-full shrink-0 sm:w-auto"
                        disabled={policy.isFetching}
                        onClick={() => void policy.refetch()}
                      >
                        <RefreshCw size={13} aria-hidden="true" />
                        다시 시도
                      </Button>
                    </div>
                  ) : null}
                </div>
              </section>

              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.65fr)]">
                <section aria-labelledby="releases-effects-title">
                  <div className="border-b border-of-border-subtle pb-3">
                    <h2 id="releases-effects-title" className="text-sm font-semibold">
                      정책 영향 범위
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-of-muted">
                      하나의 정책이 프로젝트 계획, 탐색과 서버 접근에 동일하게 적용됩니다.
                    </p>
                  </div>
                  <ul className="divide-y divide-of-border-subtle border-b border-of-border-subtle">
                    <li className="flex min-w-0 items-start gap-3 py-3">
                      <LayoutPanelLeft size={16} className="mt-0.5 shrink-0 text-of-muted" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium">프로젝트 계획</p>
                        <p className="mt-0.5 text-xs leading-5 text-of-muted">
                          {data.enabled
                            ? '마일스톤 설정과 작업의 릴리스 선택을 표시합니다.'
                            : '마일스톤 설정과 작업의 릴리스 선택을 숨깁니다.'}
                        </p>
                      </div>
                    </li>
                    <li className="flex min-w-0 items-start gap-3 py-3">
                      <CalendarRange size={16} className="mt-0.5 shrink-0 text-of-muted" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium">일정과 포트폴리오</p>
                        <p className="mt-0.5 text-xs leading-5 text-of-muted">
                          {data.enabled
                            ? '프로젝트 타임라인과 포트폴리오 일정에 마일스톤을 포함합니다.'
                            : '타임라인과 포트폴리오 일정에서 마일스톤을 제외합니다.'}
                        </p>
                      </div>
                    </li>
                    <li className="flex min-w-0 items-start gap-3 py-3">
                      <FileSearch size={16} className="mt-0.5 shrink-0 text-of-muted" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium">필터와 API</p>
                        <p className="mt-0.5 text-xs leading-5 text-of-muted">
                          {data.enabled
                            ? '마일스톤 필터, 저장 뷰와 릴리스 API를 사용할 수 있습니다.'
                            : '마일스톤 필터를 정리하고 릴리스 API 요청을 차단합니다.'}
                        </p>
                      </div>
                    </li>
                    <li className="flex min-w-0 items-start gap-3 py-3">
                      <Archive size={16} className="mt-0.5 shrink-0 text-of-muted" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium">저장 데이터</p>
                        <p className="mt-0.5 text-xs leading-5 text-of-muted">
                          정책을 꺼도 기존 마일스톤과 작업 연결은 삭제되지 않으며 다시 켜면
                          복구됩니다.
                        </p>
                      </div>
                    </li>
                  </ul>
                </section>

                <section aria-labelledby="releases-audit-title">
                  <div className="border-b border-of-border-subtle pb-3">
                    <h2
                      id="releases-audit-title"
                      className="flex items-center gap-2 text-sm font-semibold"
                    >
                      <History size={15} className="text-of-muted" aria-hidden="true" />
                      변경 감사
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-of-muted">
                      서버에 기록된 최근 정책 변경입니다.
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
                      {data.enabled ? (
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
                        {data.enabled ? '릴리스 계획 사용 가능' : '릴리스 기능 안전 차단'}
                      </span>
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
