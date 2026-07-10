import assert from 'node:assert/strict'
import test from 'node:test'

import { QueryClient } from '@tanstack/react-query'

import { clearIdentityBoundCache } from './cache.ts'

test('login identity switch removes the previous user private cache before navigation', () => {
  const queryClient = new QueryClient()
  queryClient.setQueryData(['personal-notes', '', 200, 0], {
    items: [{ id: 'user-a-private-note', title: 'User A private' }],
  })
  queryClient.setQueryData(['me'], { id: 'user-a' })

  clearIdentityBoundCache(queryClient)

  assert.equal(queryClient.getQueryData(['personal-notes', '', 200, 0]), undefined)
  assert.equal(queryClient.getQueryData(['me']), undefined)
})
