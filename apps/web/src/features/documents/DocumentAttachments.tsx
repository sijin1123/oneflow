import { Download, ExternalLink, Paperclip } from 'lucide-react'

import { downloadUrl, useDocumentAttachments } from '@/features/attachments/api'

/* '첨부' — files anchored to this document (read-only; anchoring is managed
   from the Files page — Pass 24, completing the v23.1 API-only deferral). */
export function DocumentAttachments({ docId, projectId }: { docId: string; projectId: string }) {
  const attachments = useDocumentAttachments(projectId, docId)

  if (attachments.isPending || attachments.isError) return null
  if (attachments.data.total === 0) return null

  return (
    <section aria-label="문서 첨부" className="mt-4 space-y-2 border-t border-of-border pt-3">
      <h3 className="text-xs font-semibold text-of-muted">첨부</h3>
      <ul className="space-y-1">
        {attachments.data.items.map((a) => (
          <li
            key={a.id}
            className="flex items-center gap-2 rounded-of border border-of-border px-2 py-1.5 text-xs"
          >
            <Paperclip size={12} className="shrink-0 text-of-muted" />
            <span className="min-w-0 flex-1 truncate">{a.filename}</span>
            {a.has_file ? (
              <a
                href={downloadUrl(a.id)}
                aria-label={`${a.filename} 다운로드`}
                className="shrink-0 rounded-of p-1 text-of-muted hover:bg-of-surface-2"
              >
                <Download size={12} />
              </a>
            ) : (
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`${a.filename} 열기`}
                className="shrink-0 rounded-of p-1 text-of-muted hover:bg-of-surface-2"
              >
                <ExternalLink size={12} />
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
