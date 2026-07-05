import { Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'

import { useCapabilities, useSummarize } from './api'

/* Feature-flagged AI summary (PLAN §3 Phase 3 AI/RAG). Renders nothing unless the
   backend reports the flag on, so the whole feature is invisible by default. */
export function AiSummarySection({ wpId }: { wpId: string }) {
  const caps = useCapabilities()
  const summarize = useSummarize(wpId)

  if (!caps.data?.ai_summary_enabled) return null

  const err = summarize.error instanceof ApiError ? summarize.error.message : null

  return (
    <div className="space-y-2 rounded-of border border-of-border p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-xs font-medium">
          <Sparkles size={13} /> AI 요약
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={summarize.isPending}
          onClick={() => summarize.mutate()}
        >
          {summarize.isPending ? '생성 중…' : '요약 생성'}
        </Button>
      </div>
      {err ? (
        <p className="text-xs text-of-danger">{err}</p>
      ) : summarize.data ? (
        <p className="text-xs leading-relaxed text-of-text">{summarize.data.summary}</p>
      ) : (
        <p className="text-xs text-of-muted">버튼을 눌러 이 작업의 요약을 생성하세요.</p>
      )}
    </div>
  )
}
