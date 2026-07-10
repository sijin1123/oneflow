import { CalendarClock, ClipboardList, Plus, Repeat2, Search, TimerOff } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { ReadOnlyNotice } from '@/components/shell/ReadOnlyNotice'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useCanWrite } from '@/features/members/useCanWrite'
import { useProject } from '@/features/projects/api'
import { formatDateTime } from '@/lib/datetime'

import { useCreateMeeting, useMeetings, useMeetingTemplates } from './api'

export function MeetingsPage() {
  const { projectId } = useParams() as { projectId: string }
  const navigate = useNavigate()
  const { data, isPending, isError, error, refetch } = useMeetings(projectId)
  const project = useProject(projectId)
  const create = useCreateMeeting(projectId)
  const canWrite = useCanWrite(projectId)
  const templates = useMeetingTemplates(projectId)
  const [templateId, setTemplateId] = useState('')
  const [query, setQuery] = useState('')

  const newMeeting = () => {
    create.mutate(
      { title: '제목 없는 회의', ...(templateId ? { template_id: templateId } : {}) },
      { onSuccess: (m) => navigate(`/projects/${projectId}/meetings/${m.id}`) },
    )
  }

  const q = query.trim().toLowerCase()
  const items = data?.items ?? []
  const visible = items.filter((m) => m.title.toLowerCase().includes(q))
  const scheduled = items.filter((m) => m.scheduled_on !== null).length
  const recurring = items.filter((m) => m.recurrence !== null && m.recurrence !== undefined).length
  const archived = project.data?.archived_at !== null && project.data?.archived_at !== undefined

  return (
    <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-4 px-4 py-5 sm:px-6">
      <header className="border-b border-of-border pb-4">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase text-of-muted">Collaboration surface</p>
            <h1 className="mt-1 text-base font-semibold">회의</h1>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">
              {project.data?.name ?? '프로젝트'}의 안건, 회의록, 액션 아이템을 모아 봅니다.
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {project.data ? <Badge variant="outline">{project.data.key}</Badge> : null}
            <Badge variant={archived ? 'outline' : 'accent'}>{archived ? '보관됨' : '활성'}</Badge>
            <Badge variant="outline">회의 {data?.total ?? 0}</Badge>
          </div>
        </div>
      </header>
      {!canWrite ? <ReadOnlyNotice /> : null}

      {isPending ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : data.total === 0 ? (
        <EmptyState title="회의가 없습니다" hint="새 회의를 만들어 안건·회의록·액션 아이템을 정리하세요.">
          {canWrite && !archived ? (
            <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,12rem)_auto]">
              <TemplateSelect
                value={templateId}
                onChange={setTemplateId}
                options={templates.data?.items ?? []}
              />
              <Button size="sm" disabled={create.isPending} onClick={newMeeting}>
                <Plus size={14} /> 새 회의
              </Button>
            </div>
          ) : null}
        </EmptyState>
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <section aria-label="회의 목록" className="min-w-0">
            <div className="mb-3 grid min-w-0 gap-2 xl:grid-cols-[minmax(0,1fr)_minmax(10rem,12rem)_auto] xl:items-center">
              <label className="relative min-w-0">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-of-muted"
                  aria-hidden="true"
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="회의 제목 검색"
                  aria-label="회의 제목 검색"
                  className="pl-8"
                />
              </label>
              {canWrite ? (
                <>
                  <TemplateSelect
                    value={templateId}
                    onChange={setTemplateId}
                    options={templates.data?.items ?? []}
                  />
                  <Button size="sm" disabled={create.isPending || archived} onClick={newMeeting}>
                    <Plus size={14} /> 새 회의
                  </Button>
                </>
              ) : null}
            </div>
            {visible.length === 0 ? (
              <EmptyState
                title="검색 결과가 없습니다"
                hint="다른 회의 제목으로 다시 검색하세요."
                className="min-h-[220px] rounded-of border border-of-border bg-of-surface"
              />
            ) : (
              <ul className="min-w-0 divide-y divide-of-border overflow-hidden rounded-of border border-of-border bg-of-surface">
                {visible.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/projects/${projectId}/meetings/${m.id}`)}
                      className="grid w-full min-w-0 gap-1 px-3 py-3 text-left hover:bg-of-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <CalendarClock size={15} className="shrink-0 text-of-muted" />
                        <span className="min-w-0 truncate text-sm font-medium">{m.title}</span>
                        {m.recurrence ? (
                          <Badge variant="outline" className="shrink-0">반복</Badge>
                        ) : null}
                      </span>
                      <span className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-of-muted sm:justify-end">
                        <span>{m.scheduled_on ?? '일정 미정'}</span>
                        <span>{formatDateTime(m.updated_at)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <aside aria-label="회의 요약" className="grid min-w-0 gap-2 self-start">
            <SummaryTile icon={ClipboardList} label="전체 회의" value={String(data.total)} />
            <SummaryTile icon={CalendarClock} label="일정 있음" value={String(scheduled)} />
            <SummaryTile icon={TimerOff} label="일정 미정" value={String(data.total - scheduled)} />
            <SummaryTile icon={Repeat2} label="반복 회의" value={String(recurring)} />
          </aside>
        </div>
      )}
    </div>
  )
}

function TemplateSelect({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: Array<{ id: string; name: string }>
}) {
  return (
    <Select
      aria-label="회의 템플릿"
      className="h-8 min-w-0 text-xs"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">템플릿 없음</option>
      {options.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </Select>
  )
}

function SummaryTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ClipboardList
  label: string
  value: string
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-of border border-of-border bg-of-surface px-3 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-of bg-of-surface-2 text-of-muted">
        <Icon size={15} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] text-of-muted">{label}</span>
        <span className="block truncate text-sm font-medium">{value}</span>
      </span>
    </div>
  )
}
