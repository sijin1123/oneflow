import { useMemo } from 'react'

import { useProjectStatuses } from '@/features/project-statuses/api'

import { STATUS_LABELS } from './types'

/** Resolve a work-package status key to the project's configured label, falling
 *  back to the built-in Korean default until the config loads. Lets every
 *  status-rendering surface (chips, filter, drawer, dashboard) show the label an
 *  owner set in Settings, instead of only the board honoring it (fable5 audit). */
export function useStatusLabels(projectId: string): (key: string) => string {
  const { data } = useProjectStatuses(projectId)
  const map = useMemo(() => {
    const m: Record<string, string> = { ...STATUS_LABELS }
    for (const s of data?.items ?? []) m[s.key] = s.name
    return m
  }, [data])
  return (key: string) => map[key] ?? key
}
