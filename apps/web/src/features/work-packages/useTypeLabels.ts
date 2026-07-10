import { useMemo } from 'react'

import { useProjectTypes } from '@/features/project-types/api'

import { TYPE_LABELS } from './types'

/** Resolve a work-item type key to the project's configured label, falling
 *  back to the built-in Korean default until the config loads (or for projects
 *  without type rows — the rolling-deploy fallback). Mirrors useStatusLabels. */
export function useTypeLabels(projectId: string): (key: string) => string {
  const { data } = useProjectTypes(projectId)
  const map = useMemo(() => {
    const m: Record<string, string> = { ...TYPE_LABELS }
    for (const t of data?.items ?? []) m[t.key] = t.name
    return m
  }, [data])
  return (key: string) => map[key] ?? key
}
