import type { QueryClient } from '@tanstack/react-query'

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
