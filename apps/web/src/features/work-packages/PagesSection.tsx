import { FileText } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { useLinkedDocuments } from '@/features/documents/api'

/* '페이지' — documents linked to this work package (reverse of the editor's
   '연결된 작업' section, Pass 9 PR-V). Read-only here: linking is managed from
   the document editor, the drawer just navigates. */
export function PagesSection({ wpId, projectId }: { wpId: string; projectId: string }) {
  const docs = useLinkedDocuments(wpId)
  const navigate = useNavigate()

  return (
    <section aria-label="페이지" className="space-y-2 border-t border-of-border pt-3">
      <h3 className="text-xs font-semibold text-of-muted">페이지</h3>

      {docs.isPending ? (
        <p className="text-xs text-of-muted">불러오는 중…</p>
      ) : docs.isError ? (
        <p className="text-xs text-of-danger">연결된 페이지를 불러오지 못했습니다.</p>
      ) : docs.data.total === 0 ? (
        <p className="text-xs text-of-muted">연결된 페이지가 없습니다.</p>
      ) : (
        <ul className="space-y-1">
          {docs.data.items.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => navigate(`/projects/${projectId}/documents/${d.id}`)}
                className="flex w-full items-center gap-2 rounded-of border border-of-border px-2 py-1.5 text-left text-xs hover:bg-of-surface-2"
              >
                <FileText size={13} className="shrink-0 text-of-muted" />
                <span className="min-w-0 flex-1 truncate">{d.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
