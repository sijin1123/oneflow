import { CalendarDays, ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { todayISO } from '@/lib/datetime'
import { cn } from '@/lib/utils'

import { formatScheduleDate, validateScheduleDates } from './scheduleDates'

type ScheduleProperty = 'start_date' | 'due_date'

export function DetailInlineDateMenu({
  property,
  value,
  otherDate,
  canWrite,
  pending,
  onValueChange,
}: {
  property: ScheduleProperty
  value: string | null
  otherDate: string | null
  canWrite: boolean
  pending: boolean
  onValueChange: (value: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const label = property === 'start_date' ? '시작일' : '기한'
  const draftValue = draft || null
  const validationError = property === 'start_date'
    ? validateScheduleDates(draftValue, otherDate)
    : validateScheduleDates(otherDate, draftValue)
  const displayValue = formatScheduleDate(value)

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0)
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return
      event.preventDefault()
      event.stopImmediatePropagation()
      setOpen(false)
      window.requestAnimationFrame(() => triggerRef.current?.focus())
    }
    window.addEventListener('keydown', closeOnEscape, { capture: true })
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', closeOnEscape, { capture: true })
    }
  }, [open])

  const chip = (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-of-muted">
      <CalendarDays size={13} className="shrink-0" aria-hidden />
      <span className="truncate">{label}: {displayValue}</span>
    </span>
  )

  if (!canWrite) return <span aria-label={`${label}: ${displayValue}`}>{chip}</span>

  const changeOpen = (nextOpen: boolean) => {
    if (nextOpen && pending) return
    setDraft(value ?? '')
    setOpen(nextOpen)
  }

  const apply = () => {
    if (pending || validationError) return
    setOpen(false)
    if (draftValue !== value) onValueChange(draftValue)
  }

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    apply()
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label={`${label} 변경: ${displayValue}`}
          aria-busy={pending}
          aria-disabled={pending}
          className="inline-flex min-w-0 items-center gap-1 rounded-of border border-of-border bg-of-surface px-2 py-1 text-left shadow-sm transition-colors hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus aria-disabled:cursor-wait aria-disabled:opacity-60"
        >
          {chip}
          <ChevronDown
            size={12}
            aria-hidden
            className={cn(
              'shrink-0 text-of-muted transition-transform duration-[var(--of-duration-default)]',
              open && 'rotate-180',
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={`${label} 선택`}
        className="w-[min(18rem,calc(100vw-2rem))] space-y-3 p-3"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="space-y-1.5">
          <label htmlFor={inputId} className="text-xs font-medium text-of-fg">
            {label}
          </label>
          <Input
            ref={inputRef}
            id={inputId}
            type="date"
            aria-label={`${label} 입력`}
            aria-invalid={Boolean(validationError)}
            value={draft}
            min={property === 'due_date' ? otherDate ?? undefined : undefined}
            max={property === 'start_date' ? otherDate ?? undefined : undefined}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleInputKeyDown}
          />
          {validationError ? (
            <p role="alert" className="text-xs text-of-danger">{validationError}</p>
          ) : (
            <p className="text-xs text-of-muted">날짜는 시간대 변환 없이 저장됩니다.</p>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1">
            <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(todayISO())}>
              오늘
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setDraft('')}>
              지우기
            </Button>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={pending || Boolean(validationError) || draftValue === value}
            onClick={apply}
          >
            적용
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
