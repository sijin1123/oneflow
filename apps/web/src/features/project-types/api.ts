import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { registerIdentityReset } from '@/features/auth/cache'
import { api } from '@/lib/api'
import { queryClient as appQueryClient } from '@/lib/query'

type ProjectTypeRequestState = {
  requestVersion: number
  successfulRequestVersion: number
  dataUpdateCountAtStart: number
}

const projectTypeRequestStates = new Map<string, ProjectTypeRequestState>()
const emptyProjectTypeRequestState: ProjectTypeRequestState = {
  requestVersion: 0,
  successfulRequestVersion: 0,
  dataUpdateCountAtStart: 0,
}

function projectTypesQueryKey(projectId: string) {
  return ['project-types', projectId] as const
}

export function getProjectTypeRequestState(projectId: string) {
  return projectTypeRequestStates.get(projectId) ?? emptyProjectTypeRequestState
}

function startProjectTypeRequest(projectId: string) {
  const previous = getProjectTypeRequestState(projectId)
  const requestVersion = previous.requestVersion + 1
  projectTypeRequestStates.set(projectId, {
    requestVersion,
    successfulRequestVersion: previous.successfulRequestVersion,
    dataUpdateCountAtStart:
      appQueryClient.getQueryState(projectTypesQueryKey(projectId))?.dataUpdateCount ?? 0,
  })
  return requestVersion
}

function completeProjectTypeRequest(projectId: string, requestVersion: number) {
  const current = getProjectTypeRequestState(projectId)
  if (current.requestVersion !== requestVersion) return
  projectTypeRequestStates.set(projectId, {
    ...current,
    successfulRequestVersion: requestVersion,
  })
}

export function isProjectTypeRequestAccepted(projectId: string) {
  const request = getProjectTypeRequestState(projectId)
  const query = appQueryClient.getQueryState(projectTypesQueryKey(projectId))
  return Boolean(
    query &&
      query.fetchStatus === 'idle' &&
      request.requestVersion === request.successfulRequestVersion &&
      query.dataUpdateCount > request.dataUpdateCountAtStart,
  )
}

registerIdentityReset(() => projectTypeRequestStates.clear())

export type ProjectType = {
  id: string
  project_id: string
  key: string
  name: string
  position: number
  is_active: boolean
  is_builtin: boolean
}

export type ProjectTypeList = { items: ProjectType[]; total: number }

export function useProjectTypes(projectId: string) {
  return useQuery({
    queryKey: projectTypesQueryKey(projectId),
    queryFn: async () => {
      const requestVersion = startProjectTypeRequest(projectId)
      const result = await api<ProjectTypeList>(
        `/api/v1/projects/${projectId}/types`,
      )
      completeProjectTypeRequest(projectId, requestVersion)
      return result
    },
  })
}

export function useCreateProjectType(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) =>
      api<ProjectType>(`/api/v1/projects/${projectId}/types`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['project-types', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard', projectId] })
    },
  })
}

export function useUpdateProjectType(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ typeId, ...input }: { typeId: string; name?: string; is_active?: boolean }) =>
      api<ProjectType>(`/api/v1/projects/${projectId}/types/${typeId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['project-types', projectId] })
    },
  })
}

export function useReorderProjectTypes(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (orderedIds: string[]) =>
      api<ProjectTypeList>(`/api/v1/projects/${projectId}/types/order`, {
        method: 'PUT',
        body: JSON.stringify({ ordered_ids: orderedIds }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['project-types', projectId] })
    },
  })
}
