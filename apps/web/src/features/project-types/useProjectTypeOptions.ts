import { useMemo } from 'react'

import { useProjectTypes } from './api'

const BUILTIN_TYPES = [
  { key: 'task', name: '작업' },
  { key: 'bug', name: '버그' },
  { key: 'feature', name: '기능' },
  { key: 'milestone', name: '마일스톤' },
] as const

export function useProjectTypeOptions(
  projectId: string,
  options: { includeInactive?: boolean; currentKey?: string } = {},
) {
  const query = useProjectTypes(projectId)
  const items = useMemo(() => {
    const configured = query.data?.items
    const rows = configured?.length
      ? [...configured]
          .sort((a, b) => a.position - b.position || a.key.localeCompare(b.key))
          .map((item) => ({
            key: item.key,
            label: item.name,
            isActive: item.is_active,
            isBuiltin: item.is_builtin,
          }))
      : BUILTIN_TYPES.map((item) => ({
          key: item.key,
          label: item.name,
          isActive: true,
          isBuiltin: true,
        }))
    return rows.filter(
      (item) => options.includeInactive || item.isActive || item.key === options.currentKey,
    )
  }, [options.currentKey, options.includeInactive, query.data?.items])

  return { ...query, options: items }
}
