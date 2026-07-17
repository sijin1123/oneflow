import * as Dialog from '@radix-ui/react-dialog'
import {
  AlertTriangle,
  CalendarRange,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { formatDateTime } from '@/lib/datetime'

import {
  type ScheduleVarianceState,
  useCaptureProjectScheduleBaseline,
  useDeleteProjectScheduleBaseline,
  useProjectScheduleBaseline,
} from './scheduleBaselineApi'

const STATE_LABELS: Record<ScheduleVarianceState, string> = {
  unchanged: '변경 없음',
  later: '지연',
  earlier: '앞당김',
  unscheduled: '일정 제거',
  rescheduled: '재일정',
  added: '신규',
  removed: '삭제됨',
}

const STATE_VARIANTS: Record<
  ScheduleVarianceState,
  'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger'
> = {
  unchanged: 'success',
  later: 'danger',
  earlier: 'info',
  unscheduled: 'warning',
  rescheduled: 'accent',
  added: 'accent',
  removed: 'neutral',
}

function dateRange(start: string | null, due: string | null) {
  if (!start && !due) return '일정 없음'
  return `${start ?? '미정'} → ${due ?? '미정'}`
}

function mutationMessage(error: unknown, fallback: string) {
  if (!error) return ''
  if (error instanceof ApiError && error.status === 409) {
    return '다른 변경이 먼저 저장되었습니다. 최신 기준선을 불러온 뒤 다시 시도해 주세요.'
  }
  return error instanceof ApiError ? error.message : fallback
}

function BaselineSkeleton() {
  return (
    <section aria-label="프로젝트 일정 기준선" className="min-w-0">
      <div className="mb-2 h-5 w-32 animate-pulse rounded bg-of-surface-hover" />
      <div
        role="status"
        aria-label="일정 기준선 불러오는 중"
        className="grid grid-cols-2 border-y border-of-border py-3 sm:grid-cols-4"
      >
        {[0, 1, 2, 3].map((item) => (
          <span key={item} className="mx-3 h-10 animate-pulse rounded-of bg-of-surface-hover" />
        ))}
      </div>
    </section>
  )
}

function DeleteBaselineDialog({
  open,
  busy,
  error,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  busy: boolean
  error: string
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/45 of-overlay-enter" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[81] w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-of border border-of-border bg-of-surface p-4 shadow-[var(--of-shadow-popover)] of-overlay-enter focus:outline-none">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Dialog.Title className="text-sm font-semibold">일정 기준선 삭제</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-5 text-of-muted">
                저장된 기준 일정과 변동 비교가 삭제됩니다. 현재 작업 일정은 바뀌지 않습니다.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="삭제 확인 창 닫기"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
              >
                <X size={15} />
              </button>
            </Dialog.Close>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button type="button" size="sm" variant="outline" disabled={busy}>취소</Button>
            </Dialog.Close>
            <Button type="button" size="sm" variant="danger" disabled={busy} onClick={onConfirm}>
              <Trash2 size={14} /> {busy ? '삭제 중...' : '기준선 삭제'}
            </Button>
          </div>
          {error ? <p role="alert" className="mt-3 text-xs text-of-danger">{error}</p> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function ProjectScheduleBaselinePanel({
  projectId,
  canManage,
}: {
  projectId: string
  canManage: boolean
}) {
  const baseline = useProjectScheduleBaseline(projectId)
  const capture = useCaptureProjectScheduleBaseline(projectId)
  const remove = useDeleteProjectScheduleBaseline(projectId)
  const [deleteOpen, setDeleteOpen] = useState(false)

  if (baseline.isPending) return <BaselineSkeleton />

  if (baseline.isError) {
    return (
      <section aria-label="프로젝트 일정 기준선" className="min-w-0">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <CalendarRange size={14} /> 일정 기준선
        </h3>
        <div role="alert" className="flex min-h-24 flex-col items-center justify-center gap-2 border-y border-of-border px-4 py-5 text-center">
          <p className="text-xs text-of-danger">일정 기준선을 불러오지 못했습니다.</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void baseline.refetch()}>
            <RotateCcw size={13} /> 재시도
          </Button>
        </div>
      </section>
    )
  }

  const summary = baseline.data
  const errorMessage = mutationMessage(
    capture.error ?? remove.error,
    '일정 기준선을 저장하지 못했습니다.',
  )
  const deleteErrorMessage = mutationMessage(
    remove.error,
    '일정 기준선을 삭제하지 못했습니다.',
  )
  const busy = capture.isPending || remove.isPending

  if (!summary.baseline) {
    return (
      <section aria-label="프로젝트 일정 기준선" className="min-w-0">
        <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
          <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
            <CalendarRange size={14} className="shrink-0" /> 일정 기준선
          </h3>
          <span className="shrink-0 text-[11px] tabular-nums text-of-muted">
            현재 {summary.current_total}개 작업
          </span>
        </div>
        <div className="flex min-h-28 flex-col items-center justify-center gap-2 border-y border-of-border px-4 py-5 text-center">
          <Save size={20} className="text-of-muted" aria-hidden="true" />
          <p className="text-xs font-medium">아직 저장된 기준 일정이 없습니다.</p>
          <p className="max-w-md text-[11px] leading-5 text-of-muted">
            현재 시작일과 마감일을 저장하면 이후 일정 변동을 작업별로 비교할 수 있습니다.
          </p>
          {canManage ? (
            <Button type="button" size="sm" disabled={busy} onClick={() => capture.mutate(null)}>
              <Save size={13} /> {capture.isPending ? '저장 중...' : '현재 일정 저장'}
            </Button>
          ) : (
            <p className="text-[11px] text-of-muted">프로젝트 소유자가 기준 일정을 저장할 수 있습니다.</p>
          )}
          {errorMessage ? <p role="alert" className="text-xs text-of-danger">{errorMessage}</p> : null}
        </div>
      </section>
    )
  }

  const version = summary.baseline.version
  const confirmDelete = () => {
    remove.mutate(version, { onSuccess: () => setDeleteOpen(false) })
  }

  return (
    <section aria-label="프로젝트 일정 기준선" className="min-w-0">
      <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
            <CalendarRange size={14} className="shrink-0" /> 일정 기준선
          </h3>
          <p className="mt-1 text-[11px] text-of-muted">
            {formatDateTime(summary.baseline.captured_at)} 저장 · 버전 {version + 1}
          </p>
        </div>
        {canManage ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => capture.mutate(version)}
            >
              <RefreshCw size={13} /> {capture.isPending ? '갱신 중...' : '현재 일정으로 갱신'}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="subtleDanger"
              aria-label="일정 기준선 삭제"
              disabled={busy}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 border-y border-of-border sm:grid-cols-4">
        {[
          ['기준 작업', summary.total_snapshot],
          ['현재 작업', summary.current_total],
          ['지연', summary.later],
          ['전체 변동', summary.changed_total],
        ].map(([label, value]) => (
          <div key={label} className="border-b border-of-border-subtle px-3 py-2.5 even:border-l sm:border-b-0 sm:border-l sm:first:border-l-0">
            <dt className="text-[10px] font-medium text-of-muted">{label}</dt>
            <dd className="mt-0.5 text-base font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {errorMessage ? (
        <div role="alert" className="mt-3 flex items-start gap-2 border-l-2 border-of-danger px-3 text-xs leading-5 text-of-danger">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {errorMessage}
        </div>
      ) : null}

      {summary.changed_total === 0 ? (
        <p role="status" className="py-8 text-center text-xs text-of-muted">
          기준선 이후 일정 변경이 없습니다.
        </p>
      ) : (
        <div className="mt-3 min-w-0 overflow-x-auto border-y border-of-border">
          <table className="w-full min-w-[40rem] table-fixed text-left text-xs">
            <thead className="bg-of-surface-raised text-[10px] font-medium text-of-muted">
              <tr>
                <th className="w-[32%] px-2 py-2">작업</th>
                <th className="w-[14%] px-2 py-2">변동</th>
                <th className="w-[27%] px-2 py-2">기준 일정</th>
                <th className="w-[27%] px-2 py-2">현재 일정</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-of-border-subtle">
              {summary.items.map((item) => (
                <tr key={item.work_package_id} className="hover:bg-of-surface-hover">
                  <td className="px-2 py-2.5">
                    {item.state === 'removed' ? (
                      <span className="block truncate font-medium text-of-muted">{item.subject}</span>
                    ) : (
                      <Link
                        to={`/projects/${projectId}/work-packages?wp=${item.work_package_id}`}
                        className="block truncate font-medium hover:text-of-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                      >
                        {item.subject}
                      </Link>
                    )}
                  </td>
                  <td className="px-2 py-2.5">
                    <Badge variant={STATE_VARIANTS[item.state]}>
                      {STATE_LABELS[item.state]}
                      {item.variance_days !== null && item.variance_days !== 0
                        ? ` ${item.variance_days > 0 ? '+' : ''}${item.variance_days}일`
                        : ''}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-[10px] tabular-nums text-of-muted">
                    {dateRange(item.baseline_start_date, item.baseline_due_date)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-[10px] tabular-nums">
                    {dateRange(item.current_start_date, item.current_due_date)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {summary.items_truncated ? (
        <p className="mt-2 text-right text-[11px] text-of-muted">변동이 많은 프로젝트는 우선 50개를 표시합니다.</p>
      ) : null}

      <DeleteBaselineDialog
        open={deleteOpen}
        busy={remove.isPending}
        error={deleteErrorMessage}
        onOpenChange={(open) => {
          if (!open) remove.reset()
          setDeleteOpen(open)
        }}
        onConfirm={confirmDelete}
      />
    </section>
  )
}
