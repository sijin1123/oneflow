import { Check, ChevronDown, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { isAssignableMember } from '@/features/members/assignment'
import type { Member } from '@/features/members/types'
import { cn } from '@/lib/utils'

import { AssigneeChip } from './AssigneeChip'

const UNASSIGNED = '__unassigned__'

export function DetailInlineAssigneeMenu({
  assigneeId,
  members,
  canWrite,
  pending,
  rosterPending,
  rosterError,
  onRetryRoster,
  onValueChange,
}: {
  assigneeId: string | null
  members: Member[]
  canWrite: boolean
  pending: boolean
  rosterPending: boolean
  rosterError: boolean
  onRetryRoster: () => void
  onValueChange: (assigneeId: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef(new Map<string, HTMLButtonElement>())
  const currentMember = members.find((member) => member.user_id === assigneeId)
  const currentLabel = assigneeId ? currentMember?.display_name ?? '알 수 없는 담당자' : '미배정'
  const assignableMembers = useMemo(() => members.filter(isAssignableMember), [members])
  const legacyCurrent = Boolean(
    assigneeId && !assignableMembers.some((member) => member.user_id === assigneeId),
  )
  const selectedValue = assigneeId ?? UNASSIGNED
  const options = useMemo(
    () => [
      { value: UNASSIGNED, name: null, disabled: false },
      ...(legacyCurrent
        ? [{ value: assigneeId as string, name: currentLabel, disabled: true }]
        : []),
      ...assignableMembers.map((member) => ({
        value: member.user_id,
        name: member.display_name,
        disabled: false,
      })),
    ],
    [assigneeId, assignableMembers, currentLabel, legacyCurrent],
  )

  const chip = <AssigneeChip name={assigneeId ? currentLabel : null} />

  useEffect(() => {
    if (!open) return
    const focusableOptions = options.filter((option) => !option.disabled)
    const initialValue = focusableOptions.some((option) => option.value === selectedValue)
      ? selectedValue
      : focusableOptions[0]?.value
    const timer = window.setTimeout(() => {
      if (initialValue) optionRefs.current.get(initialValue)?.focus()
    }, 0)
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
  }, [open, options, selectedValue])

  if (!canWrite) {
    return (
      <span
        aria-label={`담당자: ${currentLabel}`}
        className="inline-flex min-w-0 items-center rounded-of px-1 py-0.5"
      >
        {chip}
      </span>
    )
  }

  const choose = (value: string) => {
    const nextAssigneeId = value === UNASSIGNED ? null : value
    setOpen(false)
    if (nextAssigneeId === assigneeId || pending) return
    onValueChange(nextAssigneeId)
  }

  const moveFocus = (event: ReactKeyboardEvent<HTMLButtonElement>, value: string) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const focusableOptions = options.filter((option) => !option.disabled)
    const currentIndex = focusableOptions.findIndex((option) => option.value === value)
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? focusableOptions.length - 1
        : (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + focusableOptions.length)
          % focusableOptions.length
    optionRefs.current.get(focusableOptions[nextIndex]?.value)?.focus()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label={`담당자 변경: ${currentLabel}`}
          aria-busy={pending}
          disabled={pending}
          className="inline-flex min-w-0 items-center gap-1 rounded-of border border-of-border bg-of-surface px-2 py-1 text-left shadow-sm transition-colors hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus disabled:cursor-not-allowed disabled:opacity-60"
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
        aria-label="담당자 선택"
        className="max-h-64 w-56 overflow-y-auto p-1"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {rosterPending ? (
          <p className="flex min-h-8 items-center gap-2 px-2 py-1.5 text-xs text-of-muted">
            <RefreshCw size={12} className="animate-spin" aria-hidden />
            멤버 불러오는 중
          </p>
        ) : rosterError ? (
          <button
            type="button"
            className="flex min-h-8 w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left text-xs text-of-danger outline-none hover:bg-of-surface-hover focus-visible:ring-2 focus-visible:ring-of-focus"
            onClick={onRetryRoster}
          >
            <RefreshCw size={12} aria-hidden />
            멤버 다시 불러오기
          </button>
        ) : (
          <div role="listbox" aria-label="담당자 옵션" className="space-y-0.5">
            {options.map((option) => (
              <button
                key={option.value}
                ref={(element) => {
                  if (element) optionRefs.current.set(option.value, element)
                  else optionRefs.current.delete(option.value)
                }}
                type="button"
                role="option"
                aria-selected={option.value === selectedValue}
                disabled={option.disabled}
                tabIndex={option.value === selectedValue && !option.disabled ? 0 : -1}
                className="flex min-h-8 w-full items-center justify-between gap-2 rounded-[4px] px-2 py-1.5 text-left outline-none transition-colors hover:bg-of-surface-hover focus-visible:bg-of-surface-hover focus-visible:ring-2 focus-visible:ring-of-focus disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => choose(option.value)}
                onKeyDown={(event) => moveFocus(event, option.value)}
              >
                <AssigneeChip name={option.name} />
                <Check
                  size={13}
                  aria-hidden
                  className={option.value === selectedValue ? 'text-of-accent' : 'invisible'}
                />
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
