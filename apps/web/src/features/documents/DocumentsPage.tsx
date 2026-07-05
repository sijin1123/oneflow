import { FileText, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDateTime } from '@/lib/datetime'

import { useCreateDocument, useDocuments } from './api'

export function DocumentsPage() {
  const { projectId } = useParams() as { projectId: string }
  const navigate = useNavigate()
  const { data, isPending, isError, error, refetch } = useDocuments(projectId)
  const create = useCreateDocument(projectId)
  const [query, setQuery] = useState('')

  const newDoc = () => {
    create.mutate(
      { title: '제목 없는 문서' },
      { onSuccess: (doc) => navigate(`/projects/${projectId}/documents/${doc.id}`) },
    )
  }

  const q = query.trim().toLowerCase()
  const visible = (data?.items ?? []).filter((d) => d.title.toLowerCase().includes(q))

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
          {visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-of-muted">검색 결과가 없습니다.</p>
          ) : (
            <ul className="divide-y divide-of-border overflow-hidden rounded-of border border-of-border bg-of-surface">
              {visible.map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/projects/${projectId}/documents/${doc.id}`)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-of-surface-2"
                  >
                    <FileText size={15} className="shrink-0 text-of-muted" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{doc.title}</span>
                    <span className="shrink-0 text-xs text-of-muted">
                      {formatDateTime(doc.updated_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
