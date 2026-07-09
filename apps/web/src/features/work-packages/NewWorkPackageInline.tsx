import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useMembers } from '@/features/members/api'

import { useCreateWorkPackage } from './api'
import {
  PRIORITY_LABELS,
  WP_PRIORITIES,
  WP_STATUSES,
  WP_TYPES,
  type WpPriority,
  type WpStatus,
  type WpType,
} from './types'
import { useStatusLabels } from './useStatusLabels'
import { useTypeLabels } from './useTypeLabels'

/* Project-scoped creation composer, opened by the topbar "새 작업" button (?new=1). */
export function NewWorkPackageInline({ projectId }: { projectId: string }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [subject, setSubject] = useState('')
  const [type, setType] = useState<WpType>('task')
  const [status, setStatus] = useState<WpStatus>('backlog')
  const [priority, setPriority] = useState<WpPriority>('none')
  const [assigneeId, setAssigneeId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [touched, setTouched] = useState(false)
  const create = useCreateWorkPackage(projectId)
  const members = useMembers(projectId)
  const statusLabel = useStatusLabels(projectId)
  const typeLabel = useTypeLabels(projectId)

  if (searchParams.get('new') !== '1') return null

  const close = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('new')
      return next
    })
    setSubject('')
    setType('task')
    setStatus('backlog')
    setPriority('none')
    setAssigneeId('')
    setDueDate('')
    setTouched(false)
    create.reset()
  }

  const submit = () => {
    setTouched(true)
    const trimmed = subject.trim()
    if (!trimmed || create.isPending) return
    create.mutate(
      {
        subject: trimmed,
        type,
        status,
        priority,
        assignee_id: assigneeId || null,
        due_date: dueDate || null,
      },
      {
        onSuccess: close,
      },
    )
  }

  return (
    <section
      aria-label="새 작업 생성"
      className="border-b border-of-border bg-of-surface-2/55 px-4 py-3"
    >
      <form
        className="mx-auto grid max-w-6xl gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-of-fg">새 작업 생성</h2>
          </div>
          <span className="w-fit rounded-full bg-of-surface px-2 py-0.5 text-[11px] font-medium text-of-muted">
            제목 필수
          </span>
        </div>

        <div className="grid gap-2 lg:grid-cols-[minmax(16rem,1.5fr)_repeat(5,minmax(8rem,1fr))]">
          <label className="space-y-1">
            <span className="text-xs font-medium text-of-muted">작업 제목</span>
            <Input
              autoFocus
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value)
                if (touched) create.reset()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') close()
              }}
              placeholder="무엇을 해야 하나요?"
              aria-label="작업 제목"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-of-muted">타입</span>
            <Select
              aria-label="타입"
              value={type}
              onChange={(e) => setType(e.target.value as WpType)}
            >
              {WP_TYPES.map((value) => (
                <option key={value} value={value}>
                  {typeLabel(value)}
                </option>
              ))}
            </Select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-of-muted">상태</span>
            <Select
              aria-label="상태"
              value={status}
              onChange={(e) => setStatus(e.target.value as WpStatus)}
            >
              {WP_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {statusLabel(value)}
                </option>
              ))}
            </Select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-of-muted">우선순위</span>
            <Select
              aria-label="우선순위"
              value={priority}
              onChange={(e) => setPriority(e.target.value as WpPriority)}
            >
              {WP_PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {PRIORITY_LABELS[value]}
                </option>
              ))}
            </Select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-of-muted">담당자</span>
            <Select
              aria-label="담당자"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
            >
              <option value="">미배정</option>
              {(members.data?.items ?? []).map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.display_name}
                </option>
              ))}
            </Select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-of-muted">기한</span>
            <Input
              type="date"
              aria-label="기한"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </label>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-5 text-xs">
            {touched && !subject.trim() ? (
              <p role="alert" className="text-of-danger">
                제목을 입력하세요.
              </p>
            ) : create.isError ? (
              <p role="alert" className="text-of-danger">
                생성 실패 — 입력값을 확인해 주세요.
              </p>
            ) : create.isPending ? (
              <p role="status" className="text-of-muted">
                생성 중…
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" type="submit" disabled={create.isPending || !subject.trim()}>
              작업 만들기
            </Button>
            <Button size="sm" type="button" variant="ghost" onClick={close}>
              취소
            </Button>
          </div>
        </div>
      </form>
    </section>
  )
}
