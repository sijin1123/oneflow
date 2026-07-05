import { Plus, Search } from 'lucide-react'
import { useLocation, useParams, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useProjects } from '@/features/projects/api'

export function Topbar() {
  const { projectId } = useParams()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data } = useProjects()

  const project = data?.items.find((p) => p.id === projectId)
  const section = location.pathname.endsWith('/board')
    ? 'Board'
    : location.pathname.endsWith('/timeline')
      ? 'Timeline'
      : location.pathname.endsWith('/settings')
        ? 'Settings'
        : projectId
          ? 'Work Packages'
          : '프로젝트'
  // Search (?q=) and inline creation (?new=1) are consumed by the list view
  // only — showing them on Board/Timeline would be dead controls (finding #6).
  const onListView = Boolean(projectId) && location.pathname.endsWith('/work-packages')

  const onSearch = (value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set('q', value)
        else next.delete('q')
        return next
      },
      { replace: true },
    )
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-of-border bg-of-surface px-4">
      <nav className="flex min-w-0 items-center gap-1.5 text-sm" aria-label="현재 위치">
        {project ? (
          <>
            <span className="truncate text-of-muted">{project.name}</span>
            <span className="text-of-muted">/</span>
          </>
        ) : null}
        <span className="font-medium">{section}</span>
      </nav>

      <div className="ml-auto flex items-center gap-2">
        {onListView ? (
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-of-muted"
            />
            <Input
              defaultValue={searchParams.get('q') ?? ''}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSearch(e.currentTarget.value)
              }}
              placeholder="제목 검색 (Enter)"
              aria-label="워크패키지 검색"
              className="w-56 pl-8"
            />
          </div>
        ) : null}
        {onListView ? (
          <Button
            size="sm"
            onClick={() =>
              setSearchParams((prev) => {
                const next = new URLSearchParams(prev)
                next.set('new', '1')
                return next
              })
            }
          >
            <Plus /> 새 작업
          </Button>
        ) : null}
      </div>
    </header>
  )
}
