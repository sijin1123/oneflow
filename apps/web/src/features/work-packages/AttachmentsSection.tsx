import { Download, ExternalLink, Paperclip, RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { downloadUrl, useWpAttachments } from '@/features/attachments/api'

/* '첨부' — files anchored to this work package (read-only here; anchoring is
   managed from the Files page, Pass 23 PR-AO). */
export function AttachmentsSection({ wpId, projectId }: { wpId: string; projectId: string }) {
  const attachments = useWpAttachments(projectId, wpId)

  return (
    <section aria-label="첨부" className="border-y border-of-border-subtle bg-of-surface">
      <div className="flex min-h-11 min-w-0 items-center gap-2 px-3">
        <Paperclip size={14} className="shrink-0 text-of-muted" aria-hidden="true" />
        <h3 className="text-xs font-semibold text-of-fg">첨부</h3>
        {attachments.data ? (
          <span className="text-[11px] text-of-muted">{attachments.data.total}개</span>
        ) : null}
      </div>
      {attachments.isPending ? (
        <p role="status" className="border-t border-of-border-subtle px-3 py-3 text-xs text-of-muted">
          첨부를 불러오는 중...
        </p>
      ) : attachments.isError ? (
        <div className="flex items-center justify-between gap-3 border-t border-of-border-subtle px-3 py-3 text-xs">
          <p role="alert" className="text-of-danger">첨부를 불러오지 못했습니다.</p>
          <Button variant="ghost" size="sm" onClick={() => { void attachments.refetch() }}>
            <RotateCcw size={13} aria-hidden="true" /> 다시 시도
          </Button>
        </div>
      ) : attachments.data.total === 0 ? (
        <p className="border-t border-of-border-subtle px-3 py-3 text-xs text-of-muted">
          연결된 파일이 없습니다.
        </p>
      ) : (
        <ul className="divide-y divide-of-border-subtle border-t border-of-border-subtle">
          {attachments.data.items.map((a) => (
            <li
              key={a.id}
              className="flex min-h-9 min-w-0 items-center gap-2 px-3 text-xs transition-colors hover:bg-of-surface-hover"
            >
              <span className="min-w-0 flex-1 truncate">{a.filename}</span>
              {a.has_file ? (
                <a
                  href={downloadUrl(a.id)}
                  aria-label={`${a.filename} 다운로드`}
                  className="flex size-7 shrink-0 items-center justify-center rounded-of text-of-muted transition-colors hover:bg-of-surface-hover hover:text-of-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                >
                  <Download size={13} aria-hidden="true" />
                </a>
              ) : (
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${a.filename} 열기`}
                  className="flex size-7 shrink-0 items-center justify-center rounded-of text-of-muted transition-colors hover:bg-of-surface-hover hover:text-of-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                >
                  <ExternalLink size={13} aria-hidden="true" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
