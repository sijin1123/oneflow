import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api'

import type { ProjectList } from './types'

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => api<ProjectList>('/api/v1/projects'),
  })
}
