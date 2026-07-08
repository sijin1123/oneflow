import { ArrowRightCircle, ArrowLeft, BookmarkPlus, CalendarPlus, Plus, Trash2 } from 'lucide-react'
import { Suspense, lazy, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { ReadOnlyNotice } from '@/components/shell/ReadOnlyNotice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api'
import { useCanWrite } from '@/features/members/useCanWrite'
import { confirmDestructive, useUnsavedChangesPrompt } from '@/lib/guards'

import {
  conflictOf,
  useAddActionItem,
  useConvertActionItem,
  useCreateFollowUp,
  useCreateMeetingTemplate,
  useDeleteActionItem,
  useDeleteMeeting,
  useMeeting,
  useToggleActionItem,
  useUpdateMeeting,
} from './api'

const RichTextEditor = lazy(() =>
  import('@/components/ui/rich-text-editor').then((m) => ({ default: m.RichTextEditor })),
)

export function MeetingDetailPage() {
  const { projectId, meetingId } = useParams() as { projectId: string; meetingId: string }
  const navigate = useNavigate()
  const { data: mtg, isPending, isError, error, refetch } = useMeeting(meetingId)
  const update = useUpdateMeeting(projectId)
  const canWrite = useCanWrite(projectId)
  const del = useDeleteMeeting(projectId)
  const followUp = useCreateFollowUp(projectId)
  const saveTemplate = useCreateMeetingTemplate(projectId)
  const addItem = useAddActionItem(meetingId)
  const convertItem = useConvertActionItem(meetingId)
  const toggleItem = useToggleActionItem(meetingId)
  const deleteItem = useDeleteActionItem(meetingId)

  const [title, setTitle] = useState('')
  const [scheduledOn, setScheduledOn] = useState('')
  const [agenda, setAgenda] = useState('')
  const [minutes, setMinutes] = useState('')
  const [recurrence, setRecurrence] = useState('')
  const [newItem, setNewItem] = useState('')
  useEffect(() => {
    if (mtg) {
      setTitle(mtg.title)
      setScheduledOn(mtg.scheduled_on ?? '')
      setAgenda(mtg.agenda ?? '')
      setMinutes(mtg.minutes ?? '')
      setRecurrence(mtg.recurrence ?? '')
    }
  }, [mtg])

  const dirty =
    !!mtg &&
    !update.isPending &&
    !del.isPending &&
    (title !== mtg.title ||
      scheduledOn !== (mtg.scheduled_on ?? '') ||
      recurrence !== (mtg.recurrence ?? '') ||
      agenda !== (mtg.agenda ?? '') ||
      minutes !== (mtg.minutes ?? ''))
  useUnsavedChangesPrompt(dirty, '저장되지 않은 변경이 있습니다. 나가시겠습니까?')

  if (isPending) return <ListSkeleton />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />

  const conflict = conflictOf(update.error)

  const save = () => {
    const trimmed = title.trim()
    if (!trimmed || update.isPending) return
    update.mutate({
      meetingId: mtg.id,
      // After a conflict, retry against the server version so the preserved draft
      // overwrites it; otherwise the normal optimistic token.
      expected_version: conflict ? conflict.current.version : mtg.version,
      title: trimmed,
      scheduled_on: scheduledOn || null,
      recurrence: recurrence || null,
      agenda: agenda === '' ? null : agenda,
      minutes: minutes === '' ? null : minutes,
    })
  }

  const otherError =
    update.error instanceof ApiError && update.error.status !== 409 ? update.error.message : null

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-3 overflow-y-auto p-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="회의 목록"
          className="rounded-of p-1 text-of-muted hover:bg-of-surface-2"
          onClick={() => navigate(`/projects/${projectId}/meetings`)}
        >
          <ArrowLeft size={16} />
        </button>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          readOnly={!canWrite}
          aria-label="회의 제목"
          className="flex-1 text-sm font-medium"
        />
        <Input
          type="date"
          value={scheduledOn}
          onChange={(e) => setScheduledOn(e.target.value)}
          readOnly={!canWrite}
          aria-label="회의 일정"
          className="w-40"
        />
        <select
          aria-label="반복 주기"
          title="반복은 일정이 지나면 다음 회차를 자동 생성합니다. 매월 반복은 말일 초과 시 그 달 말일로 조정되며 이후 그 날짜가 기준이 됩니다."
          className="h-8 w-28 rounded-of border border-of-border bg-of-surface px-2 text-xs"
          value={recurrence}
          disabled={!canWrite || !scheduledOn}
          onChange={(e) => setRecurrence(e.target.value)}
        >
          <option value="">반복 안 함</option>
          <option value="weekly">매주</option>
          <option value="biweekly">격주</option>
          <option value="monthly">매월</option>
        </select>
        {canWrite ? (
        <>
        <Button size="sm" disabled={!title.trim() || update.isPending} onClick={save}>
          저장
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={followUp.isPending}
          title="아젠다와 미결 액션 아이템을 복사한 다음 회차를 만듭니다 (원본과의 연결은 저장되지 않음)"
          onClick={() => {
            const openCount = mtg.action_items.filter((i) => !i.done && !i.converted_wp_id).length
            if (
              !confirmDestructive(
                `후속 회의를 만들까요?\n아젠다와 미결 액션 아이템 ${openCount}건이 복사됩니다.`,
              )
            ) {
              return
            }
            followUp.mutate(mtg.id, {
              onSuccess: (created) => navigate(`/projects/${projectId}/meetings/${created.id}`),
            })
          }}
        >
          <CalendarPlus size={14} /> 후속 회의 만들기
        </Button>
        {followUp.isError ? (
          <span className="text-xs text-of-danger">
            {followUp.error instanceof ApiError && followUp.error.status === 409
              ? '같은 제목·날짜의 회의가 이미 있습니다.'
              : '후속 회의 생성 실패'}
          </span>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          disabled={saveTemplate.isPending}
          title="현재 저장된 아젠다를 이름 있는 템플릿으로 등록합니다"
          onClick={() => {
            const name = window.prompt('템플릿 이름을 입력하세요', `${mtg.title} 아젠다`)
            if (!name || !name.trim()) return
            saveTemplate.mutate({ name: name.trim(), from_meeting_id: mtg.id })
          }}
        >
          <BookmarkPlus size={14} /> 템플릿으로 저장
        </Button>
        {saveTemplate.isError ? (
          <span className="text-xs text-of-danger">
            {saveTemplate.error instanceof ApiError && saveTemplate.error.status === 409
              ? '같은 이름의 템플릿이 이미 있습니다.'
              : '템플릿 저장 실패'}
          </span>
        ) : null}
        <button
          type="button"
          aria-label="회의 삭제"
          className="rounded-of p-1.5 text-of-muted hover:bg-of-surface-2 hover:text-of-danger"
          onClick={() => {
            if (!confirmDestructive('이 회의를 삭제할까요? 되돌릴 수 없습니다.')) return
            del.mutate(mtg.id, {
              onSuccess: () => navigate(`/projects/${projectId}/meetings`),
            })
          }}
        >
          <Trash2 size={15} />
        </button>
        </>
        ) : null}
      </div>
      {!canWrite ? <ReadOnlyNotice /> : null}

      {mtg.follow_up_source_id ? (
        <p className="text-[11px] text-of-muted">
          ←{' '}
          <button
            type="button"
            className="text-of-accent hover:underline"
            onClick={() =>
              navigate(`/projects/${projectId}/meetings/${mtg.follow_up_source_id}`)
            }
          >
            '{mtg.follow_up_source_title ?? '원본 회의'}'
          </button>{' '}
          의 후속 회의입니다
        </p>
      ) : null}

      {conflict ? (
        <p role="alert" className="text-xs text-of-danger">
          다른 사용자가 먼저 수정했습니다. 작성 중인 내용은 유지했으니, 다시 저장하면 최신 내용
          위에 덮어씁니다.
        </p>
      ) : null}
      {otherError ? (
        <p role="alert" className="text-xs text-of-danger">
          저장하지 못했습니다: {otherError}
        </p>
      ) : null}

      <section className="space-y-1.5">
        <span className="text-xs font-medium text-of-muted">안건</span>
        <Suspense fallback={<div className="h-32 rounded-of border border-of-border bg-of-surface-2/40" />}>
          <RichTextEditor value={mtg.agenda ?? ''} ariaLabel="안건" editable={canWrite} onSave={setAgenda} />
        </Suspense>
      </section>

      <section className="space-y-1.5">
        <span className="text-xs font-medium text-of-muted">회의록</span>
        <Suspense fallback={<div className="h-32 rounded-of border border-of-border bg-of-surface-2/40" />}>
          <RichTextEditor value={mtg.minutes ?? ''} ariaLabel="회의록" editable={canWrite} onSave={setMinutes} />
        </Suspense>
      </section>

      <section className="space-y-2 rounded-of border border-of-border bg-of-surface p-3">
        <span className="text-xs font-medium">액션 아이템</span>
        {mtg.action_items.length > 0 ? (
          <ul className="space-y-1">
            {mtg.action_items.map((item) => (
              <li key={item.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={item.done}
                  disabled={!canWrite}
                  aria-label={`${item.description} 완료`}
                  onChange={(e) => toggleItem.mutate({ id: item.id, done: e.target.checked })}
                />
                <span className={`min-w-0 flex-1 truncate ${item.done ? 'text-of-muted line-through' : ''}`}>
                  {item.description}
                </span>
                {item.converted_wp_id ? (
                  <button
                    type="button"
                    className="shrink-0 text-[11px] text-of-accent hover:underline"
                    onClick={() =>
                      navigate(`/projects/${projectId}/work-packages?wp=${item.converted_wp_id}`)
                    }
                  >
                    작업 보기
                  </button>
                ) : canWrite ? (
                  <button
                    type="button"
                    aria-label={`${item.description} 작업으로 전환`}
                    title="작업으로 전환"
                    disabled={convertItem.isPending}
                    className="shrink-0 rounded-of p-1 text-of-muted hover:bg-of-surface-2 hover:text-of-accent"
                    onClick={() => convertItem.mutate(item.id)}
                  >
                    <ArrowRightCircle size={13} />
                  </button>
                ) : null}
                {canWrite ? (
                  <button
                    type="button"
                    aria-label="액션 아이템 삭제"
                    className="shrink-0 rounded-of p-1 text-of-muted hover:bg-of-surface-2 hover:text-of-danger"
                    onClick={() => deleteItem.mutate(item.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-of-muted">액션 아이템이 없습니다.</p>
        )}
        {canWrite ? (
        <div className="flex items-center gap-2">
          <Input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="액션 아이템 추가"
            aria-label="새 액션 아이템"
            className="h-8 flex-1 text-xs"
          />
          <Button
            size="sm"
            disabled={!newItem.trim() || addItem.isPending}
            onClick={() =>
              addItem.mutate(
                { description: newItem.trim() },
                { onSuccess: () => setNewItem('') },
              )
            }
          >
            <Plus size={13} /> 추가
          </Button>
        </div>
        ) : null}
      </section>

      <p className="text-right text-[11px] text-of-muted">v{mtg.version}</p>
    </div>
  )
}
