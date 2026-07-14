export type OidcProvider = 'google' | 'microsoft' | 'sso'

export type OidcErrorKey =
  | 'oauthInvalidState'
  | 'oauthCancelled'
  | 'oauthProviderError'
  | 'oauthInvalidResponse'
  | 'oauthAccountUnavailable'

export function buildOidcStartUrl(
  apiBaseUrl: string,
  provider: OidcProvider,
  next: string,
) {
  const url = new URL('/api/v1/auth/oidc/start', `${apiBaseUrl.replace(/\/$/, '')}/`)
  url.searchParams.set('provider', provider)
  url.searchParams.set('next', next)
  return url.toString()
}

export function oidcErrorKey(code: string | null): OidcErrorKey | null {
  if (!code) return null
  if (code === 'invalid_state') return 'oauthInvalidState'
  if (code === 'access_denied') return 'oauthCancelled'
  if (code === 'invalid_response') return 'oauthInvalidResponse'
  if (code === 'account_unavailable') return 'oauthAccountUnavailable'
  return 'oauthProviderError'
}
