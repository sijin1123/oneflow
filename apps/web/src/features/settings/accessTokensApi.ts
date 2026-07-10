import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

export type PersonalAccessToken = {
  id: string
  name: string
  token_prefix: string
  created_at: string
  expires_at: string
  revoked_at: string | null
  last_used_at: string | null
}

export type PersonalAccessTokenList = {
  items: PersonalAccessToken[]
  total: number
}

export type PersonalAccessTokenCreated = {
  item: PersonalAccessToken
  token: string
}

export function useAccessTokens() {
  return useQuery({
    queryKey: ['access-tokens'],
    queryFn: () => api<PersonalAccessTokenList>('/api/v1/me/access-tokens'),
  })
}

export function useCreateAccessToken() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; expires_in_days: number }) =>
      api<PersonalAccessTokenCreated>('/api/v1/me/access-tokens', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['access-tokens'] })
    },
  })
}

export function useRevokeAccessToken() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/api/v1/me/access-tokens/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['access-tokens'] })
    },
  })
}
