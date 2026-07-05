import { CalendarClock, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { useCreateMeeting, useMeetings } from './api'

export function MeetingsPage() {
  const { projectId } = useParams() as { projectId: string }
  const navigate = useNavigate()
  const { data, isPending, isError, error, refetch } = useMeetings(projectId)
  const create = useCreateMeeting(projectId)
  const [query, setQuery] = useState('')

  const newMeeting = () => {
    create.mutate(
      { title: '제목 없는 회의' },
      { onSuccess: (m) => navigate(`/projects/${projectId}/meetings/${m.id}`) },
    )
  }

  const q = query.trim().toLowerCase()
  const visible = (data?.items ?? []).filter((m) => m.title.toLowerCase().includes(q))

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-base font-semibold">회의</h1>
        <Button size="sm" disabled={create.isPending} onClick={newMeeting}>
          <Plus size={14} /> 새 회의
        </Button>
      </div>

      {isPending ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : data.total === 0 ? (
        <EmptyState title="회의가 없습니다" hint="새 회의를 만들어 안건·회의록·액션 아이템을 정리하세요." />
      ) : (
        <>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="회의 제목 검색"
            aria-label="회의 제목 검색"
            className="mb-3"
          />
          {visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-of-muted">검색 결과가 없습니다.</p>
          ) : (
            <ul className="divide-y divide-of-border overflow-hidden rounded-of border border-of-border bg-of-surface">
              {visible.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/projects/${projectId}/meetings/${m.id}`)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-of-surface-2"
                  >
                    <CalendarClock size={15} className="shrink-0 text-of-muted" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.title}</span>
                    <span className="shrink-0 text-xs text-of-muted">
                      {m.scheduled_on ?? '일정 미정'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
