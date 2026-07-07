import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api'

export type AuthConfig = {
  auth_mode: string
  oidc_issuer: string | null
  oidc_client_id: string | null
  has_client_secret: boolean
}

export function useAuthConfig() {
  return useQuery({
    queryKey: ['auth-config'],
    queryFn: () => api<AuthConfig>('/api/v1/auth/config'),
    staleTime: Infinity, // changes only with a server restart
  })
}
