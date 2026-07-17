import * as Dialog from '@radix-ui/react-dialog'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Ellipsis,
  Link2,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { type FormEvent, type ReactNode, useState } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'

import {
  type WorkspaceQuickLink,
  useCreateWorkspaceQuickLink,
  useDeleteWorkspaceQuickLink,
  useOrderWorkspaceQuickLinks,
  useUpdateWorkspaceQuickLink,
  useWorkspaceQuickLinks,
} from './quickLinksApi'

const QUICK_LINK_LIMIT = 8

type EditorState =
  | { mode: 'create' }
  | { mode: 'edit'; link: WorkspaceQuickLink }
  | { mode: 'delete'; link: WorkspaceQuickLink }
  | null

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '요청을 완료하지 못했습니다.'
}

function UserQuickLinkCard({
  link,
  index,
  total,
  busy,
  onEdit,
  onDelete,
  onMove,
}: {
  link: WorkspaceQuickLink
  index: number
  total: number
  busy: boolean
  onEdit: () => void
  onDelete: () => void
  onMove: (direction: -1 | 1) => void
}) {
  const body = (
    <>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-of bg-of-accent-soft text-of-accent">
        <Link2 size={15} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{link.title}</span>
        <span className="block truncate text-xs text-of-muted">{link.destination}</span>
      </span>
      <ArrowUpRight size={14} className="shrink-0 text-of-muted" aria-hidden="true" />
    </>
  )
  const linkClass =
    'flex min-h-16 min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-of-focus'

  return (
    <div className="flex min-w-0 overflow-hidden rounded-of border border-of-border bg-of-surface">
      {link.destination.startsWith('/') ? (
        <Link to={link.destination} className={linkClass}>
          {body}
        </Link>
      ) : (
        <a href={link.destination} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {body}
        </a>
      )}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`${link.title} 빠른 링크 관리`}
            className="my-2 mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-2 hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus disabled:opacity-45"
            disabled={busy}
          >
            <Ellipsis size={15} aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil size={14} /> 편집
          </DropdownMenuItem>
          <DropdownMenuItem disabled={index === 0} onSelect={() => onMove(-1)}>
            <ArrowUp size={14} /> 앞으로 이동
          </DropdownMenuItem>
          <DropdownMenuItem disabled={index === total - 1} onSelect={() => onMove(1)}>
            <ArrowDown size={14} /> 뒤로 이동
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-of-danger" onSelect={onDelete}>
            <Trash2 size={14} /> 삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function WorkspaceQuickLinks({ children }: { children: ReactNode }) {
  const links = useWorkspaceQuickLinks()
  const create = useCreateWorkspaceQuickLink()
  const update = useUpdateWorkspaceQuickLink()
  const remove = useDeleteWorkspaceQuickLink()
  const order = useOrderWorkspaceQuickLinks()
  const [editor, setEditor] = useState<EditorState>(null)
  const [title, setTitle] = useState('')
  const [destination, setDestination] = useState('')
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const items = links.data?.items ?? []
  const busy = create.isPending || update.isPending || remove.isPending || order.isPending

  const openCreate = () => {
    setTitle('')
    setDestination('')
    setError('')
    setEditor({ mode: 'create' })
  }

  const openEdit = (link: WorkspaceQuickLink) => {
    setTitle(link.title)
    setDestination(link.destination)
    setError('')
    setEditor({ mode: 'edit', link })
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!editor || editor.mode === 'delete') return
    setError('')
    try {
      if (editor.mode === 'create') {
        await create.mutateAsync({
          title: title.trim(),
          destination: destination.trim(),
        })
      } else {
        await update.mutateAsync({
          id: editor.link.id,
          expected_version: editor.link.version,
          title: title.trim(),
          destination: destination.trim(),
        })
      }
      setEditor(null)
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  const confirmDelete = async () => {
    if (!editor || editor.mode !== 'delete') return
    setError('')
    try {
      await remove.mutateAsync({
        id: editor.link.id,
        expectedVersion: editor.link.version,
      })
      setEditor(null)
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  const move = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= items.length || order.isPending) return
    const next = [...items]
    ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]
    setActionError('')
    try {
      await order.mutateAsync(next.map((link) => ({ id: link.id, expected_version: link.version })))
    } catch (caught) {
      setActionError(errorMessage(caught))
    }
  }

  const refreshAfterError = () => {
    setEditor(null)
    setError('')
    void links.refetch()
  }

  const editorTitle =
    editor?.mode === 'create'
      ? '빠른 링크 추가'
      : editor?.mode === 'edit'
        ? '빠른 링크 편집'
        : '빠른 링크 삭제'

  return (
    <section aria-label="빠른 이동" className="min-w-0">
      <div className="mb-2 flex min-w-0 items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">빠른 이동</h2>
          <p className="truncate text-[11px] text-of-muted">
            제품 바로가기와 내 링크 {items.length}/{QUICK_LINK_LIMIT}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={links.isPending || items.length >= QUICK_LINK_LIMIT}
          title={
            items.length >= QUICK_LINK_LIMIT ? '내 링크는 8개까지 추가할 수 있습니다.' : undefined
          }
          onClick={openCreate}
        >
          <Plus size={13} /> 빠른 링크 추가
        </Button>
      </div>
      <div className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {children}
        {links.isPending ? (
          <div
            role="status"
            className="min-h-16 animate-pulse rounded-of border border-of-border bg-of-surface-2"
          >
            <span className="sr-only">내 빠른 링크를 불러오는 중입니다.</span>
          </div>
        ) : links.isError ? (
          <div className="flex min-h-16 items-center justify-between gap-2 rounded-of border border-of-danger/25 bg-of-danger-soft px-3 text-xs text-of-danger">
            <span>내 링크를 불러오지 못했습니다.</span>
            <button type="button" className="font-medium underline" onClick={() => links.refetch()}>
              재시도
            </button>
          </div>
        ) : items.length === 0 ? (
          <button
            type="button"
            className="flex min-h-16 items-center gap-3 rounded-of border border-dashed border-of-border bg-of-surface px-3 text-left text-xs text-of-muted hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
            onClick={openCreate}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-of bg-of-surface-2">
              <Plus size={15} aria-hidden="true" />
            </span>
            자주 여는 내부 화면이나 HTTPS 링크를 추가하세요.
          </button>
        ) : (
          items.map((link, index) => (
            <UserQuickLinkCard
              key={link.id}
              link={link}
              index={index}
              total={items.length}
              busy={busy}
              onEdit={() => openEdit(link)}
              onDelete={() => {
                setError('')
                setEditor({ mode: 'delete', link })
              }}
              onMove={(direction) => void move(index, direction)}
            />
          ))
        )}
      </div>
      {actionError ? (
        <p role="alert" className="mt-2 px-1 text-xs text-of-danger">
          {actionError}{' '}
          <button type="button" className="font-medium underline" onClick={() => links.refetch()}>
            새로고침
          </button>
        </p>
      ) : null}

      <Dialog.Root
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setEditor(null)
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[var(--of-z-modal)] bg-black/30 of-overlay-enter motion-reduce:animate-none" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[calc(var(--of-z-modal)+1)] w-[min(28rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 rounded-of-lg border border-of-border bg-of-surface-raised p-4 shadow-[var(--of-shadow-popover)] focus:outline-none">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <Dialog.Title className="text-sm font-semibold">{editorTitle}</Dialog.Title>
                <Dialog.Description className="mt-1 text-xs leading-5 text-of-muted">
                  {editor?.mode === 'delete'
                    ? '이 링크는 내 Workspace Home에서만 삭제됩니다.'
                    : 'OneFlow 내부 경로(/로 시작) 또는 HTTPS 주소를 저장할 수 있습니다.'}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="빠른 링크 창 닫기"
                  disabled={busy}
                >
                  <X size={14} />
                </Button>
              </Dialog.Close>
            </div>

            {editor?.mode === 'delete' ? (
              <div className="mt-4">
                <p className="rounded-of border border-of-border bg-of-surface-2 px-3 py-2 text-sm font-medium">
                  {editor.link.title}
                </p>
                {error ? (
                  <p role="alert" className="mt-3 text-xs text-of-danger">
                    {error}{' '}
                    <button
                      type="button"
                      className="font-medium underline"
                      onClick={refreshAfterError}
                    >
                      서버 상태 새로고침
                    </button>
                  </p>
                ) : null}
                <div className="mt-4 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setEditor(null)}
                  >
                    취소
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={busy}
                    onClick={() => void confirmDelete()}
                  >
                    {remove.isPending ? '삭제 중…' : '삭제'}
                  </Button>
                </div>
              </div>
            ) : (
              <form className="mt-4 space-y-3" onSubmit={(event) => void submit(event)}>
                <label className="block text-xs font-medium">
                  이름
                  <Input
                    autoFocus
                    value={title}
                    maxLength={80}
                    placeholder="예: 팀 핸드북"
                    className="mt-1"
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </label>
                <label className="block text-xs font-medium">
                  주소
                  <Input
                    value={destination}
                    maxLength={2048}
                    placeholder="/projects 또는 https://docs.example.com"
                    className="mt-1"
                    onChange={(event) => setDestination(event.target.value)}
                  />
                </label>
                {error ? (
                  <p role="alert" className="text-xs text-of-danger">
                    {error}{' '}
                    <button
                      type="button"
                      className="font-medium underline"
                      onClick={refreshAfterError}
                    >
                      서버 상태 새로고침
                    </button>
                  </p>
                ) : null}
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setEditor(null)}
                  >
                    취소
                  </Button>
                  <Button type="submit" disabled={busy || !title.trim() || !destination.trim()}>
                    {create.isPending || update.isPending ? '저장 중…' : '저장'}
                  </Button>
                </div>
              </form>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  )
}
