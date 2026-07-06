import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCreateMilestone, useDeleteMilestone, useMilestones } from '@/features/milestones/api'

export function MilestonesPanel({
  projectId,
  isOwner,
  onDirtyChange,
}: {
  projectId: string
  isOwner: boolean
  onDirtyChange: (dirty: boolean) => void
}) {
  const milestones = useMilestones(projectId)
  const createMilestone = useCreateMilestone(projectId)
  const deleteMilestone = useDeleteMilestone(projectId)

  const [msName, setMsName] = useState('')
  const [msDue, setMsDue] = useState('')

  const dirty = msName.trim() !== '' || msDue !== ''
  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  return (
    <div className="space-y-2 rounded-of border border-of-border bg-of-surface p-3">
      <p className="text-xs font-medium">마일스톤</p>
      {milestones.data && milestones.data.total > 0 ? (
        <ul className="space-y-1">
          {milestones.data.items.map((m) => (
            <li
              key={m.id}
              className="flex items-center gap-2 rounded-of border border-of-border px-2 py-1.5 text-xs"
            >
              <span className="min-w-0 flex-1 truncate font-medium">{m.name}</span>
              <span className="shrink-0 text-of-muted">{m.due_date ?? '기한 없음'}</span>
              {isOwner ? (
                <button
                  type="button"
                  aria-label={`${m.name} 삭제`}
                  className="shrink-0 rounded-of p-1 text-of-muted hover:bg-of-surface-2 hover:text-of-danger"
                  onClick={() => deleteMilestone.mutate(m.id)}
                >
                  <Trash2 size={13} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-of-muted">마일스톤이 없습니다.</p>
      )}
      {isOwner ? (
        <div className="flex items-center gap-2">
          <Input
            value={msName}
            onChange={(e) => setMsName(e.target.value)}
            placeholder="마일스톤 이름"
            aria-label="마일스톤 이름"
            className="flex-1"
          />
          <Input
            type="date"
            value={msDue}
            onChange={(e) => setMsDue(e.target.value)}
            aria-label="마일스톤 기한"
            className="w-36"
          />
          <Button
            size="sm"
            disabled={!msName.trim() || createMilestone.isPending}
            onClick={() =>
              createMilestone.mutate(
                { name: msName.trim(), due_date: msDue || null },
                {
                  onSuccess: () => {
                    setMsName('')
                    setMsDue('')
                  },
                },
              )
            }
          >
            추가
          </Button>
        </div>
      ) : null}
    </div>
  )
}
