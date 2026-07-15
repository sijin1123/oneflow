import { CalendarCheck2, CalendarPlus, LoaderCircle, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SettingsFrame, SettingsSection } from '@/features/settings/SettingsShell'
import {
  useUpdateWorkspaceCalendar,
  useWorkspaceCalendar,
} from '@/features/workspace-profile/api'
import { ApiError } from '@/lib/api'
import { formatDateTime } from '@/lib/datetime'

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const

export function WorkspaceCalendarSettingsPage() {
  const calendar = useWorkspaceCalendar()
  const update = useUpdateWorkspaceCalendar()
  const [workingWeekdays, setWorkingWeekdays] = useState<number[]>([])
  const [holidays, setHolidays] = useState<string[]>([])
  const [holidayInput, setHolidayInput] = useState('')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!calendar.data || dirty) return
    setWorkingWeekdays(calendar.data.working_weekdays)
    setHolidays(calendar.data.holidays)
  }, [calendar.data, dirty])

  const sortedHolidays = useMemo(() => [...holidays].sort(), [holidays])

  if (calendar.isPending) return <ListSkeleton />
  if (calendar.isError) {
    if (calendar.error instanceof ApiError && calendar.error.status === 403) {
      return <EmptyState title="접근 권한이 없습니다" hint="워크스페이스 일정은 관리자만 변경할 수 있습니다." />
    }
    return <ErrorState error={calendar.error} onRetry={() => calendar.refetch()} />
  }

  const stale = update.error instanceof ApiError && update.error.status === 412
  const reset = () => {
    setWorkingWeekdays(calendar.data.working_weekdays)
    setHolidays(calendar.data.holidays)
    setHolidayInput('')
    setDirty(false)
    update.reset()
  }

  return (
    <SettingsFrame
      eyebrow="Workspace administration"
      title="근무 일정"
      description="프로젝트 단계 자동 일정에 사용할 근무 요일과 휴일을 관리합니다."
      meta={`revision ${calendar.data.revision}`}
    >
      <SettingsSection title="근무 요일" description="한 개 이상의 요일을 선택해야 합니다.">
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7" role="group" aria-label="근무 요일 선택">
          {WEEKDAYS.map((label, weekday) => {
            const checked = workingWeekdays.includes(weekday)
            return (
              <label
                key={label}
                className="flex min-w-0 cursor-pointer items-center justify-center gap-2 border border-of-border bg-of-surface px-2 py-2 text-xs hover:bg-of-subtle focus-within:ring-2 focus-within:ring-of-accent"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = checked
                      ? workingWeekdays.filter((value) => value !== weekday)
                      : [...workingWeekdays, weekday].sort()
                    setWorkingWeekdays(next)
                    setDirty(true)
                    update.reset()
                  }}
                />
                {label}
              </label>
            )
          })}
        </div>
        {workingWeekdays.length === 0 ? (
          <p className="mt-2 text-xs text-of-danger" role="alert">근무 요일을 한 개 이상 선택하세요.</p>
        ) : null}
      </SettingsSection>

      <SettingsSection title="휴일" description="선택한 근무 요일이어도 아래 날짜는 자동 일정에서 제외됩니다.">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
          <Input
            type="date"
            aria-label="휴일 날짜"
            value={holidayInput}
            onChange={(event) => setHolidayInput(event.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            disabled={!holidayInput || holidays.includes(holidayInput) || holidays.length >= 366}
            onClick={() => {
              setHolidays((current) => [...current, holidayInput].sort())
              setHolidayInput('')
              setDirty(true)
              update.reset()
            }}
          >
            <CalendarPlus size={14} /> 휴일 추가
          </Button>
        </div>
        {sortedHolidays.length ? (
          <ul className="mt-3 divide-y divide-of-border border-y border-of-border" aria-label="등록된 휴일">
            {sortedHolidays.map((holiday) => (
              <li key={holiday} className="flex min-w-0 items-center justify-between gap-3 py-2 text-xs">
                <span className="truncate font-medium">{holiday}</span>
                <button
                  type="button"
                  className="of-icon-button"
                  aria-label={`${holiday} 휴일 제거`}
                  title="휴일 제거"
                  onClick={() => {
                    setHolidays((current) => current.filter((value) => value !== holiday))
                    setDirty(true)
                    update.reset()
                  }}
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-of-muted">등록된 휴일이 없습니다.</p>
        )}
      </SettingsSection>

      <SettingsSection title="적용" description="저장된 일정은 이후 프로젝트 단계 종료일 변경부터 적용됩니다.">
        <div className="flex min-w-0 items-start gap-2 border-l-2 border-of-accent px-3 py-1.5">
          <CalendarCheck2 size={15} className="mt-0.5 shrink-0 text-of-accent" />
          <p className="min-w-0 text-xs leading-5 text-of-muted">
            {workingWeekdays.map((value) => WEEKDAYS[value]).join(' · ') || '근무 요일 없음'} · 휴일 {holidays.length}일
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={!dirty || workingWeekdays.length === 0 || update.isPending}
            onClick={() =>
              update.mutate(
                {
                  workingWeekdays,
                  holidays: sortedHolidays,
                  revision: calendar.data.revision,
                },
                { onSuccess: () => setDirty(false) },
              )
            }
          >
            {update.isPending ? <LoaderCircle size={13} className="animate-spin" /> : null}
            일정 저장
          </Button>
          {dirty ? <Button size="sm" variant="outline" disabled={update.isPending} onClick={reset}>되돌리기</Button> : null}
        </div>
        {update.isError ? (
          <p className="mt-3 text-xs text-of-danger" role="alert">
            {stale
              ? '다른 관리자가 먼저 변경했습니다. 현재 선택은 유지했으며 최신 revision으로 다시 저장할 수 있습니다.'
              : '근무 일정을 저장하지 못했습니다.'}
          </p>
        ) : null}
        {!dirty && !update.isError ? (
          <p className="mt-3 text-[11px] text-of-muted">
            최근 변경: {calendar.data.updated_by_name ?? '초기 설정'} · {formatDateTime(calendar.data.updated_at)}
          </p>
        ) : null}
      </SettingsSection>
    </SettingsFrame>
  )
}
