import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiError, BASE_URL, api } from '@/lib/api'

export type DataTransferDirection = 'import' | 'export'
export type DataTransferSource = 'oneflow' | 'jira' | 'linear'

export type DataTransferJob = {
  id: string
  project_id: string
  project_key: string
  project_name: string
  actor_id: string | null
  actor_name: string
  direction: DataTransferDirection
  source: DataTransferSource
  dry_run: boolean
  status: 'completed' | 'completed_with_errors'
  total_rows: number
  valid_rows: number
  invalid_rows: number
  inserted_rows: number
  checksum: string
  errors_truncated: boolean
  notes: string[]
  artifact_available: boolean
  artifact_filename: string | null
  artifact_size_bytes: number | null
  artifact_sha256: string | null
  created_at: string
}

type DataTransferJobList = {
  items: DataTransferJob[]
  total: number
  limit: number
  offset: number
}

export type ExportCreated = {
  job_id: string
  row_count: number
  checksum: string
  artifact_sha256: string
  artifact_filename: string
  artifact_size_bytes: number
}

export class ExportDownloadError extends Error {
  created: ExportCreated

  constructor(created: ExportCreated, cause: unknown) {
    super('내보내기 파일은 생성됐지만 자동 다운로드를 완료하지 못했습니다.', { cause })
    this.created = created
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export async function downloadTransferArtifact(jobId: string, filename: string) {
  const response = await fetch(`${BASE_URL}/api/v1/data-transfer-jobs/${jobId}/artifact`, {
    credentials: 'include',
  })
  if (!response.ok) {
    throw new ApiError(
      response.status,
      `내보내기 파일 다운로드 실패 (HTTP ${response.status})`,
      response.headers.get('x-request-id'),
      null,
    )
  }
  triggerDownload(await response.blob(), filename)
}

async function createExport(projectId: string): Promise<ExportCreated> {
  return api<ExportCreated>(
    `/api/v1/projects/${projectId}/data-transfer-jobs/export`,
    { method: 'POST' },
  )
}

export function useDataTransferJobs(projectId?: string) {
  const query = projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''
  return useQuery({
    queryKey: ['data-transfer-jobs', projectId ?? 'all'],
    queryFn: () => api<DataTransferJobList>(`/api/v1/data-transfer-jobs${query}`),
  })
}

export function useDownloadTransferArtifact() {
  return useMutation({
    mutationFn: ({ jobId, filename }: { jobId: string; filename: string }) =>
      downloadTransferArtifact(jobId, filename),
  })
}

export function useCreateExport(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const created = await createExport(projectId)
      await queryClient.invalidateQueries({ queryKey: ['data-transfer-jobs'] })
      try {
        await downloadTransferArtifact(created.job_id, created.artifact_filename)
      } catch (error) {
        throw new ExportDownloadError(created, error)
      }
      return created
    },
  })
}
