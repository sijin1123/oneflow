import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { api } from '@/lib/api'

export type DirectoryUser = {
  id: string
  email: string
  display_name: string
  is_active: boolean
  is_admin: boolean
  created_at: string
}

export type DirectorySummary = {
  users: number
  active: number
  admins: number
  inactive: number
  active_admins: number
}

export type DirectoryList = {
  items: DirectoryUser[]
  total: number
  summary: DirectorySummary
}

export type UserMembership = {
  project_id: string
  project_key: string
  project_name: string
  role: 'owner' | 'member' | 'viewer'
  archived: boolean
}

export type UserMembershipList = { items: UserMembership[]; total: number }

export type UserDirectoryScope = 'all' | 'admins' | 'inactive'

const USER_DIRECTORY_PAGE_SIZE = 50
const USER_MEMBERSHIP_PAGE_SIZE = 50

function userDirectoryPath(
  query: { q: string; scope: UserDirectoryScope },
  offset: number,
) {
  const params = new URLSearchParams()
  if (offset > 0) {
    params.set('limit', String(USER_DIRECTORY_PAGE_SIZE))
    params.set('offset', String(offset))
  }
  if (query.q) params.set('q', query.q)
  if (query.scope !== 'all') params.set('scope', query.scope)
  const search = params.toString()
  return `/api/v1/users${search ? `?${search}` : ''}`
}

async function getAllUsers() {
  const first = await api<DirectoryList>('/api/v1/users')
  if (first.items.length >= first.total) return first

  const items = [...first.items]
  while (items.length < first.total) {
    const params = new URLSearchParams({
      limit: '200',
      offset: String(items.length),
    })
    const page = await api<DirectoryList>(`/api/v1/users?${params.toString()}`)
    if (page.items.length === 0) break
    items.push(...page.items)
  }
  return { ...first, items }
}

export function useUsers(enabled = true) {
  return useQuery({
    queryKey: ['admin-users'],
    queryFn: getAllUsers,
    enabled,
  })
}

export function useUserDirectory(query: { q: string; scope: UserDirectoryScope }) {
  return useInfiniteQuery({
    queryKey: ['admin-users', 'directory', query],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api<DirectoryList>(userDirectoryPath(query, pageParam)),
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((total, page) => total + page.items.length, 0)
      return loaded < lastPage.total ? loaded : undefined
    },
    placeholderData: keepPreviousData,
    retry: false,
  })
}

export function useUserMemberships(userId: string | null) {
  return useInfiniteQuery({
    queryKey: ['admin-user-memberships', userId],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams()
      if (pageParam > 0) {
        params.set('limit', String(USER_MEMBERSHIP_PAGE_SIZE))
        params.set('offset', String(pageParam))
      }
      const search = params.toString()
      return api<UserMembershipList>(
        `/api/v1/users/${userId}/memberships${search ? `?${search}` : ''}`,
      )
    },
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((total, page) => total + page.items.length, 0)
      return loaded < lastPage.total ? loaded : undefined
    },
    enabled: userId !== null,
    retry: false,
  })
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { email: string; display_name: string }) =>
      api<DirectoryUser>('/api/v1/users', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string
      display_name?: string
      is_active?: boolean
      is_admin?: boolean
    }) => api<DirectoryUser>(`/api/v1/users/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
  })
}
