import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { api } from '@/lib/api'

type StorageRead = {
  used_bytes: number
  quota_bytes: number
  attachment_count: number
  link_count: number
}

const mib = (n: number) => (n / 1_048_576).toFixed(1)

/* Read-only usage snapshot (Pass 57): the quota itself is env-owned —
   editing it here is an explicit non-goal (restart required). */
export function StoragePanel({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const { data } = useQuery({
    queryKey: ['project-storage', projectId],
    queryFn: () => api<StorageRead>(`/api/v1/projects/${projectId}/storage`),
  })
  if (!data) return null

  const unlimited = data.quota_bytes <= 0
  const ratio = unlimited ? 0 : data.used_bytes / data.quota_bytes
  const pct = Math.min(100, Math.round(ratio * 100))
  const warn = !unlimited && ratio >= 0.8

  return (
    <div className="space-y-3 rounded-of border border-of-border bg-of-surface p-3">
      <p className="text-xs font-medium">스토리지 사용량</p>
      <div className="space-y-1">
        <div className="h-2 overflow-hidden rounded-full bg-of-surface-2">
          <div
            className={`h-full ${warn ? 'bg-of-danger' : 'bg-of-accent'}`}
            style={{ width: `${pct}%` }}
            aria-label={`사용량 ${pct}%`}
          />
        </div>
        <p className={`text-xs ${warn ? 'font-medium text-of-danger' : 'text-of-muted'}`}>
          {mib(data.used_bytes)} MiB /{' '}
          {unlimited ? '무제한' : `${mib(data.quota_bytes)} MiB (${pct}%)`}
          {ratio > 1 ? ' — 한도 초과 상태입니다' : warn ? ' — 한도에 가까워지고 있습니다' : ''}
        </p>
      </div>
      <p className="text-xs text-of-muted">
        업로드 파일 {data.attachment_count}건 · 외부 링크 {data.link_count}건 (링크는 용량을
        차지하지 않습니다)
      </p>
      <button
        type="button"
        className="text-xs text-of-accent hover:underline"
        onClick={() => navigate(`/projects/${projectId}/files`)}
      >
        파일 페이지로 이동
      </button>
      <p className="text-[11px] text-of-muted">
        용량 한도는 서버 환경변수(ONEFLOW_PROJECT_STORAGE_QUOTA_BYTES)로 관리되며 변경 시 재기동이
        필요합니다.
      </p>
    </div>
  )
}
