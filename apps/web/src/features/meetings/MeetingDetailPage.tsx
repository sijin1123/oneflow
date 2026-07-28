import {
  ArrowLeft,
  ArrowRightCircle,
  BookmarkPlus,
  CalendarClock,
  CalendarPlus,
  CheckSquare,
  Loader2,
  RefreshCw,
  Repeat2,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react'
import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { FrameContextActions } from '@/components/shell/FrameContextActions'
import { ReadOnlyNotice } from '@/components/shell/ReadOnlyNotice'
import { ErrorState } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
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
import {
  MeetingActionItemsSurface,
  type ActionIntent,
} from './MeetingActionItemsSurface'

const RichTextEditor = lazy(() =>
  import('@/components/ui/rich-text-editor').then((module) => ({
    default: module.RichTextEditor,
  })),
)

const RECURRENCE_LABELS: Record<string, string> = {
  weekly: '매주',
  biweekly: '격주',
  monthly: '매월',
}

const COMPACT_ERROR_STATE_CLASS =
  'min-h-0 justify-start px-0 py-0 text-left sm:px-0 [&>div]:grid [&>div]:w-full [&>div]:max-w-none [&>div]:grid-cols-[2rem_minmax(0,1fr)_auto] [&>div]:items-center [&>div]:gap-x-2 [&>div]:gap-y-0.5 [&>div]:px-3 [&>div]:py-3 [&>div]:text-left [&>div>span]:row-span-2 [&>div>span]:h-8 [&>div>span]:w-8 [&>div>p]:col-start-2 [&_button]:col-start-3 [&_button]:row-span-2 [&_button]:row-start-1 [&_button]:ml-auto [&_button]:mt-0'

export function MeetingDetailPage() {
  const { projectId, meetingId } = useParams() as { projectId: string; meetingId: string }
  return <MeetingDetailSurface key={`${projectId}:${meetingId}`} projectId={projectId} meetingId={meetingId} />
}

function MeetingDetailSurface({
  projectId,
  meetingId,
}: {
  projectId: string
  meetingId: string
}) {
  const navigate = useNavigate()
  const meeting = useMeeting(meetingId)
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
  const [failedFollowUp, setFailedFollowUp] = useState(false)
  const [failedTemplateName, setFailedTemplateName] = useState<string | null>(null)
  const [failedDelete, setFailedDelete] = useState(false)
  const [failedAction, setFailedAction] = useState<ActionIntent | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const mtg = meeting.data
  const archived = Boolean(project.data?.archived_at)
  const canMutate = canWrite && Boolean(project.data) && !archived
  const hasMeeting = Boolean(mtg)
  const initialPending = meeting.isPending && !hasMeeting
  const initialError = meeting.isError && !hasMeeting
  const retainedDataError = hasMeeting && (meeting.isError || project.isError)
  const refreshPending = meeting.isFetching || project.isFetching
  const actionPending =
    addItem.isPending || toggleItem.isPending || convertItem.isPending || deleteItem.isPending

  useEffect(() => {
    if (!mtg) return
    setTitle(mtg.title)
    setScheduledOn(mtg.scheduled_on ?? '')
    setAgenda(mtg.agenda ?? '')
    setMinutes(mtg.minutes ?? '')
    setRecurrence(mtg.recurrence ?? '')
  }, [mtg])

  const dirty =
    Boolean(mtg) &&
    !update.isPending &&
    !del.isPending &&
    (title !== mtg?.title ||
      scheduledOn !== (mtg?.scheduled_on ?? '') ||
      recurrence !== (mtg?.recurrence ?? '') ||
      agenda !== (mtg?.agenda ?? '') ||
      minutes !== (mtg?.minutes ?? ''))
  useUnsavedChangesPrompt(dirty, '저장되지 않은 변경이 있습니다. 나가시겠습니까?')

  const refreshAll = async () => {
    await Promise.allSettled([meeting.refetch(), project.refetch()])
  }

  const conflict = conflictOf(update.error)
  const openActionCount =
    mtg?.action_items.filter((item) => !item.done && !item.converted_wp_id).length ?? 0
  const convertedCount =
    mtg?.action_items.filter((item) => Boolean(item.converted_wp_id)).length ?? 0

  const save = async () => {
    const trimmed = title.trim()
    if (!mtg || !trimmed || update.isPending || !canMutate) return
    setNotice(null)
    update.reset()
    try {
      await update.mutateAsync({
        meetingId: mtg.id,
        expected_version: conflict ? conflict.current.version : mtg.version,
        title: trimmed,
        scheduled_on: scheduledOn || null,
        recurrence: recurrence || null,
        agenda: agenda === '' ? null : agenda,
        minutes: minutes === '' ? null : minutes,
      })
      setNotice('회의 변경사항을 저장했습니다.')
    } catch {
      // The mutation state keeps the current draft and exposes an exact retry.
    }
  }

  const runFollowUp = async () => {
    if (!mtg || followUp.isPending || !canMutate) return
    followUp.reset()
    setFailedFollowUp(false)
    setNotice(null)
    try {
      const created = await followUp.mutateAsync(mtg.id)
      navigate(`/projects/${projectId}/meetings/${created.id}`)
    } catch {
      setFailedFollowUp(true)
    }
  }

  const createFollowUp = () => {
    if (
      !confirmDestructive(
        `후속 회의를 만들까요?\n아젠다와 미결 액션 아이템 ${openActionCount}건이 복사됩니다.`,
      )
    ) {
      return
    }
    void runFollowUp()
  }

  const runTemplateSave = async (name: string) => {
    if (!mtg || saveTemplate.isPending || !canMutate) return
    saveTemplate.reset()
    setFailedTemplateName(null)
    setNotice(null)
    try {
      await saveTemplate.mutateAsync({ name, from_meeting_id: mtg.id })
      setNotice(`'${name}' 템플릿을 저장했습니다.`)
    } catch {
      setFailedTemplateName(name)
    }
  }

  const createTemplate = () => {
    if (!mtg) return
    const name = window.prompt('템플릿 이름을 입력하세요', `${mtg.title} 아젠다`)
    if (!name?.trim()) return
    void runTemplateSave(name.trim())
  }

  const runDelete = async () => {
    if (!mtg || del.isPending || !canMutate) return
    del.reset()
    setFailedDelete(false)
    setNotice(null)
    try {
      await del.mutateAsync(mtg.id)
      navigate(`/projects/${projectId}/meetings`)
    } catch {
      setFailedDelete(true)
    }
  }

  const remove = () => {
    if (!confirmDestructive('이 회의를 삭제할까요? 되돌릴 수 없습니다.')) return
    void runDelete()
  }

  const runAction = async (intent: ActionIntent) => {
    if (actionPending || !canMutate) return
    addItem.reset()
    toggleItem.reset()
    convertItem.reset()
    deleteItem.reset()
    setFailedAction(null)
    setNotice(null)
    try {
      if (intent.kind === 'add') {
        await addItem.mutateAsync({ description: intent.description })
        setNewItem((current) => (current.trim() === intent.description ? '' : current))
      } else if (intent.kind === 'toggle') {
        await toggleItem.mutateAsync({ id: intent.id, done: intent.done })
      } else if (intent.kind === 'convert') {
        await convertItem.mutateAsync(intent.id)
      } else {
        await deleteItem.mutateAsync(intent.id)
      }
    } catch {
      setFailedAction(intent)
    }
  }

  const otherSaveError =
    update.error instanceof ApiError && update.error.status !== 409 ? update.error.message : null

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-of-surface">
      <h1 className="sr-only">{mtg?.title ?? '회의 상세'}</h1>
      <FrameContextActions>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="회의 상세 새로고침"
          title="새로고침"
          disabled={refreshPending}
          onClick={() => void refreshAll()}
        >
          <RefreshCw
            size={13}
            className={refreshPending ? 'animate-spin' : undefined}
            aria-hidden="true"
          />
        </Button>
        {canMutate && mtg ? (
          <Button
            type="button"
            size="sm"
            disabled={!title.trim() || update.isPending}
            onClick={() => void save()}
          >
            {update.isPending ? (
              <Loader2 size={13} className="animate-spin" aria-hidden="true" />
            ) : update.isError ? (
              <RotateCcw size={13} aria-hidden="true" />
            ) : (
              <Save size={13} aria-hidden="true" />
            )}
            {update.isError ? '저장 다시 시도' : '저장'}
          </Button>
        ) : null}
      </FrameContextActions>

      <section
        aria-label="회의 상세 상태"
        className="flex min-w-0 shrink-0 flex-col gap-2 border-b border-of-border-subtle bg-of-surface-raised px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            aria-label="회의 목록"
            className="shrink-0 rounded-of p-1 text-of-muted transition-colors hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
            onClick={() => navigate(`/projects/${projectId}/meetings`)}
          >
            <ArrowLeft size={15} aria-hidden="true" />
          </button>
          <CalendarClock size={14} className="shrink-0 text-of-muted" aria-hidden="true" />
          <span className="shrink-0 text-xs font-semibold">회의 상세</span>
          <span className="h-4 w-px shrink-0 bg-of-border" aria-hidden="true" />
          <span className="min-w-0 truncate text-[11px] text-of-muted">
            {mtg?.title ?? (initialError ? '불러오기 실패' : '불러오는 중')}
          </span>
          {project.data ? <Badge variant="outline">{project.data.key}</Badge> : null}
          {archived ? <Badge variant="neutral">보관됨</Badge> : null}
        </div>
        <span className="truncate pl-7 text-[11px] text-of-muted sm:pl-0">
          {project.data?.name ?? '프로젝트'}
          {hasMeeting ? (canMutate ? ' · 편집 가능' : ' · 읽기 전용') : ''}
        </span>
      </section>

      {initialPending ? (
        <MeetingDetailSkeleton />
      ) : initialError ? (
        <div className="flex-1 overflow-y-auto p-3">
          <ErrorState
            error={meeting.error}
            onRetry={() => void refreshAll()}
            className={COMPACT_ERROR_STATE_CLASS}
          />
          <MeetingDetailSkeleton embedded />
        </div>
      ) : mtg ? (
        <>
          {retainedDataError ? (
            <InlineStatus tone="danger">
              <span>마지막으로 불러온 회의 내용을 유지하고 있습니다. 최신 상태를 다시 확인하세요.</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={refreshPending}
                onClick={() => void refreshAll()}
              >
                <RefreshCw
                  size={13}
                  className={refreshPending ? 'animate-spin' : undefined}
                  aria-hidden="true"
                />
                다시 확인
              </Button>
            </InlineStatus>
          ) : null}
          {!canMutate ? <ReadOnlyNotice /> : null}
          {conflict ? (
            <InlineStatus tone="danger">
              <span>
                다른 사용자가 먼저 수정했습니다. 현재 초안은 유지되며 최신 버전 위에 같은 내용을
                다시 저장할 수 있습니다.
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={update.isPending}
                onClick={() => void save()}
              >
                <RotateCcw size={13} aria-hidden="true" /> 최신 버전으로 저장 다시 시도
              </Button>
            </InlineStatus>
          ) : otherSaveError ? (
            <InlineStatus tone="danger">
              <span>저장하지 못했습니다: {otherSaveError}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={update.isPending}
                onClick={() => void save()}
              >
                <RotateCcw size={13} aria-hidden="true" /> 같은 변경 저장 다시 시도
              </Button>
            </InlineStatus>
          ) : null}
          {failedFollowUp ? (
            <InlineStatus tone="danger">
              <span>
                {followUp.error instanceof ApiError && followUp.error.status === 409
                  ? '같은 제목과 날짜의 회의가 이미 있습니다.'
                  : '후속 회의를 만들지 못했습니다. 같은 원본과 미결 항목으로 다시 시도할 수 있습니다.'}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={followUp.isPending}
                onClick={() => void runFollowUp()}
              >
                <RotateCcw size={13} aria-hidden="true" /> 후속 회의 다시 시도
              </Button>
            </InlineStatus>
          ) : null}
          {failedTemplateName ? (
            <InlineStatus tone="danger">
              <span>
                {saveTemplate.error instanceof ApiError && saveTemplate.error.status === 409
                  ? `'${failedTemplateName}' 이름의 템플릿이 이미 있습니다.`
                  : `'${failedTemplateName}' 템플릿을 저장하지 못했습니다.`}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={saveTemplate.isPending}
                onClick={() => void runTemplateSave(failedTemplateName)}
              >
                <RotateCcw size={13} aria-hidden="true" /> 같은 템플릿 저장 다시 시도
              </Button>
            </InlineStatus>
          ) : null}
          {failedDelete ? (
            <InlineStatus tone="danger">
              <span>회의를 삭제하지 못했습니다. 같은 회의 삭제를 다시 시도할 수 있습니다.</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={del.isPending}
                onClick={() => void runDelete()}
              >
                <RotateCcw size={13} aria-hidden="true" /> 회의 삭제 다시 시도
              </Button>
            </InlineStatus>
          ) : null}
          {notice ? <InlineStatus tone="success">{notice}</InlineStatus> : null}

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto grid w-full max-w-7xl min-w-0 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <main className="min-w-0 px-4 pb-10 pt-4 sm:px-6">
                <section
                  aria-label="회의 기본 정보"
                  className="grid min-w-0 gap-3 border-b border-of-border-subtle pb-4 md:grid-cols-[minmax(0,1fr)_10rem_9rem]"
                >
                  <label className="grid min-w-0 gap-1 text-[11px] font-medium text-of-muted">
                    제목
                    <Input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      readOnly={!canMutate}
                      aria-label="회의 제목"
                      className="h-9 min-w-0 text-sm font-semibold"
                    />
                  </label>
                  <label className="grid min-w-0 gap-1 text-[11px] font-medium text-of-muted">
                    일정
                    <Input
                      type="date"
                      value={scheduledOn}
                      onChange={(event) => setScheduledOn(event.target.value)}
                      readOnly={!canMutate}
                      aria-label="회의 일정"
                      className="h-9 min-w-0 text-xs"
                    />
                  </label>
                  <label className="grid min-w-0 gap-1 text-[11px] font-medium text-of-muted">
                    반복
                    <Select
                      aria-label="반복 주기"
                      title="반복은 일정이 지나면 다음 회차를 자동 생성합니다."
                      className="h-9 min-w-0 text-xs"
                      value={recurrence}
                      disabled={!canMutate || !scheduledOn}
                      onChange={(event) => setRecurrence(event.target.value)}
                    >
                      <option value="">반복 안 함</option>
                      <option value="weekly">매주</option>
                      <option value="biweekly">격주</option>
                      <option value="monthly">매월</option>
                    </Select>
                  </label>
                </section>

                {mtg.follow_up_source_id || mtg.recurrence_source_id ? (
                  <section
                    aria-label="회의 연결"
                    className="flex min-w-0 flex-wrap items-center gap-2 border-b border-of-border-subtle py-3 text-xs text-of-muted"
                  >
                    <ArrowRightCircle size={14} aria-hidden="true" />
                    {mtg.follow_up_source_id ? (
                      <>
                        <span>후속 회의 원본</span>
                        <button
                          type="button"
                          className="max-w-full truncate font-medium text-of-accent hover:underline"
                          onClick={() =>
                            navigate(
                              `/projects/${projectId}/meetings/${mtg.follow_up_source_id}`,
                            )
                          }
                        >
                          '{mtg.follow_up_source_title ?? '원본 회의'}'
                        </button>
                        <span>의 후속 회의입니다</span>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="font-medium text-of-accent hover:underline"
                        onClick={() =>
                          navigate(`/projects/${projectId}/meetings/${mtg.recurrence_source_id}`)
                        }
                      >
                        반복 원본 회의 열기
                      </button>
                    )}
                  </section>
                ) : null}

                <EditorSection
                  title="안건"
                  description="회의 전에 논의할 주제와 준비 사항을 정리합니다."
                >
                  <RichTextEditorSlot
                    value={agenda}
                    ariaLabel="안건"
                    editable={canMutate}
                    onSave={setAgenda}
                  />
                </EditorSection>

                <EditorSection
                  title="회의록"
                  description="결정 사항과 논의 내용을 기록합니다."
                >
                  <RichTextEditorSlot
                    value={minutes}
                    ariaLabel="회의록"
                    editable={canMutate}
                    onSave={setMinutes}
                  />
                </EditorSection>

                <MeetingActionItemsSurface
                  items={mtg.action_items}
                  canWrite={canMutate}
                  newItem={newItem}
                  setNewItem={setNewItem}
                  actionPending={actionPending}
                  failedAction={failedAction}
                  onRunAction={runAction}
                  projectId={projectId}
                  navigate={navigate}
                />
              </main>

              <aside
                aria-label="회의 속성"
                className="order-first min-w-0 border-b border-of-border-subtle bg-of-surface-raised/35 px-4 py-4 lg:order-last lg:border-b-0 lg:border-l lg:px-4"
              >
                <div className="grid min-w-0 gap-5 lg:sticky lg:top-4">
                  <section aria-label="회의 메타" className="min-w-0">
                    <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
                      <h2 className="text-xs font-semibold">회의 속성</h2>
                      <Badge variant={canMutate ? 'accent' : 'outline'}>
                        {canMutate ? '편집 가능' : '읽기 전용'}
                      </Badge>
                    </div>
                    <div className="grid gap-2.5 text-xs text-of-muted">
                      <MetaRow
                        icon={CalendarClock}
                        label="일정"
                        value={scheduledOn || '일정 미정'}
                      />
                      <MetaRow
                        icon={Repeat2}
                        label="반복"
                        value={recurrence ? RECURRENCE_LABELS[recurrence] : '반복 안 함'}
                      />
                      <MetaRow
                        icon={CheckSquare}
                        label="미결 액션"
                        value={`${openActionCount}건`}
                      />
                      <MetaRow
                        icon={ArrowRightCircle}
                        label="작업 전환"
                        value={`${convertedCount}건`}
                      />
                      <MetaRow
                        icon={CalendarClock}
                        label="최근 수정"
                        value={formatDateTime(mtg.updated_at)}
                      />
                      <div className="flex flex-wrap items-center gap-1.5 border-t border-of-border-subtle pt-3">
                        <Badge variant="outline">버전 {mtg.version}</Badge>
                        <Badge variant="outline">액션 {mtg.action_items.length}</Badge>
                      </div>
                    </div>
                  </section>

                  {canMutate ? (
                    <section
                      aria-label="회의 명령"
                      className="grid min-w-0 gap-2 border-t border-of-border-subtle pt-4"
                    >
                      <h2 className="text-xs font-semibold">회의 명령</h2>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        disabled={followUp.isPending}
                        title="아젠다와 미결 액션 아이템을 복사한 다음 회차를 만듭니다"
                        onClick={createFollowUp}
                      >
                        {followUp.isPending ? (
                          <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                        ) : (
                          <CalendarPlus size={13} aria-hidden="true" />
                        )}
                        후속 회의 만들기
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full justify-start"
                        disabled={saveTemplate.isPending}
                        title="현재 저장된 아젠다를 이름 있는 템플릿으로 등록합니다"
                        onClick={createTemplate}
                      >
                        {saveTemplate.isPending ? (
                          <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                        ) : (
                          <BookmarkPlus size={13} aria-hidden="true" />
                        )}
                        템플릿으로 저장
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-of-danger hover:text-of-danger"
                        aria-label="회의 삭제"
                        disabled={del.isPending}
                        onClick={remove}
                      >
                        {del.isPending ? (
                          <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                        ) : (
                          <Trash2 size={13} aria-hidden="true" />
                        )}
                        회의 삭제
                      </Button>
                    </section>
                  ) : null}
                </div>
              </aside>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

function InlineStatus({
  tone,
  children,
}: {
  tone: 'danger' | 'success'
  children: ReactNode
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={
        tone === 'danger'
          ? 'flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-of-danger/15 bg-of-danger-soft px-3 py-2 text-xs text-of-danger'
          : 'flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-of-success/15 bg-of-success-soft px-3 py-2 text-xs text-of-success'
      }
    >
      {children}
    </div>
  )
}

function MeetingDetailSkeleton({ embedded = false }: { embedded?: boolean }) {
  return (
    <div
      role="status"
      aria-label="회의 상세 불러오는 중"
      className={
        embedded
          ? 'mt-3 grid min-w-0 lg:grid-cols-[minmax(0,1fr)_18rem]'
          : 'min-h-0 flex-1 overflow-hidden'
      }
    >
      <span className="sr-only">회의 상세 불러오는 중</span>
      <div
        className={
          embedded
            ? 'grid min-w-0 lg:col-span-2 lg:grid-cols-[minmax(0,1fr)_18rem]'
            : 'mx-auto grid h-full w-full max-w-7xl min-w-0 lg:grid-cols-[minmax(0,1fr)_18rem]'
        }
      >
        <div className="min-w-0 space-y-5 px-4 py-4 sm:px-6">
          <div className="grid gap-3 border-b border-of-border-subtle pb-4 md:grid-cols-[minmax(0,1fr)_10rem_9rem]">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
          <div className="space-y-2 border-b border-of-border-subtle pb-5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-32 w-full" />
          </div>
          <div className="space-y-2 border-b border-of-border-subtle pb-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-32 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
        <div className="order-first space-y-3 border-b border-of-border-subtle bg-of-surface-raised/35 px-4 py-4 lg:order-last lg:border-b-0 lg:border-l">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-full" />
        </div>
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
    <Suspense fallback={<Skeleton className="h-32 w-full" />}>
      <RichTextEditor
        value={value}
        ariaLabel={ariaLabel}
        editable={editable}
        appearance="framed"
        onSave={onSave}
      />
    </Suspense>
  )
}

function EditorSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section aria-label={`${title} 영역`} className="min-w-0 border-b border-of-border-subtle py-5">
      <div className="mb-2 flex min-w-0 flex-col gap-0.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-[11px] leading-5 text-of-muted">{description}</p>
      </div>
      {children}
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
    <div className="grid min-w-0 grid-cols-[auto_4.5rem_minmax(0,1fr)] items-center gap-2">
      <Icon size={14} aria-hidden="true" />
      <span>{label}</span>
      <span className="min-w-0 truncate text-right text-of-text">{value}</span>
    </div>
  )
}
