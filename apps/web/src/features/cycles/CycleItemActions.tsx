import type { ReactNode } from 'react'
import { useCallback, useEffect, useRef } from 'react'
import {
  ChartNoAxesColumn,
  ExternalLink,
  Lock,
  Pencil,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react'

import { Select } from '@/components/ui/select'
import { confirmDestructive } from '@/lib/guards'

import { type Cycle, useDeleteCycle, useRolloverCycle } from './api'

export function CycleItemActions({
  cycle,
  projectId,
  isOwner,
  others,
  trigger,
  top,
  left,
  onOpenWorkItems,
  onEdit,
  onToggleBurndown,
  onMessage,
  onClose,
}: {
  cycle: Cycle
  projectId: string
  isOwner: boolean
  others: Cycle[]
  trigger: HTMLButtonElement
  top: number
  left: number
  onOpenWorkItems: (cycleId: string) => void
  onEdit: () => void
  onToggleBurndown: () => void
  onMessage: (message: string, tone?: 'info' | 'success' | 'error') => void
  onClose: () => void
}) {
  const remove = useDeleteCycle(projectId)
  const rollover = useRolloverCycle(projectId)
  const menuRef = useRef<HTMLDivElement>(null)
  const incomplete = Math.max(0, cycle.work_package_count - cycle.done_work_package_count)

  const closeMenu = useCallback(
    (restoreFocus: boolean) => {
      onClose()
      if (restoreFocus) requestAnimationFrame(() => trigger.focus())
    },
    [onClose, trigger],
  )

  useEffect(() => {
    const enabledItems = () =>
      Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>(
          '[role="menuitem"]:not([aria-disabled="true"]):not([disabled])',
        ) ?? [],
      )
    const focusFrame = requestAnimationFrame(() => enabledItems()[0]?.focus())

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeMenu(true)
        return
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
      if (!menuRef.current?.contains(document.activeElement)) return

      const items = enabledItems()
      if (!items.length) return
      event.preventDefault()
      const currentIndex = items.indexOf(document.activeElement as HTMLElement)
      let nextIndex = 0
      if (event.key === 'End') nextIndex = items.length - 1
      else if (event.key === 'ArrowUp')
        nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1
      else if (event.key === 'ArrowDown')
        nextIndex = currentIndex < 0 || currentIndex === items.length - 1 ? 0 : currentIndex + 1
      items[nextIndex]?.focus()
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (menuRef.current?.contains(target) || trigger.contains(target)) return
      closeMenu(false)
    }

    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [closeMenu, trigger])

  const deleteCycle = () => {
    if (
      !confirmDestructive(
        `'${cycle.name}' 사이클을 삭제할까요?\n연결된 작업 ${cycle.work_package_count}건은 삭제되지 않고 사이클 배정만 해제됩니다.`,
      )
    )
      return
    remove.mutate(cycle.id, {
      onSuccess: () => {
        onMessage(`'${cycle.name}' 사이클을 삭제했습니다.`, 'success')
        closeMenu(false)
      },
      onError: () => onMessage('사이클을 삭제하지 못했습니다.', 'error'),
    })
  }

  const rolloverTo = (targetId: string) => {
    const target = others.find((c) => c.id === targetId)
    if (!target) return
    if (
      !confirmDestructive(
        `'${cycle.name}'의 미완료 작업 ${incomplete}건을 '${target.name}'(으)로 이월할까요?\n(반대 방향 이월로 언제든 되돌릴 수 있습니다)`,
      )
    )
      return
    rollover.mutate(
      { cycleId: cycle.id, targetCycleId: target.id },
      {
        onSuccess: (result) => {
          onMessage(`'${target.name}'(으)로 ${result.moved}건을 이월했습니다.`, 'success')
          closeMenu(false)
        },
        onError: () => onMessage('미완료 작업을 이월하지 못했습니다.', 'error'),
      },
    )
  }

  return (
    <div
      ref={menuRef}
      id={`cycle-actions-${cycle.id}`}
      role="menu"
      aria-label={`${cycle.name} 사이클 작업`}
      className="fixed z-50 w-60 rounded-of border border-of-border bg-of-surface p-1 text-sm shadow-[var(--of-shadow-popover)]"
      style={{ top, left }}
    >
      <div className="flex items-center justify-between gap-2 px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-normal text-of-muted">
        <span className="truncate">사이클 작업</span>
        <button
          type="button"
          aria-label="사이클 작업 닫기"
          className="rounded-[4px] p-0.5 hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
          onClick={() => closeMenu(true)}
        >
          <X size={12} />
        </button>
      </div>
      <MenuButton
        onClick={() => {
          onOpenWorkItems(cycle.id)
          closeMenu(false)
        }}
      >
        <ExternalLink size={13} /> 작업 목록 열기
      </MenuButton>
      <MenuButton
        onClick={() => {
          onToggleBurndown()
          closeMenu(false)
        }}
      >
        <ChartNoAxesColumn size={13} /> 번다운 보기
      </MenuButton>
      <div className="my-1 h-px bg-of-border" />
      {isOwner ? (
        <>
          <MenuButton
            onClick={() => {
              onEdit()
              closeMenu(false)
            }}
          >
            <Pencil size={13} /> 편집
          </MenuButton>
          {cycle.status === 'completed' && others.length > 0 ? (
            <label className="mt-1 block rounded-[4px] px-2 py-1.5 text-xs text-of-muted">
              <span className="mb-1 flex items-center gap-2">
                <RotateCcw size={13} /> 미완료 이월
              </span>
              <Select
                aria-label={`${cycle.name} 미완료 이월`}
                className="h-7 w-full text-xs"
                value=""
                disabled={rollover.isPending}
                onChange={(event) => rolloverTo(event.target.value)}
              >
                <option value="">대상 사이클 선택...</option>
                {others.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}
          <MenuButton disabled={remove.isPending} onClick={deleteCycle}>
            <Trash2 size={13} /> 삭제
          </MenuButton>
        </>
      ) : (
        <div
          role="menuitem"
          aria-disabled="true"
          className="flex min-h-7 cursor-default select-none items-center gap-2 rounded-[4px] px-2 py-1.5 text-xs text-of-muted opacity-70"
        >
          <Lock size={13} /> 쓰기 권한 없음
        </div>
      )}
    </div>
  )
}

function MenuButton({
  children,
  disabled = false,
  onClick,
}: {
  children: ReactNode
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className="flex min-h-7 w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left text-xs outline-none transition-colors hover:bg-of-surface-hover focus-visible:bg-of-surface-hover disabled:opacity-50"
      onClick={onClick}
    >
      {children}
    </button>
  )
}
