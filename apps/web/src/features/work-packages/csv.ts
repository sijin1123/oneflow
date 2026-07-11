/* CSV export/import hooks (PLAN §3 Phase 2). */

import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useCreateExport } from '@/features/ops/dataTransfersApi'
import { api } from '@/lib/api'

import type { CsvImportResult } from './types'

export function useExportCsv(projectId: string) {
  return useCreateExport(projectId)
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
      void queryClient.invalidateQueries({ queryKey: ['data-transfer-jobs'] })
      // A real commit changed the list; a dry-run touched nothing.
      if (!result.dry_run && result.inserted > 0) {
        void queryClient.invalidateQueries({ queryKey: ['work-packages', projectId] })
      }
    },
  })
}
