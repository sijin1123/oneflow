import { ChevronRight, FileText, RotateCcw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { useLinkedDocuments } from '@/features/documents/api'
import { useWorkspaceCapabilities } from '@/features/workspace-features/api'

/* '페이지' — documents linked to this work package (reverse of the editor's
   '연결된 작업' section, Pass 9 PR-V). Read-only here: linking is managed from
   the document editor, the drawer just navigates. */
export function PagesSection({ wpId, projectId }: { wpId: string; projectId: string }) {
  const capabilities = useWorkspaceCapabilities()
  const enabled = capabilities.data?.wiki.enabled === true
  const docs = useLinkedDocuments(wpId, enabled)
  const navigate = useNavigate()

  if (!enabled) return null

  return (
    <section aria-label="페이지" className="border-y border-of-border-subtle bg-of-surface">
      <div className="flex min-h-11 items-center gap-2 px-3">
        <FileText size={14} className="shrink-0 text-of-muted" aria-hidden="true" />
        <h3 className="text-xs font-semibold text-of-fg">페이지</h3>
        {docs.data ? <span className="text-[11px] text-of-muted">{docs.data.total}개</span> : null}
      </div>

      {docs.isPending ? (
        <p role="status" className="border-t border-of-border-subtle px-3 py-3 text-xs text-of-muted">
          불러오는 중…
        </p>
      ) : docs.isError ? (
        <div className="flex items-center justify-between gap-3 border-t border-of-border-subtle px-3 py-3 text-xs">
          <p role="alert" className="text-of-danger">연결된 페이지를 불러오지 못했습니다.</p>
          <Button variant="ghost" size="sm" onClick={() => { void docs.refetch() }}>
            <RotateCcw size={13} aria-hidden="true" /> 다시 시도
          </Button>
        </div>
      ) : docs.data.total === 0 ? (
        <p className="border-t border-of-border-subtle px-3 py-3 text-xs text-of-muted">
          연결된 페이지가 없습니다.
        </p>
      ) : (
        <ul className="divide-y divide-of-border-subtle border-t border-of-border-subtle">
          {docs.data.items.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => navigate(`/projects/${projectId}/documents/${d.id}`)}
                className="flex min-h-9 w-full items-center gap-2 px-3 text-left text-xs transition-colors hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-of-focus"
              >
                <span className="min-w-0 flex-1 truncate">{d.title}</span>
                <ChevronRight size={13} className="shrink-0 text-of-faint" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
