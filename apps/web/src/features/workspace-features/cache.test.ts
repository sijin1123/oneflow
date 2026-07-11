import assert from 'node:assert/strict'
import test from 'node:test'

import { QueryClient } from '@tanstack/react-query'

import { clearWikiDataCache } from './cache.ts'

test('Wiki policy changes evict Wiki/search data and preserve unrelated caches', () => {
  const queryClient = new QueryClient()
  const wikiKeys = [
    ['documents', 'project-1'],
    ['document', 'document-1'],
    ['document-links', 'document-1'],
    ['document-comments', 'document-1'],
    ['work-package-documents', 'work-1'],
    ['unified-search', 'policy'],
    ['command-palette-search', 'policy'],
  ]
  for (const key of wikiKeys) queryClient.setQueryData(key, { stale: true })
  queryClient.setQueryData(['projects'], { items: ['keep'] })
  queryClient.setQueryData(['attachments', 'project-1'], { items: ['keep'] })

  clearWikiDataCache(queryClient)

  for (const key of wikiKeys) assert.equal(queryClient.getQueryData(key), undefined)
  assert.deepEqual(queryClient.getQueryData(['projects']), { items: ['keep'] })
  assert.deepEqual(queryClient.getQueryData(['attachments', 'project-1']), {
    items: ['keep'],
  })
})
