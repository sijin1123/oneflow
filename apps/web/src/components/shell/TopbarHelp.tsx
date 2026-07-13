import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { BookOpen, HelpCircle, Keyboard, ShieldCheck, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuthConfig } from '@/features/auth/api'
import { useWorkspaceCapabilities } from '@/features/workspace-features/api'
import { appOverlayRegistry } from '@/lib/shortcuts'

export function TopbarHelp({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate()
  const capabilities = useWorkspaceCapabilities()
  const authConfig = useAuthConfig()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const wikiEnabled = capabilities.data?.wiki.enabled === true
  const commandPaletteEnabled = authConfig.data?.command_palette_enabled === true

  useEffect(() => {
    if (!open) return
    return appOverlayRegistry.register('topbar-help-menu')
  }, [open])
  useEffect(() => {
    if (!shortcutsOpen) return
    return appOverlayRegistry.register('topbar-help-shortcuts')
  }, [shortcutsOpen])

  const go = (path: string) => {
    onOpenChange(false)
    navigate(path)
  }

  return (
    <>
      <DropdownMenu.Root open={open} onOpenChange={onOpenChange} modal={false}>
        <DropdownMenu.Trigger asChild>
          <button
            ref={triggerRef}
            type="button"
            aria-label="도움말"
            title="도움말"
            className="of-touch-target inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-of border border-transparent text-of-muted transition-colors hover:border-of-border-subtle hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus focus-visible:ring-offset-1 focus-visible:ring-offset-of-surface [&_svg]:shrink-0"
          >
            <HelpCircle size={16} aria-hidden="true" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            aria-label="도움말"
            align="end"
            side="bottom"
            sideOffset={6}
            collisionPadding={12}
            className="of-menu-enter z-50 max-h-[min(28rem,calc(100vh-5rem))] w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto rounded-of border border-of-border bg-of-surface p-1 text-sm shadow-[var(--of-shadow-popover)] motion-reduce:animate-none"
          >
            {wikiEnabled ? (
              <DropdownMenu.Item className="flex min-h-8 cursor-default select-none items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-xs outline-none transition-colors data-[highlighted]:bg-of-surface-hover" onSelect={() => go('/wiki')}>
                <BookOpen size={14} aria-hidden="true" /> 문서
              </DropdownMenu.Item>
            ) : null}
            <DropdownMenu.Item className="flex min-h-8 cursor-default select-none items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-xs outline-none transition-colors data-[highlighted]:bg-of-surface-hover" onSelect={() => go('/status')}>
              <ShieldCheck size={14} aria-hidden="true" /> 시스템 상태
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="flex min-h-8 cursor-default select-none items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-xs outline-none transition-colors data-[highlighted]:bg-of-surface-hover"
              onSelect={(event) => {
                event.preventDefault()
                onOpenChange(false)
                setShortcutsOpen(true)
              }}
            >
              <Keyboard size={14} aria-hidden="true" /> 키보드 단축키
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <Dialog.Root open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[var(--of-z-modal)] bg-of-overlay backdrop-blur-[2px] of-overlay-enter motion-reduce:animate-none" />
          <Dialog.Content
            aria-describedby="topbar-help-shortcuts-description"
            className="of-menu-enter fixed left-1/2 top-1/2 z-[calc(var(--of-z-modal)+1)] w-[min(26rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 rounded-of-lg border border-of-border bg-of-surface-raised p-4 shadow-[var(--of-shadow-popover)] outline-none motion-reduce:animate-none"
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              triggerRef.current?.focus()
            }}
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <Dialog.Title className="text-sm font-semibold">키보드 단축키</Dialog.Title>
                <Dialog.Description id="topbar-help-shortcuts-description" className="mt-1 text-xs text-of-muted">OneFlow에서 빠르게 이동하고 열린 창을 닫는 방법입니다.</Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button type="button" aria-label="키보드 단축키 닫기" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus">
                  <X size={16} aria-hidden="true" />
                </button>
              </Dialog.Close>
            </div>
            <dl className="mt-4 space-y-2 text-xs">
              {commandPaletteEnabled ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-of bg-of-surface-2 px-3 py-2">
                  <dt>전체 검색 열기</dt>
                  <dd className="flex flex-wrap items-center justify-end gap-1 text-of-muted"><kbd className="rounded border border-of-border bg-of-surface px-1.5 py-0.5 font-mono">⌘/Ctrl + K</kbd><span>또는</span><kbd className="rounded border border-of-border bg-of-surface px-1.5 py-0.5 font-mono">/</kbd></dd>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-of bg-of-surface-2 px-3 py-2">
                <dt>열린 메뉴 또는 창 닫기</dt>
                <dd><kbd className="rounded border border-of-border bg-of-surface px-1.5 py-0.5 font-mono">Esc</kbd></dd>
              </div>
            </dl>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
