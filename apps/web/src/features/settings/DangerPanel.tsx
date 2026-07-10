import { useParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { useArchiveProject, useProject } from '@/features/projects/api'
import { confirmDestructive } from '@/lib/guards'

/* Danger zone (expansion Pass 2 PR-G): archive makes the whole project
   read-only (every write returns 409) until the owner restores it. */
export function DangerPanel({ isOwner }: { isOwner: boolean }) {
  const { projectId } = useParams() as { projectId: string }
  const project = useProject(projectId)
  const archive = useArchiveProject(projectId)

  if (!project.data) return null
  const archived = project.data.archived_at !== null

  return (
    <div className="space-y-3 rounded-of border border-of-danger/40 bg-of-surface p-3">
      <p className="text-xs font-semibold text-of-danger">위험 구역</p>
      {archived ? (
        <p className="rounded-of bg-of-surface-2 px-3 py-2 text-xs">
          이 프로젝트는 <span className="font-medium">보관됨</span> 상태입니다. 읽기는 가능하지만
          모든 변경이 차단됩니다.
        </p>
      ) : (
        <p className="text-xs text-of-muted">
          보관하면 프로젝트 전체가 읽기 전용이 됩니다. 언제든 복원할 수 있습니다.
        </p>
      )}
      {isOwner ? (
        <Button
          size="sm"
          variant={archived ? 'outline' : 'danger'}
          disabled={archive.isPending}
          onClick={() => {
            if (archived) {
              archive.mutate(false)
              return
            }
            if (
              confirmDestructive(
                `'${project.data?.name}' 프로젝트를 보관할까요?\n보관 중에는 모든 변경이 차단됩니다(복원 가능).`,
              )
            )
              archive.mutate(true)
          }}
        >
          {archived ? '프로젝트 복원' : '프로젝트 보관'}
        </Button>
      ) : (
        <p className="text-xs text-of-muted">소유자만 보관/복원할 수 있습니다.</p>
      )}
      {archive.isError ? (
        <p role="alert" className="text-xs text-of-danger">
          처리하지 못했습니다.
        </p>
      ) : null}
    </div>
  )
}
