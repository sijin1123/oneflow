import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

import { clearIdentityBoundCache } from './cache'

export type AuthConfig = {
  auth_mode: string
  oidc_issuer: string | null
  oidc_client_id: string | null
  has_client_secret: boolean
  command_palette_enabled: boolean
}

export function useAuthConfig() {
  return useQuery({
    queryKey: ['auth-config'],
    queryFn: () => api<AuthConfig>('/api/v1/auth/config'),
    staleTime: Infinity, // changes only with a server restart
  })
}

export type LoginResult = { user_id: string; email: string; display_name: string }

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (email: string) =>
      api<LoginResult>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email }),
    }),
    onSuccess: () => {
      clearIdentityBoundCache(queryClient)
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<void>('/api/v1/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      queryClient.clear()
    },
  })
}
