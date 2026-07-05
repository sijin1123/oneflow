import { useQueryClient } from '@tanstack/react-query'
import { Suspense, lazy, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Input } from '@/components/ui/input'
import { AiSummarySection } from '@/features/ai/AiSummarySection'
import { useMilestones } from '@/features/milestones/api'
import { Select } from '@/components/ui/select'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { ApiError } from '@/lib/api'
import { decideOnPatchError } from '@/lib/conflict'

// Tiptap is heavy — load it only when a drawer actually renders (code-split).
const RichTextEditor = lazy(() =>
  import('@/components/ui/rich-text-editor').then((m) => ({ default: m.RichTextEditor })),
)

import { CostSection } from './CostSection'
import { HistorySection } from './HistorySection'
import { RelationsSection } from './RelationsSection'
import { TimeTrackingSection } from './TimeTrackingSection'
import { PriorityChip, StatusChip } from './chips'
import { usePatchWorkPackage, useWorkPackage } from './api'
import { useStatusLabels } from './useStatusLabels'
import {
  PRIORITY_LABELS,
  WP_PRIORITIES,
  WP_STATUSES,
  type WorkPackage,
  type WpPriority,
  type WpStatus,
} from './types'

export function DetailDrawer({ projectId }: { projectId: string }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const wpId = searchParams.get('wp')

  const close = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('wp')
      return next
    })
  }

  return (
    <Sheet open={wpId !== null} onOpenChange={(open) => !open && close()}>
      {wpId ? <DrawerBody key={wpId} wpId={wpId} projectId={projectId} /> : null}
    </Sheet>
  )
}

function DrawerBody({ wpId, projectId }: { wpId: string; projectId: string }) {
  const { data: wp, isPending, isError, error, refetch } = useWorkPackage(wpId)

  return (
    <SheetContent title={wp ? wp.subject : '작업 상세'}>
      {isPending ? (
        <ListSkeleton rows={4} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <DrawerForm wp={wp} projectId={projectId} />
      )}
    </SheetContent>
  )
}

function DrawerForm({ wp, projectId }: { wp: WorkPackage; projectId: string }) {
  const patch = usePatchWorkPackage(projectId)
  const queryClient = useQueryClient()
  const milestones = useMilestones(projectId)
  const statusLabel = useStatusLabels(projectId)

  // All editable fields are controlled and resynced from server data, so a 409
  // invalidate+refetch really does reload every field (review finding #2).
  const [subject, setSubject] = useState(wp.subject)
  const [startDate, setStartDate] = useState(wp.start_date ?? '')
  const [dueDate, setDueDate] = useState(wp.due_date ?? '')
  const [estimate, setEstimate] = useState(wp.estimated_hours?.toString() ?? '')
  useEffect(() => {
    setSubject(wp.subject)
    setStartDate(wp.start_date ?? '')
    setDueDate(wp.due_date ?? '')
    setEstimate(wp.estimated_hours?.toString() ?? '')
  }, [wp.subject, wp.start_date, wp.due_date, wp.estimated_hours])

  const send = (fields: Partial<Record<string, unknown>>) => {
    // Token from the query cache, not the render snapshot: two quick edits in a
    // row must carry the bumped version, not a stale one that would trigger a
    // false self-conflict 409 (review finding #3).
    const cached = queryClient.getQueryData<WorkPackage>(['work-package', wp.id])
    patch.mutate({
      wpId: wp.id,
      patch: { expected_version: cached?.version ?? wp.version, ...fields },
    })
  }

  // A failed save must never be silent: 409 reloads the latest server values and
  // says so; any other error (422/403/5xx/network) shows its message while the
  // typed value stays on screen so nothing is lost.
  const saveError =
    patch.isError && patch.error instanceof ApiError
      ? patch.error.status === 409
        ? decideOnPatchError(409).message
        : patch.error.message
      : null

  return (
    <div className="space-y-5">
      {saveError ? (
        <p role="alert" className="rounded-of bg-of-danger/10 px-3 py-2 text-xs text-of-danger">
          저장하지 못했습니다: {saveError}
        </p>
      ) : null}
      <div className="space-y-1.5">
        <label htmlFor="wp-subject" className="text-xs font-medium text-of-muted">
          제목
        </label>
        <Input
          id="wp-subject"
          value={subject}
          disabled={patch.isPending}
          onChange={(e) => setSubject(e.target.value)}
          onBlur={() => {
            const trimmed = subject.trim()
            if (trimmed && trimmed !== wp.subject) send({ subject: trimmed })
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="wp-status" className="text-xs font-medium text-of-muted">
            상태
          </label>
          <Select
            id="wp-status"
            value={wp.status}
            disabled={patch.isPending}
            onChange={(e) => send({ status: e.target.value as WpStatus })}
          >
            {WP_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="wp-priority" className="text-xs font-medium text-of-muted">
            우선순위
          </label>
          <Select
            id="wp-priority"
            value={wp.priority}
            disabled={patch.isPending}
            onChange={(e) => send({ priority: e.target.value as WpPriority })}
          >
            {WP_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="wp-start" className="text-xs font-medium text-of-muted">
            시작일
          </label>
          {/* date-only string round-trip — never through JS Date (§6.1) */}
          <Input
            id="wp-start"
            type="date"
            value={startDate}
            disabled={patch.isPending}
            onChange={(e) => setStartDate(e.target.value)}
            onBlur={() => {
              const v = startDate || null
              if (v !== wp.start_date) send({ start_date: v })
            }}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="wp-due" className="text-xs font-medium text-of-muted">
            기한
          </label>
          <Input
            id="wp-due"
            type="date"
            value={dueDate}
            disabled={patch.isPending}
            onChange={(e) => setDueDate(e.target.value)}
            onBlur={() => {
              const v = dueDate || null
              if (v !== wp.due_date) send({ due_date: v })
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="wp-estimate" className="text-xs font-medium text-of-muted">
            예상 시간(h)
          </label>
          <Input
            id="wp-estimate"
            type="number"
            step="0.5"
            min="0"
            value={estimate}
            disabled={patch.isPending}
            onChange={(e) => setEstimate(e.target.value)}
            onBlur={() => {
              const v = estimate.trim() === '' ? null : Number(estimate)
              if (v !== (wp.estimated_hours ?? null)) send({ estimated_hours: v })
            }}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="wp-milestone" className="text-xs font-medium text-of-muted">
            마일스톤
          </label>
          <Select
            id="wp-milestone"
            value={wp.milestone_id ?? ''}
            disabled={patch.isPending}
            onChange={(e) => send({ milestone_id: e.target.value || null })}
          >
            <option value="">없음</option>
            {milestones.data?.items.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="text-xs font-medium text-of-muted">설명</span>
        <Suspense
          fallback={<div className="h-24 rounded-of border border-of-border bg-of-surface-2/40" />}
        >
          <RichTextEditor
            value={wp.description ?? ''}
            ariaLabel="설명"
            onSave={(html) => {
              const next = html === '' ? null : html
              if (next !== (wp.description ?? null)) send({ description: next })
            }}
          />
        </Suspense>
      </div>

      <div className="flex items-center gap-2 border-t border-of-border pt-3 text-xs text-of-muted">
        <StatusChip status={wp.status} label={statusLabel(wp.status)} />
        <PriorityChip priority={wp.priority} />
        <span className="ml-auto">v{wp.version}</span>
      </div>

      <AiSummarySection wpId={wp.id} />

      <TimeTrackingSection wp={wp} />

      <CostSection wpId={wp.id} />

      <RelationsSection wpId={wp.id} projectId={projectId} />

      {patch.isPending ? <p className="text-xs text-of-muted">저장 중…</p> : null}

      <HistorySection wpId={wp.id} projectId={projectId} />
    </div>
  )
}
