import { RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useMembers } from '@/features/members/api'
import {
  type WorkItemDraft,
  type WorkItemDraftContent,
  useCreateWorkItemDraft,
  useDeleteWorkItemDraft,
  useSaveWorkItemDraft,
  useSubmitWorkItemDraft,
  useWorkItemDraft,
} from '@/features/work-item-drafts/api'
import { ApiError } from '@/lib/api'
import { useUnsavedLocationPromptWithBypass } from '@/lib/guards'

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

export function NewWorkPackageInline({
  projectId,
  canWrite = true,
}: {
  projectId: string
  canWrite?: boolean
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const draftId = searchParams.get('draft')
  const [subject, setSubject] = useState('')
  const [type, setType] = useState<WpType>('task')
  const [status, setStatus] = useState<WpStatus>('backlog')
  const [priority, setPriority] = useState<WpPriority>('none')
  const [assigneeId, setAssigneeId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [touched, setTouched] = useState(false)
  const hydratedDraft = useRef<string | null>(null)
  const allowNavigation = useRef(false)
  const closeButton = useRef<HTMLButtonElement>(null)
  const draftSession = useRef<string | null>(null)
  const draft = useWorkItemDraft(draftId)
  const create = useCreateWorkPackage(projectId)
  const createDraft = useCreateWorkItemDraft(projectId)
  const saveDraft = useSaveWorkItemDraft()
  const submitDraft = useSubmitWorkItemDraft(projectId)
  const deleteDraft = useDeleteWorkItemDraft()
  const members = useMembers(projectId)
  const statusLabel = useStatusLabels(projectId)
  const typeLabel = useTypeLabels(projectId)
  const open = searchParams.get('new') === '1'
  const sessionKey = open ? `${projectId}:${draftId ?? 'new'}` : null

  useEffect(() => {
    if (draftSession.current === sessionKey) return
    draftSession.current = sessionKey
    allowNavigation.current = false
  }, [sessionKey])

  useEffect(() => {
    if (!draft.data || hydratedDraft.current === draft.data.id) return
    hydratedDraft.current = draft.data.id
    setSubject(draft.data.content.subject)
    setType(draft.data.content.type)
    setStatus(draft.data.content.status)
    setPriority(draft.data.content.priority)
    setAssigneeId(draft.data.content.assignee_id ?? '')
    setDueDate(draft.data.content.due_date ?? '')
    setTouched(false)
  }, [draft.data])

  const content = (): WorkItemDraftContent => ({
    subject,
    type,
    status,
    priority,
    assignee_id: assigneeId || null,
    due_date: dueDate || null,
  })

  const baselineContent: WorkItemDraftContent = draft.data?.content ?? {
    subject: '',
    type: 'task',
    status: 'backlog',
    priority: 'none',
    assignee_id: null,
    due_date: null,
  }
  const hasUnsavedChanges =
    JSON.stringify(content()) !== JSON.stringify(baselineContent)

  const resetForm = () => {
    hydratedDraft.current = null
    setSubject('')
    setType('task')
    setStatus('backlog')
    setPriority('none')
    setAssigneeId('')
    setDueDate('')
    setTouched(false)
    create.reset()
    createDraft.reset()
    saveDraft.reset()
    submitDraft.reset()
    deleteDraft.reset()
  }

  const close = (confirmUnsaved: boolean) => {
    if (
      confirmUnsaved &&
      hasUnsavedChanges &&
      !window.confirm('저장하지 않은 입력을 버리고 닫을까요?')
    ) {
      return
    }
    allowNavigation.current = true
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('new')
      next.delete('draft')
      return next
    })
    resetForm()
  }

  const goToDrafts = () => {
    allowNavigation.current = true
    navigate('/drafts')
  }

  const isPending =
    create.isPending ||
    createDraft.isPending ||
    saveDraft.isPending ||
    submitDraft.isPending ||
    deleteDraft.isPending
  const mutationError =
    create.error ?? createDraft.error ?? saveDraft.error ?? submitDraft.error ?? deleteDraft.error
  const editError = saveDraft.error ?? submitDraft.error
  const conflictCurrent =
    editError instanceof ApiError && editError.status === 409
      ? ((editError.payload as { current?: WorkItemDraft })?.current ?? null)
      : null
  const errorMessage =
    mutationError instanceof ApiError && mutationError.status === 409
      ? '다른 창에서 초안이 변경되었습니다. 최신 내용을 다시 불러온 뒤 확인해 주세요.'
      : mutationError instanceof ApiError && mutationError.status === 403
        ? '이 프로젝트에 작업을 저장할 권한이 없습니다.'
        : '요청을 완료하지 못했습니다. 입력값과 연결 상태를 확인해 주세요.'

  useUnsavedLocationPromptWithBypass(
    open && hasUnsavedChanges,
    '저장하지 않은 작업 입력이 있습니다. 나가시겠습니까?',
    allowNavigation,
  )

  useEffect(() => {
    if (!open) return
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      closeButton.current?.click()
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [open])

  if (!open) return null

  const save = () => {
    if (isPending || conflictCurrent) return
    if (draft.data) {
      saveDraft.mutate(
        { draft: draft.data, content: content() },
        { onSuccess: goToDrafts },
      )
      return
    }
    createDraft.mutate(content(), { onSuccess: goToDrafts })
  }

  const submit = () => {
    setTouched(true)
    const trimmed = subject.trim()
    if (!trimmed || isPending || conflictCurrent) return
    const finalContent = { ...content(), subject: trimmed }
    if (draft.data) {
      submitDraft.mutate(
        { draft: draft.data, content: finalContent },
        { onSuccess: () => close(false) },
      )
      return
    }
    create.mutate(finalContent, { onSuccess: () => close(false) })
  }

  if (draftId && draft.isPending) {
    return (
      <section
        aria-label="작업 초안 불러오는 중"
        className="border-b border-of-border bg-of-surface-2/55 px-4 py-5"
      >
        <div className="mx-auto max-w-6xl animate-pulse space-y-3" role="status">
          <div className="h-4 w-28 rounded-of bg-of-border" />
          <div className="h-8 w-full rounded-of bg-of-border/70" />
        </div>
      </section>
    )
  }

  if (draftId && draft.isError) {
    return (
      <section
        aria-label="작업 초안 불러오기 실패"
        className="border-b border-of-border bg-of-surface-2/55 px-4 py-5"
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <p role="alert" className="text-sm font-medium text-of-danger">
            초안을 열 수 없습니다. 삭제되었거나 프로젝트 접근 권한이 변경되었을 수 있습니다.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void draft.refetch()}>
              <RefreshCw /> 다시 시도
            </Button>
            <Button variant="ghost" onClick={() => navigate('/drafts')}>
              초안 목록
            </Button>
          </div>
        </div>
      </section>
    )
  }

  if (draft.data && draft.data.project_id !== projectId) {
    return (
      <section
        aria-label="작업 초안 프로젝트 경로 오류"
        className="border-b border-of-border bg-of-surface-2/55 px-4 py-5"
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <p role="alert" className="text-sm font-medium text-of-danger">
            이 초안은 현재 URL의 프로젝트에 속하지 않습니다.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              allowNavigation.current = true
              navigate(
                `/projects/${draft.data.project_id}/work-packages?new=1&draft=${draft.data.id}`,
              )
            }}
          >
            올바른 프로젝트에서 열기
          </Button>
        </div>
      </section>
    )
  }

  if (draft.data && !canWrite) {
    return (
      <section
        aria-label="읽기 전용 작업 초안"
        className="border-b border-of-border bg-of-surface-2/55 px-4 py-5"
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <p role="status" className="text-sm font-medium text-of-muted">
            읽기 전용 또는 보관된 프로젝트의 초안은 계속 편집할 수 없습니다.
          </p>
          <Button variant="outline" onClick={goToDrafts}>
            초안 목록에서 관리
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section
      aria-label={draft.data ? '작업 초안 이어쓰기' : '새 작업 생성'}
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
          <h2 className="text-sm font-semibold text-of-fg">
            {draft.data ? '작업 초안 이어쓰기' : '새 작업 생성'}
          </h2>
          <span className="w-fit rounded-full bg-of-surface px-2 py-0.5 text-[11px] font-medium text-of-muted">
            {draft.data ? '서버에 저장된 초안' : '제목 필수'}
          </span>
        </div>

        <div className="grid gap-2 lg:grid-cols-[minmax(16rem,1.5fr)_repeat(5,minmax(8rem,1fr))]">
          <label className="space-y-1">
            <span className="text-xs font-medium text-of-muted">작업 제목</span>
            <Input
              autoFocus
              value={subject}
              onChange={(event) => {
                setSubject(event.target.value)
                if (touched) setTouched(false)
              }}
              placeholder="무엇을 해야 하나요?"
              aria-label="작업 제목"
              maxLength={255}
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-of-muted">타입</span>
            <Select
              aria-label="타입"
              value={type}
              onChange={(event) => setType(event.target.value as WpType)}
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
              onChange={(event) => setStatus(event.target.value as WpStatus)}
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
              onChange={(event) => setPriority(event.target.value as WpPriority)}
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
              onChange={(event) => setAssigneeId(event.target.value)}
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
              onChange={(event) => setDueDate(event.target.value)}
            />
          </label>
        </div>

        {conflictCurrent ? (
          <div
            role="alert"
            className="flex flex-col gap-2 border-y border-of-border bg-of-surface px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="font-medium text-of-danger">다른 창에서 초안이 변경되었습니다.</p>
              <p className="mt-0.5 truncate text-of-muted">
                서버 최신 버전 {conflictCurrent.version}: {' '}
                {conflictCurrent.content.subject.trim() || '제목 없는 초안'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={() =>
                  saveDraft.mutate(
                    { draft: conflictCurrent, content: content() },
                    { onSuccess: goToDrafts },
                  )
                }
              >
                내 입력으로 다시 저장
              </Button>
              <Button
                size="sm"
                type="button"
                variant="ghost"
                onClick={goToDrafts}
              >
                서버 초안 유지
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-5 text-xs">
            {touched && !subject.trim() ? (
              <p role="alert" className="text-of-danger">
                작업을 만들려면 제목을 입력하세요. 빈 제목으로 초안 저장은 가능합니다.
              </p>
            ) : mutationError && !conflictCurrent ? (
              <p role="alert" className="text-of-danger">
                {errorMessage}
              </p>
            ) : isPending ? (
              <p role="status" className="text-of-muted">
                변경사항을 처리하는 중…
              </p>
            ) : draft.data ? (
              <p className="text-of-muted">마지막 저장 버전 {draft.data.version}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              size="sm"
              type="submit"
              disabled={isPending || Boolean(conflictCurrent) || !subject.trim()}
            >
              작업 만들기
            </Button>
            <Button
              size="sm"
              type="button"
              variant="outline"
              disabled={isPending || Boolean(conflictCurrent)}
              onClick={save}
            >
              초안 저장
            </Button>
            {draft.data ? (
              <Button
                size="sm"
                type="button"
                variant="danger"
                disabled={isPending}
                onClick={() => {
                  if (!window.confirm('이 초안을 삭제할까요?')) return
                  deleteDraft.mutate(
                    { id: draft.data.id, expectedVersion: draft.data.version },
                    { onSuccess: () => close(false) },
                  )
                }}
              >
                <Trash2 /> 초안 삭제
              </Button>
            ) : null}
            <Button
              size="sm"
              type="button"
              variant="ghost"
              ref={closeButton}
              disabled={isPending}
              onClick={() => close(true)}
            >
              {draft.data ? '저장하지 않고 닫기' : '입력 지우고 닫기'}
            </Button>
          </div>
        </div>
      </form>
    </section>
  )
}
