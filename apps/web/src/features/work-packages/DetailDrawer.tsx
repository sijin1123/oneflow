import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'

import { PriorityChip, StatusChip } from './chips'
import { usePatchWorkPackage, useRelations, useWorkPackage } from './api'
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
  const relations = useRelations(wp.id)

  const [subject, setSubject] = useState(wp.subject)
  const [description, setDescription] = useState(wp.description ?? '')
  useEffect(() => {
    setSubject(wp.subject)
    setDescription(wp.description ?? '')
  }, [wp.subject, wp.description])

  const send = (fields: Partial<Record<string, unknown>>) => {
    patch.mutate({ wpId: wp.id, patch: { expected_version: wp.version, ...fields } })
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
            defaultValue={wp.start_date ?? ''}
            onBlur={(e) => {
              const v = e.target.value || null
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
            defaultValue={wp.due_date ?? ''}
            onBlur={(e) => {
              const v = e.target.value || null
              if (v !== wp.due_date) send({ due_date: v })
            }}
          />
        </div>
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

      <section aria-label="관계" className="space-y-2">
        <h3 className="text-xs font-semibold text-of-muted">관계</h3>
        {relations.isPending ? (
          <p className="text-xs text-of-muted">불러오는 중…</p>
        ) : relations.isError ? (
          <p className="text-xs text-of-danger">관계를 불러오지 못했습니다.</p>
        ) : relations.data.total === 0 ? (
          <p className="text-xs text-of-muted">연결된 관계가 없습니다.</p>
        ) : (
          <ul className="space-y-1">
            {relations.data.items.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-2 rounded-of border border-of-border px-2 py-1.5 text-xs"
              >
                <span className="font-medium">{r.relation_type}</span>
                <span className="text-of-muted">
                  {r.direction === 'outgoing' ? '→ 대상' : '← 출발'}:{' '}
                  {r.direction === 'outgoing' ? r.target_id : r.source_id}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {patch.isPending ? <p className="text-xs text-of-muted">저장 중…</p> : null}
      <div className="pt-1">
        <Button variant="outline" size="sm" onClick={() => relations.refetch()}>
          관계 새로고침
        </Button>
      </div>
    </div>
  )
}
