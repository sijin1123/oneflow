import { Check, ChevronDown, Search } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

import { PriorityChip, StatusChip } from './chips'
import {
  PRIORITY_LABELS,
  WP_PRIORITIES,
  WP_STATUSES,
  type WpPriority,
  type WpStatus,
} from './types'

type Property = 'status' | 'priority'

type Option = {
  value: string
  label: string
}

export function DetailInlinePropertyMenu({
  property,
  value,
  canWrite,
  pending,
  statusLabel,
  onValueChange,
}: {
  property: Property
  value: WpStatus | WpPriority
  canWrite: boolean
  pending: boolean
  statusLabel: (status: string) => string
  onValueChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeValue, setActiveValue] = useState(value as string)
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef(new Map<string, HTMLButtonElement>())
  const listboxId = useId()
  const label = property === 'status' ? '상태' : '우선순위'
  const options: Option[] = property === 'status'
    ? WP_STATUSES.map((status) => ({ value: status, label: statusLabel(status) }))
    : WP_PRIORITIES.map((priority) => ({ value: priority, label: PRIORITY_LABELS[priority] }))
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredOptions = normalizedQuery
    ? options.filter((option) => option.label.toLocaleLowerCase().includes(normalizedQuery))
    : options
  const currentLabel = options.find((option) => option.value === value)?.label ?? value

  const chip = property === 'status'
    ? <StatusChip status={value as WpStatus} label={currentLabel} />
    : <PriorityChip priority={value as WpPriority} />

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      if (property === 'status') inputRef.current?.focus()
      else optionRefs.current.get(value as string)?.focus()
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
  }, [open, property, value])

  if (!canWrite) return <span aria-label={`${label}: ${currentLabel}`}>{chip}</span>

  const changeOpen = (nextOpen: boolean) => {
    if (nextOpen && pending) return
    setOpen(nextOpen)
    setQuery('')
    setActiveValue(value as string)
  }

  const choose = (nextValue: string) => {
    if (pending || nextValue === value) {
      setOpen(false)
      return
    }
    setOpen(false)
    onValueChange(nextValue)
  }

  const moveActive = (direction: 1 | -1) => {
    if (filteredOptions.length === 0) return
    const currentIndex = filteredOptions.findIndex((option) => option.value === activeValue)
    const nextIndex = currentIndex < 0
      ? direction === 1 ? 0 : filteredOptions.length - 1
      : (currentIndex + direction + filteredOptions.length) % filteredOptions.length
    setActiveValue(filteredOptions[nextIndex].value)
  }

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      moveActive(event.key === 'ArrowDown' ? 1 : -1)
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      const option = event.key === 'Home' ? filteredOptions[0] : filteredOptions.at(-1)
      if (option) setActiveValue(option.value)
      return
    }
    if (event.key === 'Enter') {
      const active = filteredOptions.find((option) => option.value === activeValue)
        ?? filteredOptions[0]
      if (active) {
        event.preventDefault()
        choose(active.value)
      }
    }
  }

  const handleOptionKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    optionValue: string,
  ) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const currentIndex = options.findIndex((option) => option.value === optionValue)
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? options.length - 1
        : (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
    const next = options[nextIndex]
    setActiveValue(next.value)
    optionRefs.current.get(next.value)?.focus()
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label={`${label} 변경: ${currentLabel}`}
          aria-busy={pending}
          aria-disabled={pending}
          className="flex min-w-0 items-center gap-1 rounded-of text-left hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus aria-disabled:cursor-wait aria-disabled:opacity-60"
        >
          {chip}
          <ChevronDown
            size={11}
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
        className="w-[min(14rem,calc(100vw-2rem))] p-1.5"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
        }}
      >
        {property === 'status' ? (
          <div className="relative mb-1.5">
            <Search
              size={13}
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-of-muted"
            />
            <Input
              ref={inputRef}
              role="combobox"
              aria-label="상태 검색"
              aria-expanded="true"
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={
                filteredOptions.some((option) => option.value === activeValue)
                  ? `${listboxId}-${activeValue}`
                  : undefined
              }
              value={query}
              placeholder="상태 검색"
              className="h-7 pl-7 text-xs"
              onChange={(event) => {
                const nextQuery = event.target.value
                const normalized = nextQuery.trim().toLocaleLowerCase()
                const nextOptions = normalized
                  ? options.filter((option) => option.label.toLocaleLowerCase().includes(normalized))
                  : options
                setQuery(nextQuery)
                setActiveValue(nextOptions[0]?.value ?? '')
              }}
              onKeyDown={handleSearchKeyDown}
            />
          </div>
        ) : null}

        <div id={listboxId} role="listbox" aria-label={`${label} 옵션`} className="space-y-0.5">
          {filteredOptions.length > 0 ? filteredOptions.map((option) => {
            const selected = option.value === value
            const active = option.value === activeValue
            return (
              <button
                key={option.value}
                id={`${listboxId}-${option.value}`}
                ref={(element) => {
                  if (element) optionRefs.current.set(option.value, element)
                  else optionRefs.current.delete(option.value)
                }}
                type="button"
                role="option"
                aria-selected={selected}
                tabIndex={property === 'status' ? -1 : active ? 0 : -1}
                className={cn(
                  'flex min-h-8 w-full items-center justify-between gap-2 rounded-[4px] px-2 py-1.5 text-left text-xs outline-none transition-colors hover:bg-of-surface-hover focus-visible:bg-of-surface-hover focus-visible:ring-2 focus-visible:ring-of-focus',
                  active && 'bg-of-surface-hover',
                )}
                onMouseMove={() => setActiveValue(option.value)}
                onClick={() => choose(option.value)}
                onKeyDown={(event) => handleOptionKeyDown(event, option.value)}
              >
                {property === 'status'
                  ? <StatusChip status={option.value as WpStatus} label={option.label} />
                  : option.value === 'none'
                    ? <span className="text-of-muted">{option.label}</span>
                    : <PriorityChip priority={option.value as WpPriority} />}
                <Check
                  size={13}
                  aria-hidden
                  className={selected ? 'text-of-accent' : 'invisible'}
                />
              </button>
            )
          }) : (
            <p className="px-2 py-4 text-center text-xs text-of-muted">일치하는 상태가 없습니다.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
