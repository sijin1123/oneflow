import type * as React from 'react'
import { useQuery } from '@tanstack/react-query'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { SettingsFrame } from '@/features/settings/SettingsShell'
import { api } from '@/lib/api'

type StatusRead = {
  version: string
  database: { status: string; current_revision: string | null }
  counts: { projects: number | null; work_packages: number | null }
  config: {
    auth_mode: string
    ai_summary_enabled: boolean
    storage_backend: string
    upload_max_bytes: number
    project_storage_quota_bytes: number
  }
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-of border border-of-border bg-of-surface p-4">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      <dl className="space-y-1 text-xs">{children}</dl>
    </div>
  )
}

function Row({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-of-muted">{label}</dt>
      <dd className={warn ? 'font-medium text-of-danger' : 'font-medium'}>{value}</dd>
    </div>
  )
}

const mib = (n: number) => `${Math.round(n / 1_048_576)} MiB`

/* Human-facing system status (Pass 26 PR-AR) — partial failures render as
   gaps, never a broken page. Machine probes (/health) are separate. */
export function StatusPage() {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['ops-status'],
    queryFn: () => api<StatusRead>('/api/v1/ops/status'),
  })

  if (isPending) return <ListSkeleton />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />

  return (
    <SettingsFrame
      eyebrow="Operations"
      title="시스템 상태"
      description="운영자가 배포 상태, 데이터베이스 리비전, 스토리지 한도와 워크스페이스 규모를 빠르게 확인하는 읽기 전용 화면입니다."
      className="max-w-5xl"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Card title="애플리케이션">
          <Row label="버전" value={data.version} />
          <Row label="인증 모드" value={data.config.auth_mode} />
          <Row label="AI 요약" value={data.config.ai_summary_enabled ? '켜짐' : '꺼짐'} />
        </Card>
        <Card title="데이터베이스">
          <Row
            label="상태"
            value={data.database.status === 'ok' ? '정상' : '오류'}
            warn={data.database.status !== 'ok'}
          />
          <Row label="마이그레이션 리비전" value={data.database.current_revision ?? '—'} />
        </Card>
        <Card title="스토리지">
          <Row label="백엔드" value={data.config.storage_backend} />
          <Row label="파일당 상한" value={mib(data.config.upload_max_bytes)} />
          <Row label="프로젝트 쿼터" value={mib(data.config.project_storage_quota_bytes)} />
        </Card>
        <Card title="내 워크스페이스 규모">
          <Row label="프로젝트" value={data.counts.projects?.toString() ?? '—'} />
          <Row label="워크패키지" value={data.counts.work_packages?.toString() ?? '—'} />
        </Card>
      </div>
    </SettingsFrame>
  )
}
