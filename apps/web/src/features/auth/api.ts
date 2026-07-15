import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, BASE_URL } from '@/lib/api'

import { clearIdentityBoundCache } from './cache'
import { buildOidcStartUrl, type OidcProvider } from './oidc'

export type { OidcProvider } from './oidc'

export type AuthConfig = {
  auth_mode: 'dev' | 'oidc'
  oidc_issuer: string | null
  oidc_client_id: string | null
  oidc_provider: OidcProvider | null
  oidc_providers: OidcProvider[]
  has_client_secret: boolean
  command_palette_enabled: boolean
  session_management_enabled: boolean
  password_required: boolean
  oidc_login_enabled: boolean
}

export function oidcStartUrl(provider: OidcProvider, next: string) {
  return buildOidcStartUrl(BASE_URL, provider, next)
}

export function useAuthConfig() {
  return useQuery({
    queryKey: ['auth-config'],
    queryFn: () => api<AuthConfig>('/api/v1/auth/config'),
    staleTime: Infinity, // changes only with a server restart
    retry: false, // the login surface owns an explicit, accessible retry action
  })
}

export type LoginResult = { user_id: string; email: string; display_name: string }
export type LoginInput = { email: string; password?: string; remember_me: boolean }

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: LoginInput) =>
      api<LoginResult>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      clearIdentityBoundCache(queryClient)
    },
  })
}

export type AuthAssistanceKind = 'sign_in_help' | 'workspace_access'
export type AuthAssistanceInput = {
  kind: AuthAssistanceKind
  email: string
  reason?: string
}
export type AuthAssistanceAccepted = { accepted: true; message: string }

export function useAuthAssistance() {
  return useMutation({
    mutationFn: (input: AuthAssistanceInput) =>
      api<AuthAssistanceAccepted>('/api/v1/auth/assistance-requests', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<void>('/api/v1/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      clearIdentityBoundCache(queryClient)
    },
  })
}

export type AuthSession = {
  id: string
  created_at: string
  expires_at: string
  is_current: boolean
}

export type AuthSessionList = { items: AuthSession[]; total: number }

export function useAuthSessions(enabled: boolean) {
  return useQuery({
    queryKey: ['auth-sessions'],
    queryFn: () => api<AuthSessionList>('/api/v1/me/sessions'),
    enabled,
  })
}

export function useRevokeAuthSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string; isCurrent: boolean }) =>
      api<void>(`/api/v1/me/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: (_, variables) => {
      if (variables.isCurrent) {
        clearIdentityBoundCache(queryClient)
        window.location.assign('/login')
        return
      }
      void queryClient.invalidateQueries({ queryKey: ['auth-sessions'] })
    },
  })
}
