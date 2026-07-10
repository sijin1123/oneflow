import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { ExternalLink, Lock, Pencil, Trash2, Users, X } from 'lucide-react'

import { confirmDestructive } from '@/lib/guards'

import { type ProjectModule, useDeleteModule } from './api'

export function ModuleItemActions({
  module,
  projectId,
  isOwner,
  top,
  left,
  onOpenWorkItems,
  onEdit,
  onToggleMembers,
  onMessage,
  onClose,
}: {
  module: ProjectModule
  projectId: string
  isOwner: boolean
  top: number
  left: number
  onOpenWorkItems: (moduleId: string) => void
  onEdit: () => void
  onToggleMembers: () => void
  onMessage: (message: string, tone?: 'info' | 'success' | 'error') => void
  onClose: () => void
}) {
  const remove = useDeleteModule(projectId)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const deleteModule = () => {
    if (
      !confirmDestructive(
        `'${module.name}' 모듈을 삭제할까요?\n연결된 작업 ${module.work_package_count}건은 삭제되지 않고 모듈 배정만 해제됩니다.`,
      )
    )
      return
    remove.mutate(module.id, {
      onSuccess: () => {
        onMessage(`'${module.name}' 모듈을 삭제했습니다.`, 'success')
        onClose()
      },
      onError: () => onMessage('모듈을 삭제하지 못했습니다.', 'error'),
    })
  }

  return (
    <div
      role="menu"
      aria-label={`${module.name} 모듈 작업`}
      className="fixed z-50 w-60 rounded-of border border-of-border bg-of-surface p-1 text-sm shadow-[var(--of-shadow-popover)]"
      style={{ top, left }}
    >
      <div className="flex items-center justify-between gap-2 px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-normal text-of-muted">
        <span className="truncate">모듈 작업</span>
        <button
          type="button"
          aria-label="모듈 작업 닫기"
          className="rounded-[4px] p-0.5 hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
          onClick={onClose}
        >
          <X size={12} />
        </button>
      </div>
      <MenuButton
        onClick={() => {
          onOpenWorkItems(module.id)
          onClose()
        }}
      >
        <ExternalLink size={13} /> 작업 목록 열기
      </MenuButton>
      <MenuButton
        onClick={() => {
          onToggleMembers()
          onClose()
        }}
      >
        <Users size={13} /> 참여자 관리
      </MenuButton>
      <div className="my-1 h-px bg-of-border" />
      {isOwner ? (
        <>
          <MenuButton
            onClick={() => {
              onEdit()
              onClose()
            }}
          >
            <Pencil size={13} /> 편집
          </MenuButton>
          <MenuButton disabled={remove.isPending} onClick={deleteModule}>
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
