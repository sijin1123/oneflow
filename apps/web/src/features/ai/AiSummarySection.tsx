import { RefreshCw, Sparkles } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'

import { useCapabilities, useSummarize } from './api'

/* Feature-flagged AI summary (PLAN §3 Phase 3 AI/RAG). Renders nothing unless the
   backend reports the flag on, so the whole feature is invisible by default. */
export function AiSummarySection({ wpId }: { wpId: string }) {
  const caps = useCapabilities()
  const summarize = useSummarize(wpId)
  const [requestWpId, setRequestWpId] = useState<string | null>(null)
  const [summaries, setSummaries] = useState<Record<string, string>>({})

  if (!caps.data?.ai_summary_enabled) return null

  const summary = summaries[wpId] ?? null
  const requestIsCurrent = requestWpId === wpId
  const pending = requestIsCurrent && summarize.isPending
  const err = requestIsCurrent && summarize.error
    ? summarize.error instanceof ApiError
      ? summarize.error.message
      : '요약을 생성하지 못했습니다.'
    : null

  const generate = () => {
    setRequestWpId(wpId)
    summarize.mutate(undefined, {
      onSuccess: (result) => {
        setSummaries((current) => ({ ...current, [result.work_package_id]: result.summary }))
      },
    })
  }

  return (
    <section aria-label="AI 요약" className="border-b border-of-border-subtle pb-4">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-of-secondary">
          <Sparkles size={13} aria-hidden="true" />
          AI 요약
        </h3>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={generate}
        >
          <RefreshCw
            size={13}
            aria-hidden="true"
            className={pending ? 'animate-spin motion-reduce:animate-none' : undefined}
          />
          {pending ? '생성 중' : err ? '다시 시도' : summary ? '새로 고침' : '생성'}
        </Button>
      </div>
      <div aria-live="polite" className="min-h-12 px-1 py-2">
        {summary ? (
          <p className="text-sm leading-6 text-of-text">{summary}</p>
        ) : (
          <p className="text-sm text-of-muted">아직 생성된 요약이 없습니다.</p>
        )}
        {err ? <p role="alert" className="mt-2 text-xs text-of-danger">{err}</p> : null}
      </div>
    </section>
  )
}
