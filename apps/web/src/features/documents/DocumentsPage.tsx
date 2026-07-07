import { ChevronDown, ChevronRight, FileText, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDateTime } from '@/lib/datetime'

import { useCreateDocument, useDocuments } from './api'
import type { DocTreeNode } from './tree'
import { buildDocTree } from './tree'

export function DocumentsPage() {
  const { projectId } = useParams() as { projectId: string }
  const navigate = useNavigate()
  const { data, isPending, isError, error, refetch } = useDocuments(projectId)
  const create = useCreateDocument(projectId)
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const newDoc = () => {
    create.mutate(
      { title: '제목 없는 문서' },
      { onSuccess: (doc) => navigate(`/projects/${projectId}/documents/${doc.id}`) },
    )
  }

  const q = query.trim().toLowerCase()
  // Searching flattens: a title match must never be hidden by tree structure.
  const searching = q.length > 0
  const items = data?.items ?? []
  const visible = items.filter((d) => d.title.toLowerCase().includes(q))
  const forest = buildDocTree(searching ? visible : items)

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const rows: DocTreeNode[] = []
  const flatten = (nodes: DocTreeNode[]) => {
    for (const node of nodes) {
      rows.push(node)
      if (!collapsed.has(node.doc.id)) flatten(node.children)
    }
  }
  flatten(forest)

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-base font-semibold">문서</h1>
        <Button size="sm" disabled={create.isPending} onClick={newDoc}>
          <Plus size={14} /> 새 문서
        </Button>
      </div>

      {isPending ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : data.total === 0 ? (
        <EmptyState title="문서가 없습니다" hint="새 문서를 만들어 회의록·위키·정책을 정리하세요." />
      ) : (
        <>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="문서 제목 검색"
            aria-label="문서 제목 검색"
            className="mb-3"
          />
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-of-muted">검색 결과가 없습니다.</p>
          ) : (
            <ul className="divide-y divide-of-border overflow-hidden rounded-of border border-of-border bg-of-surface">
              {rows.map(({ doc, depth, children }) => (
                <li key={doc.id}>
                  <div
                    className="flex w-full items-center gap-1.5 px-4 py-3 hover:bg-of-surface-2"
                    style={{ paddingLeft: `${16 + depth * 20}px` }}
                  >
                    {children.length > 0 && !searching ? (
                      <button
                        type="button"
                        aria-label={collapsed.has(doc.id) ? '펼치기' : '접기'}
                        className="shrink-0 rounded-of p-0.5 text-of-muted hover:bg-of-surface"
                        onClick={() => toggle(doc.id)}
                      >
                        {collapsed.has(doc.id) ? (
                          <ChevronRight size={14} />
                        ) : (
                          <ChevronDown size={14} />
                        )}
                      </button>
                    ) : (
                      <span className="w-[19px] shrink-0" />
                    )}
                    <button
                      type="button"
                      onClick={() => navigate(`/projects/${projectId}/documents/${doc.id}`)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <FileText size={15} className="shrink-0 text-of-muted" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {doc.title}
                      </span>
                      <span className="shrink-0 text-xs text-of-muted">
                        {formatDateTime(doc.updated_at)}
                      </span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
