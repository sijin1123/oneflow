import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'

import { HistorySection } from './HistorySection'
import { RelationsSection } from './RelationsSection'
import { TimeTrackingSection } from './TimeTrackingSection'
import { PriorityChip, StatusChip } from './chips'
import { usePatchWorkPackage, useWorkPackage } from './api'
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
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

  // All editable fields are controlled and resynced from server data, so a 409
  // invalidate+refetch really does reload every field (review finding #2).
  const [subject, setSubject] = useState(wp.subject)
  const [description, setDescription] = useState(wp.description ?? '')
  const [startDate, setStartDate] = useState(wp.start_date ?? '')
  const [dueDate, setDueDate] = useState(wp.due_date ?? '')
  const [estimate, setEstimate] = useState(wp.estimated_hours?.toString() ?? '')
  useEffect(() => {
    setSubject(wp.subject)
    setDescription(wp.description ?? '')
    setStartDate(wp.start_date ?? '')
    setDueDate(wp.due_date ?? '')
    setEstimate(wp.estimated_hours?.toString() ?? '')
  }, [wp.subject, wp.description, wp.start_date, wp.due_date, wp.estimated_hours])

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

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="wp-subject" className="text-xs font-medium text-of-muted">
          제목
        </label>
        <Input
          id="wp-subject"
          value={subject}
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
                {STATUS_LABELS[s]}
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
            onChange={(e) => setDueDate(e.target.value)}
            onBlur={() => {
              const v = dueDate || null
              if (v !== wp.due_date) send({ due_date: v })
            }}
          />
        </div>
      </div>

      <div className="w-1/2 space-y-1.5 pr-1.5">
        <label htmlFor="wp-estimate" className="text-xs font-medium text-of-muted">
          예상 시간(h)
        </label>
        <Input
          id="wp-estimate"
          type="number"
          step="0.5"
          min="0"
          value={estimate}
          onChange={(e) => setEstimate(e.target.value)}
          onBlur={() => {
            const v = estimate.trim() === '' ? null : Number(estimate)
            if (v !== (wp.estimated_hours ?? null)) send({ estimated_hours: v })
          }}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="wp-desc" className="text-xs font-medium text-of-muted">
          설명
        </label>
        <Textarea
          id="wp-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => {
            const next = description.trim() === '' ? null : description
            if (next !== wp.description) send({ description: next })
          }}
          placeholder="설명을 입력하세요 (리치 텍스트는 후속 단계에서 지원)"
        />
      </div>

      <div className="flex items-center gap-2 border-t border-of-border pt-3 text-xs text-of-muted">
        <StatusChip status={wp.status} />
        <PriorityChip priority={wp.priority} />
        <span className="ml-auto">v{wp.version}</span>
      </div>

      <TimeTrackingSection wp={wp} />

      <RelationsSection wpId={wp.id} projectId={projectId} />

      {patch.isPending ? <p className="text-xs text-of-muted">저장 중…</p> : null}

      <HistorySection wpId={wp.id} />
    </div>
  )
}
