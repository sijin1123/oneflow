import {
  CalendarCheck2,
  CalendarDays,
  CalendarPlus,
  History,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Workflow,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { FrameContextActions } from '@/components/shell/FrameContextActions'
import { EmptyState, ErrorState } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  type WorkspaceCalendar,
  useUpdateWorkspaceCalendar,
  useWorkspaceCalendar,
} from '@/features/workspace-profile/api'
import { ApiError } from '@/lib/api'
import { formatDateTime } from '@/lib/datetime'
import { useUnsavedLocationPrompt } from '@/lib/guards'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const

const actionClassName =
  'of-touch-target inline-flex h-7 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-of border border-of-border bg-of-surface px-2 text-xs font-medium text-of-text transition-colors hover:border-of-border-strong hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus'

type CalendarDraft = {
  workingWeekdays: number[]
  holidays: string[]
}

function ScheduleFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 bg-of-surface px-3 py-3">
      <dt className="text-[10px] font-medium uppercase text-of-muted">{label}</dt>
      <dd className="mt-1 truncate text-xs font-semibold">{value}</dd>
    </div>
  )
}

function CalendarSkeleton() {
  return (
    <div role="status" aria-label="근무 일정 불러오는 중" className="space-y-5 py-5">
      <span className="sr-only">근무 일정을 불러오는 중입니다.</span>
      <div className="grid grid-cols-2 gap-px border-y border-of-border-subtle bg-of-border-subtle sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="bg-of-surface px-3 py-3">
            <Skeleton className="h-2.5 w-14" />
            <Skeleton className="mt-2 h-4 w-20" />
          </div>
        ))}
      </div>
      <Skeleton className="h-32 w-full rounded-none" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(16rem,0.7fr)]">
        <Skeleton className="h-72 w-full rounded-none" />
        <Skeleton className="h-72 w-full rounded-none" />
      </div>
    </div>
  )
}

function draftFromCalendar(calendar: WorkspaceCalendar): CalendarDraft {
  return {
    workingWeekdays: [...calendar.working_weekdays],
    holidays: [...calendar.holidays].sort(),
  }
}

export function WorkspaceCalendarSettingsPage() {
  const calendar = useWorkspaceCalendar()
  const update = useUpdateWorkspaceCalendar()
  const lastSuccessfulCalendar = useRef(calendar.data)
  const [workingWeekdays, setWorkingWeekdays] = useState<number[]>([])
  const [holidays, setHolidays] = useState<string[]>([])
  const [holidayInput, setHolidayInput] = useState('')
  const [dirty, setDirty] = useState(false)
  const [failedDraft, setFailedDraft] = useState<CalendarDraft | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  if (calendar.data) lastSuccessfulCalendar.current = calendar.data
  const data = calendar.data ?? lastSuccessfulCalendar.current
  const sortedHolidays = useMemo(() => [...holidays].sort(), [holidays])
  const stale = update.error instanceof ApiError && update.error.status === 412
  const calendarStale = Boolean(data && calendar.isError)
  const calendarFresh = Boolean(data && !calendar.isFetching && !calendarStale)
  const busy = update.isPending
  const refreshing = calendar.isFetching

  useUnsavedLocationPrompt(
    dirty,
    '저장하지 않은 근무 일정 변경을 버리고 이동할까요?',
  )

  useEffect(() => {
    if (!calendar.data || dirty) return
    const next = draftFromCalendar(calendar.data)
    setWorkingWeekdays(next.workingWeekdays)
    setHolidays(next.holidays)
  }, [calendar.data, dirty])

  const clearFeedback = () => {
    update.reset()
    setFailedDraft(null)
    setSuccessMessage(null)
  }

  const save = (draft: CalendarDraft = { workingWeekdays, holidays: sortedHolidays }) => {
    if (!data || !calendarFresh || draft.workingWeekdays.length === 0) return
    clearFeedback()
    update.mutate(
      {
        workingWeekdays: draft.workingWeekdays,
        holidays: draft.holidays,
        revision: data.revision,
      },
      {
        onSuccess: () => {
          setDirty(false)
          setHolidayInput('')
          setSuccessMessage('근무 일정을 저장했습니다. 이후 프로젝트 단계 일정 변경부터 적용됩니다.')
        },
        onError: () =>
          setFailedDraft({
            workingWeekdays: [...draft.workingWeekdays],
            holidays: [...draft.holidays],
          }),
      },
    )
  }

  const reset = () => {
    if (!data) return
    const next = draftFromCalendar(data)
    setWorkingWeekdays(next.workingWeekdays)
    setHolidays(next.holidays)
    setHolidayInput('')
    setDirty(false)
    clearFeedback()
  }

  const refresh = async () => {
    setSuccessMessage(null)
    const result = await calendar.refetch()
    if (!result.error && dirty) {
      setSuccessMessage('최신 revision을 확인했습니다. 편집 중인 일정은 유지됩니다.')
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-col bg-of-surface">
      <FrameContextActions>
        <Link
          to="/admin/project-configuration?tab=phases"
          className={actionClassName}
        >
          <Workflow size={13} aria-hidden="true" />
          프로젝트 단계
        </Link>
        <Link to="/admin/overview" className={actionClassName}>
          <Settings2 size={13} aria-hidden="true" />
          관리 개요
        </Link>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || refreshing}
          onClick={() => void refresh()}
        >
          <RefreshCw
            size={13}
            className={calendar.isFetching ? 'animate-spin' : undefined}
            aria-hidden="true"
          />
          새로고침
        </Button>
      </FrameContextActions>

      <div
        data-testid="workspace-calendar-settings-scroll"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        aria-busy={busy || refreshing}
      >
        <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-6">
          <header className="grid gap-4 border-b border-of-border pb-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase text-of-muted">
                Workspace administration
              </p>
              <h1 className="mt-1 text-xl font-semibold">근무 일정</h1>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">
                프로젝트 단계 자동 일정에 사용할 근무 요일과 휴일을 관리합니다.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {dirty ? <Badge variant="neutral">저장하지 않은 변경</Badge> : null}
              {data ? <Badge variant="outline">revision {data.revision}</Badge> : null}
            </div>
          </header>

          {!data && calendar.isPending ? <CalendarSkeleton /> : null}

          {!data && calendar.isError ? (
            <div className="py-5">
              {calendar.error instanceof ApiError && calendar.error.status === 403 ? (
                <EmptyState
                  title="접근 권한이 없습니다"
                  hint="워크스페이스 근무 일정은 관리자만 변경할 수 있습니다."
                />
              ) : (
                <ErrorState error={calendar.error} onRetry={() => void calendar.refetch()} />
              )}
            </div>
          ) : null}

          {data ? (
            <div className="space-y-5 py-5">
              <dl
                aria-label="근무 일정 요약"
                className="grid grid-cols-2 gap-px border-y border-of-border-subtle bg-of-border-subtle sm:grid-cols-4"
              >
                <ScheduleFact
                  label="근무 요일"
                  value={`${workingWeekdays.length}일`}
                />
                <ScheduleFact label="등록 휴일" value={`${holidays.length}일`} />
                <ScheduleFact label="자동 일정" value="다음 변경부터" />
                <ScheduleFact
                  label="편집 상태"
                  value={dirty ? '저장 필요' : '서버와 동기화'}
                />
              </dl>

              <section aria-labelledby="working-weekdays-title">
                <div className="border-b border-of-border-subtle pb-3">
                  <h2
                    id="working-weekdays-title"
                    className="flex items-center gap-2 text-sm font-semibold"
                  >
                    <CalendarDays size={15} className="text-of-muted" aria-hidden="true" />
                    근무 요일
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-of-muted">
                    한 개 이상의 요일을 선택해야 하며, 선택한 순서는 월요일부터 정렬됩니다.
                  </p>
                </div>
                <div
                  className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7"
                  role="group"
                  aria-label="근무 요일 선택"
                >
                  {WEEKDAYS.map((label, weekday) => {
                    const checked = workingWeekdays.includes(weekday)
                    return (
                      <label
                        key={label}
                        className={cn(
                          'flex min-h-9 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-of border px-2 text-xs font-medium transition-colors focus-within:ring-2 focus-within:ring-of-focus',
                          checked
                            ? 'border-of-accent bg-of-surface-selected text-of-accent'
                            : 'border-of-border bg-of-surface text-of-muted hover:bg-of-surface-hover',
                          (busy || refreshing) && 'cursor-not-allowed opacity-60',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={busy || refreshing}
                          onChange={() => {
                            const next = checked
                              ? workingWeekdays.filter((value) => value !== weekday)
                              : [...workingWeekdays, weekday].sort()
                            setWorkingWeekdays(next)
                            setDirty(true)
                            clearFeedback()
                          }}
                        />
                        {label}
                      </label>
                    )
                  })}
                </div>
                {workingWeekdays.length === 0 ? (
                  <p className="mt-2 text-xs text-of-danger" role="alert">
                    근무 요일을 한 개 이상 선택하세요.
                  </p>
                ) : null}
              </section>

              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(16rem,0.7fr)]">
                <section aria-labelledby="holidays-title">
                  <div className="border-b border-of-border-subtle pb-3">
                    <h2 id="holidays-title" className="text-sm font-semibold">
                      휴일
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-of-muted">
                      선택한 근무 요일이어도 등록된 날짜는 자동 일정에서 제외됩니다.
                    </p>
                  </div>
                  <div className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row">
                    <Input
                      type="date"
                      aria-label="휴일 날짜"
                      value={holidayInput}
                      disabled={busy || refreshing}
                      onChange={(event) => setHolidayInput(event.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        busy ||
                        refreshing ||
                        !holidayInput ||
                        holidays.includes(holidayInput) ||
                        holidays.length >= 366
                      }
                      onClick={() => {
                        setHolidays((current) => [...current, holidayInput].sort())
                        setHolidayInput('')
                        setDirty(true)
                        clearFeedback()
                      }}
                    >
                      <CalendarPlus size={14} aria-hidden="true" />
                      휴일 추가
                    </Button>
                  </div>
                  {sortedHolidays.length ? (
                    <ul
                      className="mt-3 max-h-56 divide-y divide-of-border-subtle overflow-y-auto border-y border-of-border-subtle"
                      aria-label="등록된 휴일"
                    >
                      {sortedHolidays.map((holiday) => (
                        <li
                          key={holiday}
                          className="flex min-w-0 items-center justify-between gap-3 py-2 text-xs"
                        >
                          <time dateTime={holiday} className="truncate font-medium">
                            {holiday}
                          </time>
                          <button
                            type="button"
                            className="of-icon-button"
                            aria-label={`${holiday} 휴일 제거`}
                            title="휴일 제거"
                            disabled={busy || refreshing}
                            onClick={() => {
                              setHolidays((current) =>
                                current.filter((value) => value !== holiday),
                              )
                              setDirty(true)
                              clearFeedback()
                            }}
                          >
                            <X size={14} aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 border-y border-of-border-subtle py-5 text-center text-xs text-of-muted">
                      등록된 휴일이 없습니다.
                    </p>
                  )}
                  <p className="mt-2 text-[11px] text-of-muted">
                    중복 날짜는 추가할 수 없으며 최대 366일까지 저장할 수 있습니다.
                  </p>
                </section>

                <section aria-labelledby="calendar-effect-title">
                  <div className="border-b border-of-border-subtle pb-3">
                    <h2 id="calendar-effect-title" className="text-sm font-semibold">
                      일정 적용
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-of-muted">
                      저장된 달력이 프로젝트 단계 계산에 사용되는 범위입니다.
                    </p>
                  </div>
                  <div className="space-y-3 border-b border-of-border-subtle py-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <CalendarCheck2
                        size={16}
                        className="mt-0.5 shrink-0 text-of-accent"
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-medium">현재 편집 요약</p>
                        <p className="mt-0.5 text-xs leading-5 text-of-muted">
                          {workingWeekdays.map((value) => WEEKDAYS[value]).join(' · ') ||
                            '근무 요일 없음'}{' '}
                          · 휴일 {holidays.length}일
                        </p>
                      </div>
                    </div>
                    <div className="flex min-w-0 items-start gap-3">
                      <Workflow
                        size={16}
                        className="mt-0.5 shrink-0 text-of-muted"
                        aria-hidden="true"
                      />
                      <p className="min-w-0 text-xs leading-5 text-of-muted">
                        저장 후 발생하는 단계 종료일·활성화 변경에서 후속 단계 시작일과
                        종료일을 근무일 기준으로 다시 계산합니다.
                      </p>
                    </div>
                    <p className="text-xs leading-5 text-of-muted">
                      일정 저장만으로 기존 프로젝트 날짜를 일괄 변경하지 않습니다.
                    </p>
                  </div>
                </section>
              </div>

              <section
                aria-labelledby="calendar-save-title"
                className="border-y border-of-border-subtle py-4"
              >
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h2 id="calendar-save-title" className="text-sm font-semibold">
                      변경 저장
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-of-muted">
                      저장 전에는 현재 편집이 다른 사용자와 프로젝트 일정에 영향을 주지
                      않습니다.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {dirty ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={reset}
                      >
                        <RotateCcw size={13} aria-hidden="true" />
                        되돌리기
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        !dirty ||
                        workingWeekdays.length === 0 ||
                        busy ||
                        !calendarFresh
                      }
                      onClick={() => save()}
                    >
                      {update.isPending ? (
                        <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />
                      ) : null}
                      일정 저장
                    </Button>
                  </div>
                </div>

                <div className="min-h-9 pt-3" aria-live="polite">
                  {successMessage ? (
                    <p role="status" className="text-xs leading-5 text-of-success">
                      {successMessage}
                    </p>
                  ) : null}
                  {update.isError ? (
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                      <p className="min-w-0 text-xs leading-5 text-of-danger" role="alert">
                        {stale
                          ? '다른 관리자가 일정을 변경했습니다. 최신 revision을 불러왔으며 현재 편집을 그대로 다시 저장할 수 있습니다.'
                          : update.error instanceof Error
                            ? update.error.message
                            : '근무 일정을 저장하지 못했습니다.'}
                      </p>
                      {failedDraft ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy || !calendarFresh}
                          onClick={() => save(failedDraft)}
                        >
                          일정 저장 다시 시도
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  {calendarStale ? (
                    <div
                      role="alert"
                      className="flex min-w-0 flex-col gap-2 border-y border-of-danger/15 bg-of-danger-soft px-3 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between"
                    >
                      <p className="min-w-0 break-words text-of-danger">
                        최신 일정을 불러오지 못했습니다. 마지막으로 확인한 일정과 현재
                        편집을 유지합니다. 복구 전까지 일정 저장은 사용할 수 없습니다.
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-full shrink-0 sm:w-auto"
                        disabled={calendar.isFetching}
                        onClick={() => void refresh()}
                      >
                        <RefreshCw size={13} aria-hidden="true" />
                        다시 시도
                      </Button>
                    </div>
                  ) : null}
                </div>
              </section>

              <section aria-labelledby="calendar-audit-title">
                <div className="border-b border-of-border-subtle pb-3">
                  <h2
                    id="calendar-audit-title"
                    className="flex items-center gap-2 text-sm font-semibold"
                  >
                    <History size={15} className="text-of-muted" aria-hidden="true" />
                    변경 감사
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-of-muted">
                    서버에 저장된 최근 워크스페이스 일정 변경입니다.
                  </p>
                </div>
                <dl className="grid gap-px border-b border-of-border-subtle bg-of-border-subtle sm:grid-cols-3">
                  <div className="bg-of-surface py-3 sm:px-3 sm:first:pl-0">
                    <dt className="text-[11px] text-of-muted">최근 변경자</dt>
                    <dd className="mt-1 break-words text-xs font-medium">
                      {data.updated_by_name ?? '초기 워크스페이스 일정'}
                    </dd>
                  </div>
                  <div className="bg-of-surface py-3 sm:px-3">
                    <dt className="text-[11px] text-of-muted">최근 변경 시각</dt>
                    <dd className="mt-1 text-xs font-medium">
                      {formatDateTime(data.updated_at)}
                    </dd>
                  </div>
                  <div className="flex items-start gap-2 bg-of-surface py-3 text-xs leading-5 text-of-muted sm:px-3">
                    <ShieldCheck
                      size={15}
                      className="mt-0.5 shrink-0"
                      aria-hidden="true"
                    />
                    <span>revision {data.revision} · 관리자 변경 전용</span>
                  </div>
                </dl>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
