import { FolderKanban } from 'lucide-react'
import { Link } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'

import { useProjects } from './api'

export function ProjectsPage() {
  const { data, isPending, isError, error, refetch } = useProjects()

  if (isPending) return <ListSkeleton />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />
  if (data.total === 0)
    return (
      <EmptyState
        title="아직 프로젝트가 없습니다"
        hint="백엔드 시드(make api-seed)를 실행하면 데모 프로젝트가 생성됩니다."
      />
    )

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-base font-semibold">프로젝트</h1>
      <ul className="divide-y divide-of-border overflow-hidden rounded-of border border-of-border bg-of-surface">
        {data.items.map((p) => (
          <li key={p.id}>
            <Link
              to={`/projects/${p.id}/work-packages`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-of-surface-2"
            >
              <FolderKanban size={16} className="shrink-0 text-of-accent" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  <span className="mr-1.5 text-of-muted">{p.key}</span>
                  {p.name}
                </p>
                {p.description ? (
                  <p className="truncate text-xs text-of-muted">{p.description}</p>
                ) : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
