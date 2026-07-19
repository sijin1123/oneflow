import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

import type {
  ProjectRole,
  ProjectRoleCapabilityList,
  ProjectRoleCreate,
  ProjectRoleEventList,
  ProjectRoleList,
  ProjectRoleUpdate,
} from './contract'

export const projectRoleCapabilitiesKey = ['project-role-capabilities'] as const
export const adminProjectRolesKey = ['admin-project-roles'] as const
export const projectRoleCatalogKey = ['project-role-catalog'] as const

export function useProjectRoleCapabilities() {
  return useQuery({
    queryKey: projectRoleCapabilitiesKey,
    queryFn: () =>
      api<ProjectRoleCapabilityList>('/api/v1/workspace/project-role-capabilities'),
    staleTime: Infinity,
  })
}

export function useAdminProjectRoles(includeArchived: boolean) {
  return useQuery({
    queryKey: [...adminProjectRolesKey, includeArchived],
    queryFn: () =>
      api<ProjectRoleList>(
        `/api/v1/admin/workspace/project-roles?include_archived=${includeArchived}`,
      ),
  })
}

export function useProjectRoleEvents(roleId: string | null) {
  return useQuery({
    queryKey: [...adminProjectRolesKey, 'events', roleId],
    queryFn: () =>
      api<ProjectRoleEventList>(
        `/api/v1/admin/workspace/project-roles/${roleId}/events?limit=50&offset=0`,
      ),
    enabled: roleId !== null,
  })
}

function useInvalidateProjectRoles() {
  const queryClient = useQueryClient()
  return async (roleId?: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: adminProjectRolesKey }),
      queryClient.invalidateQueries({ queryKey: projectRoleCatalogKey }),
      queryClient.invalidateQueries({ queryKey: ['members'] }),
      queryClient.invalidateQueries({ queryKey: ['permissions'] }),
      ...(roleId
        ? [queryClient.invalidateQueries({ queryKey: [...adminProjectRolesKey, 'events', roleId] })]
        : []),
    ])
  }
}

export function useCreateProjectRole() {
  const invalidate = useInvalidateProjectRoles()
  return useMutation({
    mutationFn: (input: ProjectRoleCreate) =>
      api<ProjectRole>('/api/v1/admin/workspace/project-roles', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (role) => invalidate(role.id),
  })
}

export function useUpdateProjectRole(roleId: string | null) {
  const invalidate = useInvalidateProjectRoles()
  return useMutation({
    mutationFn: (input: ProjectRoleUpdate) => {
      if (!roleId) throw new Error('project role is not selected')
      return api<ProjectRole>(`/api/v1/admin/workspace/project-roles/${roleId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      })
    },
    onSuccess: (role) => invalidate(role.id),
    onError: () => invalidate(roleId ?? undefined),
  })
}

export function useSetProjectRoleArchived(roleId: string | null) {
  const invalidate = useInvalidateProjectRoles()
  return useMutation({
    mutationFn: ({ archived, revision }: { archived: boolean; revision: number }) => {
      if (!roleId) throw new Error('project role is not selected')
      return api<ProjectRole>(
        `/api/v1/admin/workspace/project-roles/${roleId}/${archived ? 'archive' : 'restore'}`,
        {
          method: 'POST',
          body: JSON.stringify({ expected_revision: revision }),
        },
      )
    },
    onSuccess: (role) => invalidate(role.id),
    onError: () => invalidate(roleId ?? undefined),
  })
}
