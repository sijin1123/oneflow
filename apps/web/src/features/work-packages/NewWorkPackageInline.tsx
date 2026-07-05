import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { useCreateWorkPackage } from './api'

/* Minimal inline creation row, opened by the topbar "새 작업" button (?new=1). */
export function NewWorkPackageInline({ projectId }: { projectId: string }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [subject, setSubject] = useState('')
  const create = useCreateWorkPackage(projectId)

  if (searchParams.get('new') !== '1') return null

  const close = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('new')
      return next
    })
    setSubject('')
  }

  const submit = () => {
    const trimmed = subject.trim()
    // Guard the Enter-key path too (the button is disabled while pending, but the
    // keydown handler is not) so a double Enter can't create duplicate work packages.
    if (!trimmed || create.isPending) return
    create.mutate(
      { subject: trimmed },
      {
        onSuccess: close,
      },
    )
  }

  return (
    <div className="flex items-center gap-2 border-b border-of-border bg-of-surface-2/60 px-4 py-2">
      <Input
        autoFocus
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') close()
        }}
        placeholder="새 작업 제목을 입력하고 Enter"
        aria-label="새 작업 제목"
        className="max-w-md"
      />
      <Button size="sm" onClick={submit} disabled={create.isPending || !subject.trim()}>
        추가
      </Button>
      <Button size="sm" variant="ghost" onClick={close}>
        취소
      </Button>
      {create.isError ? (
        <span className="text-xs text-of-danger">생성 실패 — 입력값을 확인해 주세요.</span>
      ) : null}
    </div>
  )
}
