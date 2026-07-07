import { ArrowRightCircle, ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { Suspense, lazy, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api'
import { confirmDestructive, useUnsavedChangesPrompt } from '@/lib/guards'

import {
  conflictOf,
  useAddActionItem,
  useConvertActionItem,
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
  const del = useDeleteMeeting(projectId)
  const addItem = useAddActionItem(meetingId)
  const convertItem = useConvertActionItem(meetingId)
  const toggleItem = useToggleActionItem(meetingId)
  const deleteItem = useDeleteActionItem(meetingId)

  const [title, setTitle] = useState('')
  const [scheduledOn, setScheduledOn] = useState('')
  const [agenda, setAgenda] = useState('')
  const [minutes, setMinutes] = useState('')
  const [newItem, setNewItem] = useState('')
  useEffect(() => {
    if (mtg) {
      setTitle(mtg.title)
      setScheduledOn(mtg.scheduled_on ?? '')
      setAgenda(mtg.agenda ?? '')
      setMinutes(mtg.minutes ?? '')
    }
  }, [mtg])

  const dirty =
    !!mtg &&
    !update.isPending &&
    !del.isPending &&
    (title !== mtg.title ||
      scheduledOn !== (mtg.scheduled_on ?? '') ||
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
          aria-label="회의 제목"
          className="flex-1 text-sm font-medium"
        />
        <Input
          type="date"
          value={scheduledOn}
          onChange={(e) => setScheduledOn(e.target.value)}
          aria-label="회의 일정"
          className="w-40"
        />
        <Button size="sm" disabled={!title.trim() || update.isPending} onClick={save}>
          저장
        </Button>
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
      </div>

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
          <RichTextEditor value={mtg.agenda ?? ''} ariaLabel="안건" onSave={setAgenda} />
        </Suspense>
      </section>

      <section className="space-y-1.5">
        <span className="text-xs font-medium text-of-muted">회의록</span>
        <Suspense fallback={<div className="h-32 rounded-of border border-of-border bg-of-surface-2/40" />}>
          <RichTextEditor value={mtg.minutes ?? ''} ariaLabel="회의록" onSave={setMinutes} />
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
                ) : (
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
                )}
                <button
                  type="button"
                  aria-label="액션 아이템 삭제"
                  className="shrink-0 rounded-of p-1 text-of-muted hover:bg-of-surface-2 hover:text-of-danger"
                  onClick={() => deleteItem.mutate(item.id)}
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-of-muted">액션 아이템이 없습니다.</p>
        )}
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
      </section>

      <p className="text-right text-[11px] text-of-muted">v{mtg.version}</p>
    </div>
  )
}
