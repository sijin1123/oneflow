import type { QueryClient } from '@tanstack/react-query'

import type { WorkspaceCapabilities } from './api'

const WIKI_QUERY_ROOTS = new Set([
  'documents',
  'document',
  'document-links',
  'document-comments',
  'work-package-documents',
  'unified-search',
  'command-palette-search',
])

export function clearWikiDataCache(queryClient: QueryClient) {
  queryClient.removeQueries({
    predicate: (query) => WIKI_QUERY_ROOTS.has(String(query.queryKey[0])),
  })
}

const INITIATIVES_QUERY_ROOTS = new Set([
  'initiatives',
  'projects',
  'unified-search',
  'command-palette-search',
])

export function clearInitiativesDataCache(queryClient: QueryClient) {
  queryClient.removeQueries({
    predicate: (query) => INITIATIVES_QUERY_ROOTS.has(String(query.queryKey[0])),
  })
}

const RELEASES_QUERY_ROOTS = new Set([
  'milestones',
  'work-packages',
  'work-package',
  'saved-filters',
  'portfolio-timeline',
])

export function clearReleasesDataCache(queryClient: QueryClient) {
  queryClient.removeQueries({
    predicate: (query) => RELEASES_QUERY_ROOTS.has(String(query.queryKey[0])),
  })
}

export function mergeWorkspaceCapability<K extends keyof WorkspaceCapabilities>(
  current: WorkspaceCapabilities | undefined,
  key: K,
  capability: WorkspaceCapabilities[K],
) {
  return current ? { ...current, [key]: capability } : current
}
