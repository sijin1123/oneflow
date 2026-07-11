import assert from 'node:assert/strict'
import test from 'node:test'

import { QueryClient } from '@tanstack/react-query'

import {
  clearInitiativesDataCache,
  clearWikiDataCache,
  mergeWorkspaceCapability,
} from './cache.ts'

const capabilities = {
  wiki: { enabled: true, revision: 3 },
  ai: {
    enabled: false,
    revision: 2,
    deployment_enabled: true,
    effective_enabled: false,
  },
  initiatives: { enabled: true, revision: 1 },
}

test('workspace policy cache updates one capability without losing the other', () => {
  const ai = mergeWorkspaceCapability(capabilities, 'ai', {
    enabled: true,
    revision: 3,
    deployment_enabled: true,
    effective_enabled: true,
  })
  assert.equal(ai?.wiki.revision, 3)
  assert.equal(ai?.ai.effective_enabled, true)

  const wiki = mergeWorkspaceCapability(capabilities, 'wiki', {
    enabled: false,
    revision: 4,
  })
  assert.equal(wiki?.ai.revision, 2)
  assert.equal(wiki?.initiatives.enabled, true)
  assert.equal(wiki?.wiki.enabled, false)
  assert.equal(mergeWorkspaceCapability(undefined, 'wiki', capabilities.wiki), undefined)
})

test('Initiatives policy changes evict derived data and preserve unrelated caches', () => {
  const queryClient = new QueryClient()
  const initiativeKeys = [
    ['initiatives'],
    ['projects'],
    ['unified-search', 'strategy'],
    ['command-palette-search', 'strategy'],
  ]
  for (const key of initiativeKeys) queryClient.setQueryData(key, { stale: true })
  queryClient.setQueryData(['documents'], { items: ['keep'] })

  clearInitiativesDataCache(queryClient)

  for (const key of initiativeKeys) assert.equal(queryClient.getQueryData(key), undefined)
  assert.deepEqual(queryClient.getQueryData(['documents']), { items: ['keep'] })
})

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
