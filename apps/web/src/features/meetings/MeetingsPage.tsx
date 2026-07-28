import {
  ArrowUpRight,
  CalendarClock,
  ClipboardList,
  Loader2,
  Plus,
  RefreshCw,
  Repeat2,
  Search,
  TimerOff,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { FrameContextActions } from '@/components/shell/FrameContextActions'
import { ReadOnlyNotice } from '@/components/shell/ReadOnlyNotice'
import { EmptyState, ErrorState } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useCanWrite } from '@/features/members/useCanWrite'
import { useProject } from '@/features/projects/api'
import { ApiError } from '@/lib/api'
import { formatDateTime } from '@/lib/datetime'

import { useCreateMeeting, useMeetings, useMeetingTemplates } from './api'

const COMPACT_ERROR_STATE_CLASS =
  'min-h-0 justify-start px-0 py-0 text-left sm:px-0 [&>div]:grid [&>div]:w-full [&>div]:max-w-none [&>div]:grid-cols-[2rem_minmax(0,1fr)_auto] [&>div]:items-center [&>div]:gap-x-2 [&>div]:gap-y-0.5 [&>div]:px-3 [&>div]:py-3 [&>div]:text-left [&>div>span]:row-span-2 [&>div>span]:h-8 [&>div>span]:w-8 [&>div>p]:col-start-2 [&_button]:col-start-3 [&_button]:row-span-2 [&_button]:row-start-1 [&_button]:ml-auto [&_button]:mt-0'

type CreateMeetingIntent = {
  templateId: string
  templateName: string
}

export function MeetingsPage() {
  const { projectId } = useParams() as { projectId: string }
  return <MeetingsDirectory key={projectId} projectId={projectId} />
}

function MeetingsDirectory({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const meetings = useMeetings(projectId)
  const project = useProject(projectId)
  const create = useCreateMeeting(projectId)
  const templates = useMeetingTemplates(projectId)
  const canWrite = useCanWrite(projectId)
  const [templateId, setTemplateId] = useState('')
  const [failedCreate, setFailedCreate] = useState<CreateMeetingIntent | null>(null)

  const query = searchParams.get('q') ?? ''
  const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR')
  const items = meetings.data?.items ?? []
  const visible = items.filter((meeting) =>
    meeting.title.toLocaleLowerCase('ko-KR').includes(normalizedQuery),
  )
  const scheduled = items.filter((meeting) => meeting.scheduled_on !== null).length
  const recurring = items.filter((meeting) => meeting.recurrence !== null).length
  const archived = project.data?.archived_at !== null && project.data?.archived_at !== undefined
  const canMutate = canWrite && Boolean(project.data) && !archived
  const hasMeetings = Boolean(meetings.data)
  const initialPending = meetings.isPending && !hasMeetings
  const retainedDataError =
    hasMeetings && (meetings.isError || project.isError || templates.isError)
  const refreshPending = meetings.isFetching || project.isFetching || templates.isFetching
  const selectedTemplate = templates.data?.items.find((template) => template.id === templateId)

  const setQuery = (value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set('q', value)
    else next.delete('q')
    setSearchParams(next, { replace: true })
  }

  const refreshAll = async () => {
    await Promise.allSettled([meetings.refetch(), project.refetch(), templates.refetch()])
  }

  const runCreate = async (intent: CreateMeetingIntent) => {
    create.reset()
    setFailedCreate(null)
    try {
      const meeting = await create.mutateAsync({
        title: '제목 없는 회의',
        ...(intent.templateId ? { template_id: intent.templateId } : {}),
      })
      navigate(`/projects/${projectId}/meetings/${meeting.id}`)
    } catch {
      setFailedCreate(intent)
    }
  }

  const createFromSelection = () =>
    runCreate({
      templateId,
      templateName: selectedTemplate?.name ?? '템플릿 없음',
    })

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden bg-of-surface">
      <h1 className="sr-only">회의</h1>
      <FrameContextActions>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="회의 디렉터리 새로고침"
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
        {canMutate ? (
          <Button
            type="button"
            size="sm"
            disabled={create.isPending}
            onClick={() => void createFromSelection()}
          >
            {create.isPending ? (
              <Loader2 size={13} className="animate-spin" aria-hidden="true" />
            ) : (
              <Plus size={13} aria-hidden="true" />
            )}
            새 회의
          </Button>
        ) : null}
      </FrameContextActions>

      <section
        aria-label="회의 디렉터리 상태"
        className="flex min-w-0 shrink-0 flex-col gap-2 border-b border-of-border-subtle bg-of-surface-raised px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
            <CalendarClock size={13} aria-hidden="true" />
            회의 디렉터리
          </span>
          <span className="h-4 w-px bg-of-border" aria-hidden="true" />
          <span className="text-[11px] text-of-muted">
            전체 {meetings.data?.total ?? 0} · 예정 {scheduled}
          </span>
          {project.data ? (
            <span className="rounded-full border border-of-border px-1.5 py-0.5 text-[11px] text-of-muted">
              {project.data.key}
            </span>
          ) : null}
          {archived ? (
            <span className="rounded-full border border-of-border px-1.5 py-0.5 text-[11px] text-of-muted">
              보관됨
            </span>
          ) : null}
        </div>
        <span className="truncate text-[11px] text-of-muted">
          {project.data?.name ?? '프로젝트'}
          {canMutate ? ' · 회의 운영' : ' · 읽기 전용'}
        </span>
      </section>

      {retainedDataError ? (
        <div
          role="alert"
          className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-of-danger/15 bg-of-danger-soft px-3 py-2 text-xs text-of-danger"
        >
          <span>마지막으로 불러온 회의를 유지하고 있습니다. 최신 상태를 다시 확인하세요.</span>
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
            다시 시도
          </Button>
        </div>
      ) : null}

      <div
        data-testid="project-meetings-scroll"
        className="of-scrollbar min-h-0 flex-1 overflow-y-auto"
      >
        {initialPending ? (
          <MeetingsDirectorySkeleton />
        ) : meetings.isError && !hasMeetings ? (
          <div className="mx-auto grid w-full max-w-6xl content-start px-3 py-4 sm:px-5">
            <ErrorState
              error={meetings.error}
              onRetry={() => void refreshAll()}
              className={COMPACT_ERROR_STATE_CLASS}
            />
          </div>
        ) : (
          <div className="mx-auto w-full max-w-6xl min-w-0 space-y-4 px-3 py-4 sm:px-5">
            <section
              aria-label="회의 요약"
              className="grid min-w-0 grid-cols-2 border-y border-of-border sm:grid-cols-4"
            >
              <SummaryFact icon={ClipboardList} label="전체 회의" value={String(items.length)} />
              <SummaryFact icon={CalendarClock} label="일정 있음" value={String(scheduled)} />
              <SummaryFact
                icon={TimerOff}
                label="일정 미정"
                value={String(items.length - scheduled)}
              />
              <SummaryFact icon={Repeat2} label="반복 회의" value={String(recurring)} />
            </section>

            {!canWrite ? <ReadOnlyNotice /> : null}

            <section aria-label="회의 목록" className="min-w-0 space-y-3">
              <div
                className={`grid min-w-0 gap-2 border-y border-of-border py-3 sm:items-center ${
                  canMutate
                    ? 'sm:grid-cols-[minmax(0,1fr)_minmax(10rem,13rem)_auto]'
                    : ''
                }`}
              >
                <label className="relative block min-w-0">
                  <Search
                    size={14}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-of-muted"
                    aria-hidden="true"
                  />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="회의 제목 검색"
                    aria-label="회의 제목 검색"
                    className="pl-8"
                  />
                </label>
                {canMutate ? (
                  <>
                    <TemplateSelect
                      value={templateId}
                      disabled={templates.isPending || templates.isError}
                      onChange={(value) => {
                        setTemplateId(value)
                        setFailedCreate(null)
                        create.reset()
                      }}
                      options={templates.data?.items ?? []}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={create.isPending}
                      onClick={() => void createFromSelection()}
                    >
                      {create.isPending ? (
                        <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                      ) : (
                        <Plus size={13} aria-hidden="true" />
                      )}
                      생성
                    </Button>
                  </>
                ) : null}
              </div>

              {failedCreate ? (
                <ActionFailure
                  message={`'${failedCreate.templateName}' 설정으로 회의를 만들지 못했습니다. 같은 설정을 유지해 다시 시도할 수 있습니다.`}
                  detail={errorMessage(create.error)}
                  pending={create.isPending}
                  onRetry={() => void runCreate(failedCreate)}
                />
              ) : null}

              {items.length === 0 ? (
                <EmptyState
                  title="회의가 없습니다"
                  hint="새 회의를 만들어 안건, 회의록, 액션 아이템을 한곳에서 운영하세요."
                  className="min-h-[260px] border-y border-of-border"
                />
              ) : visible.length === 0 ? (
                <EmptyState
                  title="검색 결과가 없습니다"
                  hint="다른 회의 제목으로 검색하거나 조건을 지우세요."
                  className="min-h-[220px] border-y border-of-border"
                >
                  <Button type="button" size="sm" variant="outline" onClick={() => setQuery('')}>
                    검색 지우기
                  </Button>
                </EmptyState>
              ) : (
                <ul className="min-w-0 divide-y divide-of-border border-y border-of-border">
                  {visible.map((meeting) => (
                    <li key={meeting.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/projects/${projectId}/meetings/${meeting.id}`)}
                        className="group grid w-full min-w-0 gap-2 px-2 py-3 text-left transition-colors hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-of-focus sm:grid-cols-[minmax(0,1fr)_minmax(8rem,11rem)_minmax(8rem,11rem)_1rem] sm:items-center sm:px-3"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-of border border-of-border bg-of-surface-2 text-of-muted">
                            <CalendarClock size={14} aria-hidden="true" />
                          </span>
                          <span className="min-w-0 truncate text-sm font-medium">
                            {meeting.title}
                          </span>
                          {meeting.recurrence ? (
                            <Badge variant="outline" className="shrink-0">
                              반복
                            </Badge>
                          ) : null}
                        </span>
                        <span className="min-w-0 truncate text-xs text-of-secondary">
                          {meeting.scheduled_on ?? '일정 미정'}
                        </span>
                        <span className="min-w-0 truncate text-xs text-of-muted">
                          {formatDateTime(meeting.updated_at)}
                        </span>
                        <ArrowUpRight
                          size={14}
                          className="hidden text-of-faint transition-colors group-hover:text-of-text sm:block"
                          aria-hidden="true"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

function TemplateSelect({
  value,
  disabled,
  onChange,
  options,
}: {
  value: string
  disabled: boolean
  onChange: (value: string) => void
  options: Array<{ id: string; name: string }>
}) {
  return (
    <Select
      aria-label="회의 템플릿"
      className="h-8 min-w-0 text-xs"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">템플릿 없음</option>
      {options.map((template) => (
        <option key={template.id} value={template.id}>
          {template.name}
        </option>
      ))}
    </Select>
  )
}

function SummaryFact({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 border-of-border px-2.5 py-2.5 odd:border-r sm:border-r sm:last:border-r-0">
      <Icon size={14} className="shrink-0 text-of-muted" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block truncate text-[11px] text-of-muted">{label}</span>
        <span className="block truncate text-sm font-semibold">{value}</span>
      </span>
    </div>
  )
}

function ActionFailure({
  message,
  detail,
  pending,
  onRetry,
}: {
  message: string
  detail: string | null
  pending: boolean
  onRetry: () => void
}) {
  return (
    <div
      role="alert"
      className="flex min-w-0 flex-col gap-2 border-y border-of-danger/20 bg-of-danger-soft px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
    >
      <span className="min-w-0 text-xs text-of-danger">
        {message}
        {detail ? <span className="ml-1 text-of-muted">{detail}</span> : null}
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="shrink-0"
        disabled={pending}
        onClick={onRetry}
      >
        {pending ? (
          <Loader2 size={13} className="animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw size={13} aria-hidden="true" />
        )}
        같은 설정으로 재시도
      </Button>
    </div>
  )
}

function MeetingsDirectorySkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-6xl min-w-0 space-y-4 px-3 py-4 sm:px-5"
      role="status"
      aria-label="회의 불러오는 중"
      aria-busy="true"
    >
      <section className="grid grid-cols-2 border-y border-of-border sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="flex items-center gap-2 border-of-border px-2.5 py-2.5 odd:border-r sm:border-r sm:last:border-r-0"
          >
            <Skeleton className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-3.5 w-8" />
            </span>
          </div>
        ))}
      </section>
      <div className="grid gap-2 border-y border-of-border py-3 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,13rem)_auto]">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-14" />
      </div>
      <div className="divide-y divide-of-border border-y border-of-border">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="grid min-h-14 min-w-0 gap-2 px-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(8rem,11rem)_minmax(8rem,11rem)_1rem] sm:items-center sm:px-3"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Skeleton className="h-7 w-7 shrink-0" />
              <Skeleton className={index % 2 === 0 ? 'h-3 w-2/3' : 'h-3 w-1/2'} />
            </span>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}

function errorMessage(error: unknown): string | null {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return null
}
