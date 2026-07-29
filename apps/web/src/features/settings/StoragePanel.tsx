import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  Archive,
  Database,
  ExternalLink,
  File,
  FolderOpen,
  Link2,
  RefreshCw,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

type StorageRead = {
  used_bytes: number
  quota_bytes: number
  attachment_count: number
  link_count: number
}

const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'] as const

function formatStorageBytes(value: number) {
  const bytes = Math.max(0, value)
  if (bytes === 0) return '0 B'

  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    BYTE_UNITS.length - 1,
  )
  const scaled = bytes / 1024 ** unitIndex
  const precision = scaled >= 100 || unitIndex === 0 ? 0 : 1
  return `${scaled.toFixed(precision)} ${BYTE_UNITS[unitIndex]}`
}

/* Read-only usage snapshot (Pass 57): the quota itself is env-owned —
   editing it here is an explicit non-goal (restart required). */
export function StoragePanel({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const storage = useQuery({
    queryKey: ['project-storage', projectId],
    queryFn: () => api<StorageRead>(`/api/v1/projects/${projectId}/storage`),
  })

  if (storage.isPending) {
    return (
      <section aria-label="프로젝트 스토리지" className="min-w-0">
        <ListSkeleton rows={4} />
      </section>
    )
  }
  if (!storage.data) {
    return (
      <ErrorState
        error={storage.error}
        onRetry={() => void storage.refetch()}
      />
    )
  }

  const { data } = storage
  const unlimited = data.quota_bytes <= 0
  const ratio = unlimited ? 0 : data.used_bytes / data.quota_bytes
  const pct = Math.min(100, Math.round(ratio * 100))
  const exceeded = !unlimited && ratio > 1
  const warn = !unlimited && ratio >= 0.8
  const available = unlimited
    ? null
    : Math.max(0, data.quota_bytes - data.used_bytes)
  const empty = data.attachment_count === 0 && data.link_count === 0
  const status = unlimited
    ? '무제한'
    : exceeded
      ? '한도 초과'
      : warn
        ? '확인 필요'
        : '정상'

  return (
    <section
      aria-label="프로젝트 스토리지"
      className="min-w-0 overflow-hidden rounded-of border border-of-border bg-of-surface"
    >
      <header className="flex min-w-0 flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase text-of-muted">
            Project storage
          </p>
          <h2 className="mt-1 flex items-center gap-2 text-sm font-semibold">
            <Database size={15} aria-hidden="true" />
            파일 스토리지
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">
            프로젝트에 저장된 파일 용량과 외부 링크 구성을 확인합니다.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-start">
          <Badge
            variant={exceeded ? 'danger' : warn ? 'warning' : 'outline'}
          >
            {status}
          </Badge>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-7 px-0"
            title="사용량 새로고침"
            aria-label="사용량 새로고침"
            disabled={storage.isFetching}
            onClick={() => void storage.refetch()}
          >
            <RefreshCw
              size={14}
              aria-hidden="true"
              className={cn(storage.isFetching && 'animate-spin')}
            />
          </Button>
        </div>
      </header>

      {storage.isError ? (
        <div
          role="alert"
          className="mx-4 mb-4 flex min-w-0 flex-col gap-3 border border-of-warning/35 bg-of-warning/10 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 items-start gap-2">
            <AlertTriangle
              size={14}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-of-warning"
            />
            <div className="min-w-0">
              <p className="text-xs font-medium">최신 사용량을 불러오지 못했습니다</p>
              <p className="mt-0.5 text-[11px] leading-5 text-of-muted">
                마지막으로 확인한 스토리지 정보를 표시합니다.
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full shrink-0 sm:w-auto"
            disabled={storage.isFetching}
            onClick={() => void storage.refetch()}
          >
            <RefreshCw
              size={14}
              aria-hidden="true"
              className={cn(storage.isFetching && 'animate-spin')}
            />
            사용량 다시 시도
          </Button>
        </div>
      ) : null}

      <div
        role="list"
        aria-label="스토리지 요약"
        className="grid grid-cols-2 gap-px border-y border-of-border bg-of-border sm:grid-cols-4"
      >
        <StorageMetric
          icon={Archive}
          label="사용 중"
          value={formatStorageBytes(data.used_bytes)}
        />
        <StorageMetric
          icon={Database}
          label="남은 용량"
          value={available === null ? '무제한' : formatStorageBytes(available)}
        />
        <StorageMetric
          icon={File}
          label="업로드 파일"
          value={`${data.attachment_count.toLocaleString('ko-KR')}건`}
        />
        <StorageMetric
          icon={Link2}
          label="외부 링크"
          value={`${data.link_count.toLocaleString('ko-KR')}건`}
        />
      </div>

      <div className="space-y-4 px-4 py-4">
        <div className="space-y-2">
          <div className="flex min-w-0 items-center justify-between gap-3 text-xs">
            <span className="font-medium">용량 사용률</span>
            <span
              className={cn(
                'shrink-0 tabular-nums text-of-muted',
                exceeded && 'font-medium text-of-danger',
                !exceeded && warn && 'font-medium text-of-warning',
              )}
            >
              {unlimited ? '한도 없음' : `${pct}%`}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="프로젝트 스토리지 사용률"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={unlimited ? undefined : pct}
            aria-valuetext={
              unlimited
                ? `${formatStorageBytes(data.used_bytes)} 사용, 한도 없음`
                : `${formatStorageBytes(data.used_bytes)} / ${formatStorageBytes(data.quota_bytes)}, ${pct}%`
            }
            className="h-2 overflow-hidden rounded-full bg-of-surface-2"
          >
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none',
                exceeded
                  ? 'bg-of-danger'
                  : warn
                    ? 'bg-of-warning'
                    : 'bg-of-accent',
              )}
              style={{
                width: unlimited
                  ? '0%'
                  : `${data.used_bytes > 0 ? Math.max(2, pct) : 0}%`,
              }}
            />
          </div>
          <p
            className={cn(
              'text-xs leading-5 text-of-muted',
              exceeded && 'text-of-danger',
              !exceeded && warn && 'text-of-warning',
            )}
          >
            {formatStorageBytes(data.used_bytes)} 사용
            {unlimited
              ? ' · 용량 제한 없음'
              : ` / ${formatStorageBytes(data.quota_bytes)}`}
            {exceeded
              ? ` · ${formatStorageBytes(data.used_bytes - data.quota_bytes)} 초과`
              : warn
                ? ' · 한도에 가까워지고 있습니다'
                : ''}
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-3 border-t border-of-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium">
              {empty ? '저장된 파일과 링크가 없습니다' : '프로젝트 파일'}
            </p>
            <p className="mt-1 text-[11px] leading-5 text-of-muted">
              외부 링크는 스토리지 용량을 사용하지 않습니다.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full shrink-0 sm:w-auto"
            onClick={() => navigate(`/projects/${projectId}/files`)}
          >
            <FolderOpen size={14} aria-hidden="true" />
            파일 열기
            <ExternalLink size={12} aria-hidden="true" />
          </Button>
        </div>
      </div>

      <p className="border-t border-of-border bg-of-surface-2/35 px-4 py-2.5 text-[11px] leading-5 text-of-muted">
        프로젝트 용량 한도는 시스템 운영 정책에 따라 적용됩니다.
      </p>
    </section>
  )
}

function StorageMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Database
  label: string
  value: string
}) {
  return (
    <div
      role="listitem"
      className="flex min-w-0 items-start gap-2 bg-of-surface-2/55 px-3 py-2.5"
    >
      <Icon
        size={14}
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-of-muted"
      />
      <div className="min-w-0">
        <p className="text-[10px] text-of-muted">{label}</p>
        <p className="mt-1 truncate text-sm font-semibold tabular-nums" title={value}>
          {value}
        </p>
      </div>
    </div>
  )
}
