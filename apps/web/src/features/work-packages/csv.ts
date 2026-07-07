/* CSV export/import hooks (PLAN §3 Phase 2).
   Export streams text/csv (not JSON), so it uses a raw fetch + Blob download and
   surfaces the reconciliation headers. Import posts JSON and returns the
   dry-run / commit result. */

import { useMutation, useQueryClient } from '@tanstack/react-query'

import { ApiError, BASE_URL, api } from '@/lib/api'

import type { CsvImportResult } from './types'

export type ExportSummary = { rowCount: number; checksum: string }

async function downloadCsv(projectId: string): Promise<ExportSummary> {
  const res = await fetch(
    `${BASE_URL}/api/v1/projects/${projectId}/work-packages/export.csv`,
  )
  if (!res.ok) {
    const requestId = res.headers.get('x-request-id')
    throw new ApiError(res.status, `내보내기 실패 (HTTP ${res.status})`, requestId, null)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `oneflow-work-packages-${projectId}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return {
    rowCount: Number(res.headers.get('x-oneflow-row-count') ?? 0),
    checksum: res.headers.get('x-oneflow-checksum') ?? '',
  }
}

export function useExportCsv(projectId: string) {
  return useMutation({ mutationFn: () => downloadCsv(projectId) })
}

export type ImportSource = 'oneflow' | 'jira' | 'linear'

export function useImportCsv(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ source, ...input }: { content: string; dry_run: boolean; source: ImportSource }) =>
      api<CsvImportResult>(
        `/api/v1/projects/${projectId}/work-packages/import${source === 'oneflow' ? '' : `/${source}`}`,
        {
          method: 'POST',
          body: JSON.stringify(input),
        },
      ),
    onSuccess: (result) => {
      // A real commit changed the list; a dry-run touched nothing.
      if (!result.dry_run && result.inserted > 0) {
        void queryClient.invalidateQueries({ queryKey: ['work-packages', projectId] })
      }
    },
  })
}
