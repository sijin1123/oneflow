import * as Dialog from '@radix-ui/react-dialog'
import {
  AlertTriangle,
  CalendarRange,
  History,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { formatDateTime } from '@/lib/datetime'

import {
  type ScheduleVarianceState,
  useCreateProjectScheduleBaseline,
  useDeleteProjectScheduleBaseline,
  useProjectScheduleBaseline,
  useProjectScheduleBaselines,
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
    if (error.message.includes('name already exists')) {
      return '같은 이름의 기준선이 이미 있습니다. 다른 이름을 입력해 주세요.'
    }
    if (error.message.includes('at most')) {
      return '저장 가능한 기준선 수에 도달했습니다. 기존 기준선을 삭제한 뒤 다시 시도해 주세요.'
    }
    return '다른 변경이 먼저 저장되었습니다. 최신 이력을 불러온 뒤 다시 시도해 주세요.'
  }
  return error instanceof ApiError ? error.message : fallback
}

function BaselineSkeleton() {
  return (
    <section aria-label="프로젝트 일정 기준선" className="min-w-0">
      <div className="mb-2 h-5 w-36 animate-pulse rounded bg-of-surface-hover" />
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

function DialogCloseButton({ label }: { label: string }) {
  return (
    <Dialog.Close asChild>
      <button
        type="button"
        aria-label={label}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
      >
        <X size={15} />
      </button>
    </Dialog.Close>
  )
}

function CreateBaselineDialog({
  open,
  busy,
  defaultName,
  error,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  busy: boolean
  defaultName: string
  error: string
  onOpenChange: (open: boolean) => void
  onConfirm: (name: string) => void
}) {
  const [name, setName] = useState(defaultName)

  useEffect(() => {
    if (open) setName(defaultName)
  }, [defaultName, open])

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/45 of-overlay-enter" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[81] w-[min(27rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-of border border-of-border bg-of-surface p-4 shadow-[var(--of-shadow-popover)] of-overlay-enter focus:outline-none">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              const normalized = name.trim().replace(/\s+/g, ' ')
              if (normalized) onConfirm(normalized)
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Dialog.Title className="text-sm font-semibold">새 일정 기준선</Dialog.Title>
                <Dialog.Description className="mt-1 text-xs leading-5 text-of-muted">
                  현재 작업의 시작일과 마감일을 새 이력으로 저장합니다.
                </Dialog.Description>
              </div>
              <DialogCloseButton label="기준선 저장 창 닫기" />
            </div>
            <label className="mt-4 block text-xs font-medium" htmlFor="schedule-baseline-name">
              기준선 이름
            </label>
            <input
              id="schedule-baseline-name"
              value={name}
              maxLength={80}
              autoFocus
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 h-9 w-full rounded-of border border-of-border bg-of-surface px-3 text-sm outline-none placeholder:text-of-muted focus:border-of-focus focus:ring-1 focus:ring-of-focus disabled:opacity-60"
              placeholder="예: 1차 릴리스 승인"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" size="sm" variant="outline" disabled={busy}>취소</Button>
              </Dialog.Close>
              <Button type="submit" size="sm" disabled={busy || !name.trim()}>
                <Save size={14} /> {busy ? '저장 중...' : '현재 일정 저장'}
              </Button>
            </div>
            {error ? <p role="alert" className="mt-3 text-xs text-of-danger">{error}</p> : null}
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function DeleteBaselineDialog({
  open,
  busy,
  name,
  error,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  busy: boolean
  name: string
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
                <strong className="font-medium text-of-text">{name}</strong> 이력과 변동 비교가 삭제됩니다.
                현재 작업 일정과 다른 기준선은 바뀌지 않습니다.
              </Dialog.Description>
            </div>
            <DialogCloseButton label="삭제 확인 창 닫기" />
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
  const history = useProjectScheduleBaselines(projectId)
  const [selectedId, setSelectedId] = useState('')
  const selected = useProjectScheduleBaseline(projectId, selectedId)
  const create = useCreateProjectScheduleBaseline(projectId)
  const remove = useDeleteProjectScheduleBaseline(projectId)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  useEffect(() => {
    const items = history.data?.items ?? []
    if (!items.some((item) => item.id === selectedId)) {
      setSelectedId(items[0]?.id ?? '')
    }
  }, [history.data?.items, selectedId])

  if (history.isPending) return <BaselineSkeleton />

  if (history.isError) {
    return (
      <section aria-label="프로젝트 일정 기준선" className="min-w-0">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <CalendarRange size={14} /> 일정 기준선
        </h3>
        <div role="alert" className="flex min-h-24 flex-col items-center justify-center gap-2 border-y border-of-border px-4 py-5 text-center">
          <p className="text-xs text-of-danger">일정 기준선 이력을 불러오지 못했습니다.</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void history.refetch()}>
            <RotateCcw size={13} /> 재시도
          </Button>
        </div>
      </section>
    )
  }

  const entries = history.data.items
  const selectedEntry = entries.find((entry) => entry.id === selectedId) ?? entries[0]
  const atLimit = history.data.total >= history.data.limit
  const createError = mutationMessage(create.error, '일정 기준선을 저장하지 못했습니다.')
  const deleteError = mutationMessage(remove.error, '일정 기준선을 삭제하지 못했습니다.')
  const defaultName = `기준선 ${history.data.total + 1}`

  const createDialog = (
    <CreateBaselineDialog
      open={createOpen}
      busy={create.isPending}
      defaultName={defaultName}
      error={createError}
      onOpenChange={(open) => {
        if (!open) create.reset()
        setCreateOpen(open)
      }}
      onConfirm={(name) => {
        create.mutate(name, {
          onSuccess: (summary) => {
            setSelectedId(summary.baseline?.id ?? '')
            setCreateOpen(false)
          },
        })
      }}
    />
  )

  if (entries.length === 0) {
    return (
      <section aria-label="프로젝트 일정 기준선" className="min-w-0">
        <div className="mb-2 flex min-w-0 items-center justify-between gap-3">
          <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
            <CalendarRange size={14} className="shrink-0" /> 일정 기준선
          </h3>
          <span className="shrink-0 text-[11px] tabular-nums text-of-muted">
            현재 {history.data.current_total}개 작업
          </span>
        </div>
        <div className="flex min-h-32 flex-col items-center justify-center gap-2 border-y border-of-border px-4 py-6 text-center">
          <History size={21} className="text-of-muted" aria-hidden="true" />
          <p className="text-xs font-medium">아직 저장된 기준 일정이 없습니다.</p>
          <p className="max-w-md text-[11px] leading-5 text-of-muted">
            현재 일정을 이름 있는 기준선으로 저장하면 이후 변동을 계속 비교할 수 있습니다.
          </p>
          {canManage ? (
            <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
              <Save size={13} /> 첫 기준선 저장
            </Button>
          ) : (
            <p className="text-[11px] text-of-muted">프로젝트 소유자가 기준 일정을 저장할 수 있습니다.</p>
          )}
        </div>
        {createDialog}
      </section>
    )
  }

  return (
    <section aria-label="프로젝트 일정 기준선" className="min-w-0">
      <div className="mb-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
            <CalendarRange size={14} className="shrink-0" /> 일정 기준선
            <Badge variant="neutral">{history.data.total}/{history.data.limit}</Badge>
          </h3>
          <p className="mt-1 text-[11px] text-of-muted">저장된 일정과 현재 작업 일정을 비교합니다.</p>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <label className="sr-only" htmlFor="schedule-baseline-selector">비교할 기준선</label>
          <select
            id="schedule-baseline-selector"
            value={selectedEntry?.id ?? ''}
            onChange={(event) => setSelectedId(event.target.value)}
            className="h-8 min-w-0 flex-1 rounded-of border border-of-border bg-of-surface px-2 text-xs outline-none focus:border-of-focus focus:ring-1 focus:ring-of-focus sm:w-44 sm:flex-none"
          >
            {entries.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.name}</option>
            ))}
          </select>
          {canManage ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={atLimit}
              title={atLimit ? `기준선은 최대 ${history.data.limit}개까지 저장할 수 있습니다.` : undefined}
              onClick={() => setCreateOpen(true)}
            >
              <Plus size={13} /> 새 기준선
            </Button>
          ) : null}
        </div>
      </div>

      {selected.isError ? (
        <div role="alert" className="flex min-h-28 flex-col items-center justify-center gap-2 border-y border-of-border px-4 text-center">
          <p className="text-xs text-of-danger">선택한 기준선을 불러오지 못했습니다.</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void selected.refetch()}>
            <RotateCcw size={13} /> 다시 불러오기
          </Button>
        </div>
      ) : selected.isPending || !selected.data ? (
        <div role="status" className="flex min-h-28 items-center justify-center border-y border-of-border text-xs text-of-muted">
          선택한 기준선을 불러오는 중...
        </div>
      ) : (
        <>
          <div className="flex min-w-0 items-center justify-between gap-3 border-t border-of-border px-1 py-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{selected.data.baseline?.name}</p>
              <p className="mt-0.5 text-[10px] text-of-muted">
                {selected.data.baseline ? formatDateTime(selected.data.baseline.captured_at) : ''}
                {' · '}{selected.data.total_snapshot}개 작업 저장
              </p>
            </div>
            {canManage && selected.data.baseline ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="선택한 일정 기준선 삭제"
                disabled={remove.isPending}
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 size={14} />
              </Button>
            ) : null}
          </div>

          <dl className="grid grid-cols-2 border-y border-of-border sm:grid-cols-4">
            {[
              ['기준 작업', selected.data.total_snapshot],
              ['현재 작업', selected.data.current_total],
              ['지연', selected.data.later],
              ['전체 변동', selected.data.changed_total],
            ].map(([label, value]) => (
              <div key={label} className="border-b border-of-border-subtle px-3 py-2.5 even:border-l sm:border-b-0 sm:border-l sm:first:border-l-0">
                <dt className="text-[10px] font-medium text-of-muted">{label}</dt>
                <dd className="mt-0.5 text-base font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          {selected.data.changed_total === 0 ? (
            <p role="status" className="py-8 text-center text-xs text-of-muted">
              이 기준선 이후 일정 변경이 없습니다.
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
                  {selected.data.items.map((item) => (
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
          {selected.data.items_truncated ? (
            <p className="mt-2 text-right text-[11px] text-of-muted">변동이 많은 프로젝트는 우선 50개를 표시합니다.</p>
          ) : null}
        </>
      )}

      {atLimit ? (
        <p className="mt-2 flex items-start gap-2 text-[11px] leading-5 text-of-muted">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          기준선 {history.data.limit}개를 모두 사용했습니다. 새 기준선을 저장하려면 기존 이력을 삭제하세요.
        </p>
      ) : null}

      {createDialog}
      <DeleteBaselineDialog
        open={deleteOpen}
        busy={remove.isPending}
        name={selected.data?.baseline?.name ?? selectedEntry?.name ?? ''}
        error={deleteError}
        onOpenChange={(open) => {
          if (!open) remove.reset()
          setDeleteOpen(open)
        }}
        onConfirm={() => {
          const baseline = selected.data?.baseline
          if (!baseline) return
          remove.mutate(
            { baselineId: baseline.id, expectedVersion: baseline.version },
            {
              onSuccess: () => {
                setSelectedId('')
                setDeleteOpen(false)
              },
            },
          )
        }}
      />
    </section>
  )
}
