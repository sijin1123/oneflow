import * as Dialog from '@radix-ui/react-dialog'
import { Plus, RefreshCw, RotateCcw, Save, Trash2, X } from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import {
  type WorkspaceSavedView,
  type WorkspaceSavedViewParams,
  useCreateWorkspaceSavedView,
  useDeleteWorkspaceSavedView,
  useUpdateWorkspaceSavedView,
  useWorkspaceSavedViews,
} from './workspaceSavedViewsApi'

export function WorkspaceSavedViewsControls({
  activeViewId,
  currentParams,
  onApply,
  onDelete,
}: {
  activeViewId: string | null
  currentParams: WorkspaceSavedViewParams
  onApply: (view: WorkspaceSavedView) => void
  onDelete: () => void
}) {
  const views = useWorkspaceSavedViews()
  const create = useCreateWorkspaceSavedView()
  const update = useUpdateWorkspaceSavedView()
  const remove = useDeleteWorkspaceSavedView()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const active = views.data?.items.find((view) => view.id === activeViewId) ?? null
  const dirty = active ? !sameParams(active.params, currentParams) : false
  const busy = create.isPending || update.isPending || remove.isPending
  const atLimit = (views.data?.total ?? 0) >= 50

  useEffect(() => {
    if (!activeViewId || !views.data) return
    if (!views.data.items.some((view) => view.id === activeViewId)) onDelete()
  }, [activeViewId, onDelete, views.data])

  const optionLabel = useMemo(() => {
    if (views.isPending) return '불러오는 중'
    if (views.isError) return '저장 뷰 불러오기 실패'
    if (!views.data?.items.length) return '저장된 뷰 없음'
    return '저장 뷰 선택'
  }, [views.data?.items.length, views.isError, views.isPending])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const cleanName = name.trim()
    if (!cleanName) return
    setError('')
    try {
      const created = await create.mutateAsync({ name: cleanName, params: currentParams })
      onApply(created)
      setName('')
      setDialogOpen(false)
      setNotice('저장 뷰를 만들었습니다.')
    } catch (cause) {
      setError(messageFrom(cause, '저장 뷰를 만들지 못했습니다.'))
    }
  }

  const updateActive = async () => {
    if (!active || !dirty) return
    setError('')
    try {
      const saved = await update.mutateAsync({
        id: active.id,
        expected_version: active.version,
        params: currentParams,
      })
      onApply(saved)
      setNotice('현재 상태로 저장 뷰를 갱신했습니다.')
    } catch (cause) {
      setError(messageFrom(cause, '저장 뷰를 갱신하지 못했습니다.'))
    }
  }

  const deleteActive = async () => {
    if (!active || !window.confirm(`"${active.name}" 뷰를 삭제할까요?`)) return
    setError('')
    try {
      await remove.mutateAsync({ id: active.id, expectedVersion: active.version })
      onDelete()
      setNotice('저장 뷰를 삭제했습니다.')
    } catch (cause) {
      setError(messageFrom(cause, '저장 뷰를 삭제하지 못했습니다.'))
    }
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      <select
        aria-label="저장 뷰"
        value={active?.id ?? ''}
        disabled={views.isPending || views.isError || !views.data?.items.length || busy}
        className="h-8 max-w-44 rounded-of border border-of-border bg-of-surface px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus disabled:opacity-60"
        onChange={(event) => {
          const view = views.data?.items.find((item) => item.id === event.target.value)
          if (view) {
            setError('')
            setNotice('')
            onApply(view)
          }
        }}
      >
        <option value="">{optionLabel}</option>
        {views.data?.items.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}
      </select>

      {views.isError ? (
        <Button type="button" variant="outline" size="icon" aria-label="저장 뷰 다시 불러오기" onClick={() => views.refetch()}>
          <RefreshCw size={13} />
        </Button>
      ) : null}

      {active ? (
        <>
          {dirty ? (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onApply(active)}>
              <RotateCcw size={13} /> 되돌리기
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" disabled={!dirty || busy} onClick={updateActive}>
            <Save size={13} /> {dirty ? '갱신' : '저장됨'}
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label="현재 저장 뷰 삭제" disabled={busy} onClick={deleteActive}>
            <Trash2 size={13} />
          </Button>
        </>
      ) : null}

      <Dialog.Root open={dialogOpen} onOpenChange={(open) => {
        if (busy) return
        setDialogOpen(open)
        if (open) setError('')
      }}>
        <Dialog.Trigger asChild>
          <Button type="button" size="sm" disabled={atLimit || busy} title={atLimit ? '저장 뷰는 50개까지 만들 수 있습니다.' : undefined}>
            <Plus size={13} /> Add view
          </Button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[var(--of-z-modal)] bg-black/30 of-overlay-enter motion-reduce:animate-none" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[calc(var(--of-z-modal)+1)] w-[min(28rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 rounded-of-lg border border-of-border bg-of-surface-raised p-4 shadow-[var(--of-shadow-popover)] focus:outline-none">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <Dialog.Title className="text-sm font-semibold">작업영역 뷰 저장</Dialog.Title>
                <Dialog.Description className="mt-1 text-xs text-of-muted">
                  현재 범위, 필터, 정렬, 레이아웃과 밀도를 내 뷰로 저장합니다.
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="닫기"><X size={14} /></Button>
              </Dialog.Close>
            </div>
            <form className="mt-4 space-y-3" onSubmit={submit}>
              <label className="block text-xs font-medium">
                뷰 이름
                <Input
                  autoFocus
                  value={name}
                  maxLength={120}
                  placeholder="예: 내게 배정된 긴급 작업"
                  className="mt-1"
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              {error ? <p role="alert" className="text-xs text-of-danger">{error}</p> : null}
              <div className="flex justify-end gap-2">
                <Dialog.Close asChild><Button type="button" variant="outline" disabled={busy}>취소</Button></Dialog.Close>
                <Button type="submit" disabled={!name.trim() || create.isPending}>
                  {create.isPending ? '저장 중…' : '저장'}
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {error && !dialogOpen ? <span role="alert" className="text-[11px] text-of-danger">{error}</span> : null}
      {notice ? <span role="status" className="sr-only">{notice}</span> : null}
    </div>
  )
}

function sameParams(left: WorkspaceSavedViewParams, right: WorkspaceSavedViewParams) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function messageFrom(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback
}
