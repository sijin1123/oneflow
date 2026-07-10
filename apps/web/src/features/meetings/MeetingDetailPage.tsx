import {
  ArrowLeft,
  ArrowRightCircle,
  BookmarkPlus,
  CalendarClock,
  CalendarPlus,
  CheckSquare,
  ClipboardList,
  Plus,
  Save,
  Trash2,
} from 'lucide-react'
import { Suspense, lazy, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { ReadOnlyNotice } from '@/components/shell/ReadOnlyNotice'
import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useCanWrite } from '@/features/members/useCanWrite'
import { useProject } from '@/features/projects/api'
import { ApiError } from '@/lib/api'
import { formatDateTime } from '@/lib/datetime'
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

const RECURRENCE_LABELS: Record<string, string> = {
  weekly: '매주',
  biweekly: '격주',
  monthly: '매월',
}

export function MeetingDetailPage() {
  const { projectId, meetingId } = useParams() as { projectId: string; meetingId: string }
  const navigate = useNavigate()
  const { data: mtg, isPending, isError, error, refetch } = useMeeting(meetingId)
  const project = useProject(projectId)
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
  const openActionCount = mtg.action_items.filter((i) => !i.done && !i.converted_wp_id).length
  const convertedCount = mtg.action_items.filter((i) => i.converted_wp_id).length

  const save = () => {
    const trimmed = title.trim()
    if (!trimmed || update.isPending) return
    update.mutate({
      meetingId: mtg.id,
      expected_version: conflict ? conflict.current.version : mtg.version,
      title: trimmed,
      scheduled_on: scheduledOn || null,
      recurrence: recurrence || null,
      agenda: agenda === '' ? null : agenda,
      minutes: minutes === '' ? null : minutes,
    })
  }

  const createFollowUp = () => {
    if (
      !confirmDestructive(
        `후속 회의를 만들까요?\n아젠다와 미결 액션 아이템 ${openActionCount}건이 복사됩니다.`,
      )
    ) {
      return
    }
    followUp.mutate(mtg.id, {
      onSuccess: (created) => navigate(`/projects/${projectId}/meetings/${created.id}`),
    })
  }

  const createTemplate = () => {
    const name = window.prompt('템플릿 이름을 입력하세요', `${mtg.title} 아젠다`)
    if (!name || !name.trim()) return
    saveTemplate.mutate({ name: name.trim(), from_meeting_id: mtg.id })
  }

  const remove = () => {
    if (!confirmDestructive('이 회의를 삭제할까요? 되돌릴 수 없습니다.')) return
    del.mutate(mtg.id, {
      onSuccess: () => navigate(`/projects/${projectId}/meetings`),
    })
  }

  const otherError =
    update.error instanceof ApiError && update.error.status !== 409 ? update.error.message : null

  return (
    <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-4 px-4 py-5 sm:px-6">
      <header className="border-b border-of-border pb-4">
        <div className="mb-3 flex min-w-0 items-center gap-2">
          <button
            type="button"
            aria-label="회의 목록"
            className="rounded-of p-1.5 text-of-muted hover:bg-of-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
            onClick={() => navigate(`/projects/${projectId}/meetings`)}
          >
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase text-of-muted">Meeting detail</p>
            <p className="truncate text-xs text-of-muted">{project.data?.name ?? '프로젝트'}</p>
          </div>
          <div className="hidden shrink-0 flex-wrap items-center gap-2 sm:flex">
            <Badge variant={canWrite ? 'accent' : 'outline'}>
              {canWrite ? '편집 가능' : '읽기 전용'}
            </Badge>
            <Badge variant="outline">액션 {mtg.action_items.length}</Badge>
          </div>
        </div>

        <div className="grid min-w-0 gap-2 xl:grid-cols-[minmax(0,1fr)_10rem_8rem_auto] xl:items-center">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            readOnly={!canWrite}
            aria-label="회의 제목"
            className="h-10 min-w-0 text-base font-semibold"
          />
          <Input
            type="date"
            value={scheduledOn}
            onChange={(e) => setScheduledOn(e.target.value)}
            readOnly={!canWrite}
            aria-label="회의 일정"
            className="h-10 min-w-0"
          />
          <Select
            aria-label="반복 주기"
            title="반복은 일정이 지나면 다음 회차를 자동 생성합니다."
            className="h-10 min-w-0 text-xs"
            value={recurrence}
            disabled={!canWrite || !scheduledOn}
            onChange={(e) => setRecurrence(e.target.value)}
          >
            <option value="">반복 안 함</option>
            <option value="weekly">매주</option>
            <option value="biweekly">격주</option>
            <option value="monthly">매월</option>
          </Select>
          {canWrite ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Button size="sm" disabled={!title.trim() || update.isPending} onClick={save}>
                <Save size={14} /> 저장
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={followUp.isPending}
                title="아젠다와 미결 액션 아이템을 복사한 다음 회차를 만듭니다"
                onClick={createFollowUp}
              >
                <CalendarPlus size={14} /> 후속 회의 만들기
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={saveTemplate.isPending}
                title="현재 저장된 아젠다를 이름 있는 템플릿으로 등록합니다"
                onClick={createTemplate}
              >
                <BookmarkPlus size={14} /> 템플릿으로 저장
              </Button>
              <button
                type="button"
                aria-label="회의 삭제"
                className="rounded-of p-1.5 text-of-muted hover:bg-of-surface-2 hover:text-of-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                onClick={remove}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {!canWrite ? <ReadOnlyNotice /> : null}

      {mtg.follow_up_source_id ? (
        <p className="rounded-of border border-of-border bg-of-surface px-3 py-2 text-[11px] text-of-muted">
          ←{' '}
          <button
            type="button"
            className="text-of-accent hover:underline"
            onClick={() => navigate(`/projects/${projectId}/meetings/${mtg.follow_up_source_id}`)}
          >
            '{mtg.follow_up_source_title ?? '원본 회의'}'
          </button>{' '}
          의 후속 회의입니다
        </p>
      ) : null}

      {conflict ? (
        <p role="alert" className="rounded-of border border-of-danger/30 bg-of-danger/5 px-3 py-2 text-xs text-of-danger">
          다른 사용자가 먼저 수정했습니다. 작성 중인 내용은 유지했으니, 다시 저장하면 최신 내용 위에 덮어씁니다.
        </p>
      ) : null}
      {otherError ? (
        <p role="alert" className="rounded-of border border-of-danger/30 bg-of-danger/5 px-3 py-2 text-xs text-of-danger">
          저장하지 못했습니다: {otherError}
        </p>
      ) : null}
      {followUp.isError ? (
        <p role="alert" className="rounded-of border border-of-danger/30 bg-of-danger/5 px-3 py-2 text-xs text-of-danger">
          {followUp.error instanceof ApiError && followUp.error.status === 409
            ? '같은 제목·날짜의 회의가 이미 있습니다.'
            : '후속 회의 생성 실패'}
        </p>
      ) : null}
      {saveTemplate.isError ? (
        <p role="alert" className="rounded-of border border-of-danger/30 bg-of-danger/5 px-3 py-2 text-xs text-of-danger">
          {saveTemplate.error instanceof ApiError && saveTemplate.error.status === 409
            ? '같은 이름의 템플릿이 이미 있습니다.'
            : '템플릿 저장 실패'}
        </p>
      ) : null}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <main className="min-w-0 space-y-4">
          <EditorSection title="안건">
            <RichTextEditorSlot
              value={mtg.agenda ?? ''}
              ariaLabel="안건"
              editable={canWrite}
              onSave={setAgenda}
            />
          </EditorSection>

          <EditorSection title="회의록">
            <RichTextEditorSlot
              value={mtg.minutes ?? ''}
              ariaLabel="회의록"
              editable={canWrite}
              onSave={setMinutes}
            />
          </EditorSection>

          <ActionItemsSurface
            items={mtg.action_items}
            canWrite={canWrite}
            newItem={newItem}
            setNewItem={setNewItem}
            addItem={addItem}
            toggleItem={toggleItem}
            convertItem={convertItem}
            deleteItem={deleteItem}
            projectId={projectId}
            navigate={navigate}
          />
        </main>

        <aside aria-label="회의 속성" className="grid min-w-0 gap-3 self-start">
          <section aria-label="회의 메타" className="rounded-of border border-of-border bg-of-surface p-3">
            <div className="mb-3 flex items-center gap-2">
              <CalendarClock size={15} className="text-of-muted" aria-hidden="true" />
              <h2 className="text-sm font-semibold">속성</h2>
            </div>
            <div className="grid gap-2 text-xs text-of-muted">
              <MetaRow icon={CalendarClock} label="일정" value={scheduledOn || '일정 미정'} />
              <MetaRow
                icon={ClipboardList}
                label="반복"
                value={recurrence ? RECURRENCE_LABELS[recurrence] : '반복 안 함'}
              />
              <MetaRow icon={CheckSquare} label="미결 액션" value={`${openActionCount}건`} />
              <MetaRow icon={ArrowRightCircle} label="전환됨" value={`${convertedCount}건`} />
              <MetaRow icon={CalendarClock} label="최근 수정" value={formatDateTime(mtg.updated_at)} />
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Badge variant="outline">버전 {mtg.version}</Badge>
                {mtg.recurrence_source_id ? <Badge variant="outline">반복 원본 있음</Badge> : null}
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

function RichTextEditorSlot({
  value,
  ariaLabel,
  editable,
  onSave,
}: {
  value: string
  ariaLabel: string
  editable: boolean
  onSave: (value: string) => void
}) {
  return (
    <Suspense fallback={<div className="h-32 rounded-of border border-of-border bg-of-surface-2/40" />}>
      <RichTextEditor value={value} ariaLabel={ariaLabel} editable={editable} onSave={onSave} />
    </Suspense>
  )
}

function EditorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={`${title} 영역`} className="min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  )
}

type ActionMutation<T> = {
  mutate: (input: T, options?: { onSuccess?: () => void }) => void
  isPending: boolean
}

function ActionItemsSurface({
  items,
  canWrite,
  newItem,
  setNewItem,
  addItem,
  toggleItem,
  convertItem,
  deleteItem,
  projectId,
  navigate,
}: {
  items: Array<{
    id: string
    description: string
    done: boolean
    converted_wp_id?: string | null
  }>
  canWrite: boolean
  newItem: string
  setNewItem: (value: string) => void
  addItem: ActionMutation<{ description: string }>
  toggleItem: ActionMutation<{ id: string; done: boolean }>
  convertItem: ActionMutation<string>
  deleteItem: ActionMutation<string>
  projectId: string
  navigate: (path: string) => void
}) {
  return (
    <section aria-label="액션 아이템" className="space-y-3 rounded-of border border-of-border bg-of-surface p-3">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">액션 아이템</h2>
        <Badge variant="outline">{items.length}건</Badge>
      </div>
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-of border border-of-border px-3 py-2 text-sm">
              <div className="flex min-w-0 items-start gap-2">
                <input
                  type="checkbox"
                  checked={item.done}
                  disabled={!canWrite}
                  aria-label={`${item.description} 완료`}
                  className="mt-0.5 shrink-0"
                  onChange={(e) => toggleItem.mutate({ id: item.id, done: e.target.checked })}
                />
                <span
                  className={`min-w-0 flex-1 break-words ${item.done ? 'text-of-muted line-through' : ''}`}
                >
                  {item.description}
                </span>
              </div>
              <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1 pl-6">
                {item.converted_wp_id ? (
                  <button
                    type="button"
                    className="rounded-of px-1.5 py-1 text-[11px] text-of-accent hover:bg-of-surface-2 hover:underline"
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
                    className="rounded-of p-1 text-of-muted hover:bg-of-surface-2 hover:text-of-accent"
                    onClick={() => convertItem.mutate(item.id)}
                  >
                    <ArrowRightCircle size={13} />
                  </button>
                ) : null}
                {canWrite ? (
                  <button
                    type="button"
                    aria-label="액션 아이템 삭제"
                    className="rounded-of p-1 text-of-muted hover:bg-of-surface-2 hover:text-of-danger"
                    onClick={() => deleteItem.mutate(item.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-of-muted">액션 아이템이 없습니다.</p>
      )}
      {canWrite ? (
        <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="액션 아이템 추가"
            aria-label="새 액션 아이템"
            className="h-8 min-w-0 text-xs"
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
  )
}

function MetaRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarClock
  label: string
  value: string
}) {
  return (
    <div className="grid grid-cols-[auto_5rem_minmax(0,1fr)] items-center gap-2">
      <Icon size={14} aria-hidden="true" />
      <span>{label}</span>
      <span className="truncate text-of-text">{value}</span>
    </div>
  )
}
