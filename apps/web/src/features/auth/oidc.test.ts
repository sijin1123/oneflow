import assert from 'node:assert/strict'
import test from 'node:test'

import { buildOidcStartUrl, oidcErrorKey } from './oidc.ts'

test('OIDC start URL binds the visible provider and safe return path', () => {
  const result = new URL(
    buildOidcStartUrl('https://api.oneflow.example/', 'microsoft', '/projects?view=board'),
  )
  assert.equal(result.origin, 'https://api.oneflow.example')
  assert.equal(result.pathname, '/api/v1/auth/oidc/start')
  assert.equal(result.searchParams.get('provider'), 'microsoft')
  assert.equal(result.searchParams.get('next'), '/projects?view=board')
})

test('OIDC callback errors map to stable presentation keys', () => {
  assert.equal(oidcErrorKey(null), null)
  assert.equal(oidcErrorKey('invalid_state'), 'oauthInvalidState')
  assert.equal(oidcErrorKey('access_denied'), 'oauthCancelled')
  assert.equal(oidcErrorKey('invalid_response'), 'oauthInvalidResponse')
  assert.equal(oidcErrorKey('account_unavailable'), 'oauthAccountUnavailable')
  assert.equal(oidcErrorKey('unexpected_provider_code'), 'oauthProviderError')
})
