import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useMe, useMemberNames, useMembers } from '@/features/members/api'
import { confirmDestructive } from '@/lib/guards'

import {
  MODULE_STATE_LABELS,
  type ModuleState,
  type ProjectModule,
  useCreateModule,
  useDeleteModule,
  useModules,
  useUpdateModule,
} from './api'

const STATE_ORDER: ModuleState[] = ['in_progress', 'planned', 'paused', 'completed', 'cancelled']

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-24 overflow-hidden rounded-full bg-of-surface-2"
      >
        <div className="h-full rounded-full bg-of-accent" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-of-muted">
        {done}/{total}
      </span>
    </div>
  )
}

function ModuleRow({
  module,
  isOwner,
  projectId,
}: {
  module: ProjectModule
  isOwner: boolean
  projectId: string
}) {
  const navigate = useNavigate()
  const update = useUpdateModule(projectId)
  const remove = useDeleteModule(projectId)
  const memberName = useMemberNames(projectId)

  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left text-[13px] font-medium hover:underline"
        onClick={() => navigate(`/projects/${projectId}/work-packages?module_id=${module.id}`)}
      >
        {module.name}
      </button>
      <span className="shrink-0 text-[11px] text-of-muted">
        리드: {module.lead_id ? memberName(module.lead_id) : '없음'}
      </span>
      <ProgressBar done={module.done_work_package_count} total={module.work_package_count} />
      {isOwner ? (
        <>
          <Select
            aria-label={`${module.name} 상태`}
            className="h-7 w-28 text-xs"
            value={module.state}
            disabled={update.isPending}
            onChange={(e) =>
              update.mutate({ moduleId: module.id, state: e.target.value as ModuleState })
            }
          >
            {STATE_ORDER.map((s) => (
              <option key={s} value={s}>
                {MODULE_STATE_LABELS[s]}
              </option>
            ))}
          </Select>
          <button
            type="button"
            aria-label={`${module.name} 삭제`}
            disabled={remove.isPending}
            className="shrink-0 rounded-of p-1 text-of-muted hover:bg-of-surface-2 hover:text-of-danger"
            onClick={() => {
              if (
                confirmDestructive(
                  `'${module.name}' 모듈을 삭제할까요?\n연결된 작업 ${module.work_package_count}건은 삭제되지 않고 모듈 배정만 해제됩니다.`,
                )
              )
                remove.mutate(module.id)
            }}
          >
            <Trash2 size={13} />
          </button>
        </>
      ) : (
        <span className="shrink-0 text-[11px] text-of-muted">
          {MODULE_STATE_LABELS[module.state]}
        </span>
      )}
    </li>
  )
}

/* Project modules/feature groups (expansion PLAN Pass 1 PR-D): explicit-state
   groupings with a lead and progress. Management is owner-only; assigning work
   happens in the work-package drawer. */
export function ModulesPage() {
  const { projectId } = useParams() as { projectId: string }
  const modules = useModules(projectId)
  const me = useMe()
  const members = useMembers(projectId)

  const [name, setName] = useState('')
  const [lead, setLead] = useState('')
  const create = useCreateModule(projectId)

  if (modules.isPending || members.isPending) return <ListSkeleton />
  if (modules.isError) return <ErrorState error={modules.error} onRetry={() => modules.refetch()} />

  const myRole = members.data?.items.find((m) => m.user_id === me.data?.id)?.role
  const isOwner = myRole === 'owner'
  const items = modules.data.items

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 text-base font-semibold">모듈</h1>
      <p className="mb-4 text-xs text-of-muted">
        기능/릴리스 단위로 작업을 묶어 상태와 진행률을 봅니다. 작업 배정은 각 작업의 드로어에서 합니다.
      </p>

      {isOwner ? (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-of border border-of-border bg-of-surface p-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="모듈 이름"
            aria-label="새 모듈 이름"
            className="h-8 w-44 text-xs"
          />
          <Select
            aria-label="새 모듈 리드"
            className="h-8 w-36 text-xs"
            value={lead}
            onChange={(e) => setLead(e.target.value)}
          >
            <option value="">리드 없음</option>
            {members.data?.items.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            disabled={!name.trim() || create.isPending}
            onClick={() =>
              create.mutate(
                { name: name.trim(), lead_id: lead || null },
                {
                  onSuccess: () => {
                    setName('')
                    setLead('')
                  },
                },
              )
            }
          >
            모듈 추가
          </Button>
          {create.isError ? (
            <p role="alert" className="w-full text-xs text-of-danger">
              생성하지 못했습니다.
            </p>
          ) : null}
        </div>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          title="모듈이 없습니다"
          hint={isOwner ? '위에서 첫 모듈을 만들어 보세요.' : '소유자가 모듈을 만들 수 있습니다.'}
        />
      ) : (
        <div className="space-y-5">
          {STATE_ORDER.map((state) => {
            const group = items.filter((m) => m.state === state)
            if (group.length === 0) return null
            return (
              <section key={state} aria-label={MODULE_STATE_LABELS[state]}>
                <h2 className="mb-1.5 text-sm font-semibold">
                  {MODULE_STATE_LABELS[state]}{' '}
                  <span className="text-xs font-normal text-of-muted">{group.length}</span>
                </h2>
                <ul className="divide-y divide-of-border overflow-hidden rounded-of border border-of-border bg-of-surface">
                  {group.map((m) => (
                    <ModuleRow key={m.id} module={m} isOwner={isOwner} projectId={projectId} />
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
