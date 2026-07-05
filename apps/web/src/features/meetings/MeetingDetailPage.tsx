import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { Suspense, lazy, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api'

import {
  useAddActionItem,
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

  if (isPending) return <ListSkeleton />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />

  const save = () => {
    const trimmed = title.trim()
    if (!trimmed) return
    update.mutate({
      meetingId: mtg.id,
      expected_version: mtg.version,
      title: trimmed,
      scheduled_on: scheduledOn || null,
      agenda: agenda === '' ? null : agenda,
      minutes: minutes === '' ? null : minutes,
    })
  }

  const conflict = update.error instanceof ApiError && update.error.status === 409

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
          onClick={() =>
            del.mutate(mtg.id, {
              onSuccess: () => navigate(`/projects/${projectId}/meetings`),
            })
          }
        >
          <Trash2 size={15} />
        </button>
      </div>

      {conflict ? (
        <p className="text-xs text-of-danger">
          다른 사용자가 먼저 수정했습니다. 최신 내용을 불러왔으니 다시 저장하세요.
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
