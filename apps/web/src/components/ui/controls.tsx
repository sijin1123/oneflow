import type * as React from 'react'

import { Check } from 'lucide-react'

import { cn } from '@/lib/utils'

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T
  options: Array<{ value: T; label: string; icon?: React.ReactNode }>
  onChange: (value: T) => void
  label: string
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-of bg-of-surface-2 p-0.5', className)}>
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-[4px] px-2 text-xs text-of-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus [&_svg]:size-3.5',
            value === option.value && 'bg-of-surface font-medium text-of-text shadow-[var(--of-shadow-xs)]',
          )}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            const direction =
              event.key === 'ArrowRight' || event.key === 'ArrowDown'
                ? 1
                : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                  ? -1
                  : 0
            const targetIndex =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? options.length - 1
                  : direction
                    ? (index + direction + options.length) % options.length
                    : -1
            if (targetIndex < 0) return
            event.preventDefault()
            onChange(options[targetIndex].value)
            event.currentTarget.parentElement
              ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
              [targetIndex]?.focus()
          }}
        >
          {option.icon}{option.label}
        </button>
      ))}
    </div>
  )
}

export function Checkbox({
  label,
  className,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: React.ReactNode }) {
  return (
    <label className={cn('inline-flex min-h-8 cursor-pointer items-center gap-2 text-xs text-of-text', className)}>
      <span className="relative flex h-4 w-4 shrink-0">
        <input type="checkbox" className="peer h-4 w-4 appearance-none rounded-[3px] border border-of-border bg-of-surface checked:border-of-accent checked:bg-of-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus disabled:opacity-50" {...props} />
        <Check className="pointer-events-none absolute inset-0 hidden h-4 w-4 p-[2px] text-white peer-checked:block" />
      </span>
      <span>{label}</span>
    </label>
  )
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative h-5 w-9 rounded-full border border-transparent bg-of-surface-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus disabled:opacity-50',
        checked && 'bg-of-accent',
      )}
    >
      <span className={cn('absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform', checked && 'translate-x-4')} />
    </button>
  )
}

export function Toggle({
  pressed,
  label,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pressed: boolean; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      className={cn(
        'inline-flex h-8 items-center justify-center gap-1.5 rounded-of border border-transparent px-2 text-xs text-of-muted transition-colors hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus [&_svg]:size-3.5',
        pressed && 'border-of-accent/20 bg-of-accent-soft font-medium text-of-accent',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
