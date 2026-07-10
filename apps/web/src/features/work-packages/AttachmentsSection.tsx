import { Download, ExternalLink, Paperclip } from 'lucide-react'

import { downloadUrl, useWpAttachments } from '@/features/attachments/api'

/* '첨부' — files anchored to this work package (read-only here; anchoring is
   managed from the Files page, Pass 23 PR-AO). */
export function AttachmentsSection({ wpId, projectId }: { wpId: string; projectId: string }) {
  const attachments = useWpAttachments(projectId, wpId)

  return (
    <section aria-label="첨부" className="space-y-2 border-t border-of-border pt-3">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-of-muted">첨부</h3>
        {attachments.data?.total ? (
          <span className="text-[11px] text-of-muted">{attachments.data.total}개</span>
        ) : null}
      </div>
      {attachments.isPending ? (
        <p className="rounded-of border border-of-border bg-of-surface px-2 py-2 text-xs text-of-muted">
          첨부를 불러오는 중...
        </p>
      ) : attachments.isError ? (
        <p className="rounded-of border border-of-border bg-of-surface px-2 py-2 text-xs text-of-danger">
          첨부를 불러오지 못했습니다.
        </p>
      ) : attachments.data.total === 0 ? (
        <p className="rounded-of border border-of-border bg-of-surface px-2 py-2 text-xs text-of-muted">
          연결된 파일이 없습니다.
        </p>
      ) : (
        <ul className="space-y-1">
          {attachments.data.items.map((a) => (
            <li
              key={a.id}
              className="flex min-w-0 items-center gap-2 rounded-of border border-of-border bg-of-surface px-2 py-1.5 text-xs"
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
      )}
    </section>
  )
}
