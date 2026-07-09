import { MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useMe, useMemberNames, useMembers } from '@/features/members/api'
import type { Member } from '@/features/members/types'
import { dayIndex, pct } from '@/features/work-packages/timeline'
import { todayISO } from '@/lib/datetime'

import {
  MODULE_STATE_LABELS,
  type ModuleState,
  type ProjectModule,
  useCreateModule,
  useModuleMembers,
  useReplaceModuleMembers,
  useModules,
  useUpdateModule,
} from './api'
import { ModuleItemActions } from './ModuleItemActions'
import { moduleBars } from './moduleTimeline'

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

/* Roster panel (Pass 65): the count shows currently-ELIGIBLE participants;
   owners edit via full-replace PUT (viewers are shown disabled — they cannot
   participate, matching the assignment rule). */
function ModuleMembersPanel({
  module,
  projectId,
  isOwner,
}: {
  module: ProjectModule
  projectId: string
  isOwner: boolean
}) {
  const roster = useModuleMembers(projectId, module.id, true)
  const replace = useReplaceModuleMembers(projectId, module.id)
  const members = useMembers(projectId)
  const [draft, setDraft] = useState<string[] | null>(null)

  if (!roster.data) return <p className="px-1 py-1 text-[11px] text-of-muted">불러오는 중…</p>
  const current = roster.data.items.map((i) => i.user_id)
  const selected = draft ?? current

  const toggle = (id: string) =>
    setDraft(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])

  return (
    <div className="mt-1 rounded-of border border-of-border bg-of-surface-2/50 p-2">
      {isOwner ? (
        <>
          <ul className="flex flex-wrap gap-2">
            {(members.data?.items ?? []).map((m) => (
              <li key={m.user_id}>
                <label
                  className={`flex items-center gap-1 text-[11px] ${m.role === 'viewer' ? 'text-of-muted' : ''}`}
                >
                  <input
                    type="checkbox"
                    className="h-3 w-3 accent-of-accent"
                    checked={selected.includes(m.user_id)}
                    disabled={m.role === 'viewer' || replace.isPending}
                    onChange={() => toggle(m.user_id)}
                    aria-label={`${module.name} 참여자 ${m.display_name}`}
                  />
                  {m.display_name}
                  {m.role === 'viewer' ? ' (뷰어)' : ''}
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-1.5 flex items-center gap-2">
            <Button
              size="sm"
              disabled={draft === null || replace.isPending}
              onClick={() => replace.mutate(selected, { onSuccess: () => setDraft(null) })}
            >
              참여자 저장
            </Button>
            {replace.isError ? (
              <span className="text-[11px] text-of-danger">
                저장 실패 — 활성 멤버(뷰어 제외)만 참여할 수 있습니다.
              </span>
            ) : null}
          </div>
        </>
      ) : roster.data.total === 0 ? (
        <p className="text-[11px] text-of-muted">참여자가 없습니다.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {roster.data.items.map((i) => (
            <li key={i.user_id} className="rounded-full bg-of-surface px-2 py-0.5 text-[11px]">
              {i.display_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ModuleRow({
  module,
  isOwner,
  projectId,
  members,
  onMessage,
}: {
  module: ProjectModule
  isOwner: boolean
  projectId: string
  members: Member[]
  onMessage: (message: string, tone?: 'info' | 'success' | 'error') => void
}) {
  const navigate = useNavigate()
  const update = useUpdateModule(projectId)
  const memberName = useMemberNames(projectId)
  const [editing, setEditing] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const [activeAction, setActiveAction] = useState<{ top: number; left: number } | null>(null)
  const [name, setName] = useState(module.name)
  const [lead, setLead] = useState(module.lead_id ?? '')
  const [state, setState] = useState<ModuleState>(module.state)

  const openActionMenu = (rect: DOMRect) => {
    const width = 240
    const height = 216
    const maxLeft = Math.max(8, window.innerWidth - width - 8)
    const maxTop = Math.max(8, window.innerHeight - height)
    const left = Math.min(Math.max(8, rect.right - width), maxLeft)
    const top = Math.min(Math.max(8, rect.bottom + 6), maxTop)
    setActiveAction({ top, left })
  }

  const cancelEdit = () => {
    setName(module.name)
    setLead(module.lead_id ?? '')
    setState(module.state)
    setEditing(false)
  }

  if (editing) {
    return (
      <li className="flex flex-wrap items-center gap-2 px-3 py-2">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label="모듈 이름 편집"
          className="h-7 w-44 text-xs"
        />
        <Select
          aria-label="모듈 리드 편집"
          className="h-7 w-36 text-xs"
          value={lead}
          onChange={(event) => setLead(event.target.value)}
        >
          <option value="">리드 없음</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.display_name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="모듈 상태 편집"
          className="h-7 w-32 text-xs"
          value={state}
          onChange={(event) => setState(event.target.value as ModuleState)}
        >
          {STATE_ORDER.map((s) => (
            <option key={s} value={s}>
              {MODULE_STATE_LABELS[s]}
            </option>
          ))}
        </Select>
        <Button
          size="sm"
          disabled={!name.trim() || update.isPending}
          onClick={() =>
            update.mutate(
              {
                moduleId: module.id,
                name: name.trim(),
                lead_id: lead || null,
                state,
              },
              {
                onSuccess: () => {
                  setEditing(false)
                  onMessage(`'${name.trim()}' 모듈을 저장했습니다.`, 'success')
                },
                onError: () => onMessage('모듈을 저장하지 못했습니다.', 'error'),
              },
            )
          }
        >
          저장
        </Button>
        <Button size="sm" variant="outline" onClick={cancelEdit}>
          취소
        </Button>
        {update.isError ? (
          <p role="alert" className="w-full text-xs text-of-danger">
            저장하지 못했습니다.
          </p>
        ) : null}
      </li>
    )
  }

  return (
    <li className="px-3 py-2">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button
              type="button"
              className="min-w-0 max-w-full truncate text-left text-[13px] font-medium hover:underline"
              onClick={() =>
                navigate(`/projects/${projectId}/work-packages?module_id=${module.id}`)
              }
            >
              {module.name}
            </button>
            <Badge variant="neutral">{MODULE_STATE_LABELS[module.state]}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="shrink-0 text-[11px] text-of-muted">
              리드: {module.lead_id ? memberName(module.lead_id) : '없음'}
            </span>
            <span className="shrink-0 text-[11px] text-of-muted">
              참여자 {module.member_count}
            </span>
            <ProgressBar done={module.done_work_package_count} total={module.work_package_count} />
          </div>
        </div>
        <button
          type="button"
          aria-label={`${module.name} 모듈 작업`}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-of border border-of-border text-of-muted hover:bg-of-surface-2 hover:text-of-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
          onClick={(event) => openActionMenu(event.currentTarget.getBoundingClientRect())}
        >
          <MoreHorizontal size={14} />
        </button>
        {activeAction ? (
          <ModuleItemActions
            module={module}
            projectId={projectId}
            isOwner={isOwner}
            top={activeAction.top}
            left={activeAction.left}
            onOpenWorkItems={(moduleId) =>
              navigate(`/projects/${projectId}/work-packages?module_id=${moduleId}`)
            }
            onEdit={() => setEditing(true)}
            onToggleMembers={() => setShowMembers((v) => !v)}
            onMessage={onMessage}
            onClose={() => setActiveAction(null)}
          />
        ) : null}
      </div>
      {showMembers ? (
        <ModuleMembersPanel module={module} projectId={projectId} isOwner={isOwner} />
      ) : null}
    </li>
  )
}

/* Project modules/feature groups (expansion PLAN Pass 1 PR-D): explicit-state
   groupings with a lead and progress. Management is owner-only; assigning work
   happens in the work-package drawer. */
const LAYOUT_STORAGE_KEY = 'oneflow.modules.layout.v1'

type ModuleLayout = 'list' | 'gallery' | 'timeline'

/** Broken values fall back to list (#97 contract). */
function loadLayout(): ModuleLayout {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
    return raw === 'gallery' || raw === 'timeline' ? raw : 'list'
  } catch {
    return 'list'
  }
}

function saveLayout(layout: ModuleLayout) {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, layout)
  } catch {
    // private mode / quota — in-memory only
  }
}

/* Gallery card (Pass 56): the same data as the row, arranged for scanning. */
function ModuleCard({ module, projectId }: { module: ProjectModule; projectId: string }) {
  const navigate = useNavigate()
  const memberName = useMemberNames(projectId)
  const done = module.done_work_package_count
  const total = module.work_package_count
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <li className="space-y-2 rounded-of border border-of-border bg-of-surface p-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-[13px] font-medium hover:text-of-accent"
          onClick={() => navigate(`/projects/${projectId}/work-packages?module_id=${module.id}`)}
        >
          {module.name}
        </button>
        <Badge variant="neutral">{MODULE_STATE_LABELS[module.state]}</Badge>
      </div>
      <p className="text-[11px] text-of-muted">
        리드 {module.lead_id ? memberName(module.lead_id) : '없음'}
        {module.start_date || module.target_date
          ? ` · ${module.start_date ?? '?'} → ${module.target_date ?? '?'}`
          : ''}
      </p>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-of-surface-2">
          <div className="h-full bg-of-accent" style={{ width: `${pct}%` }} />
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-of-muted">
          {done}/{total}
        </span>
      </div>
    </li>
  )
}

/* Timeline-lite (Pass 59): bars from start→target reusing the WP timeline's
   UTC day helpers; modules without both dates list below. */
function ModuleTimeline({ modules, projectId }: { modules: ProjectModule[]; projectId: string }) {
  const navigate = useNavigate()
  const todayIdx = dayIndex(todayISO()) ?? 0
  const model = moduleBars(modules, todayIdx)
  if (!model) {
    return (
      <p className="rounded-of border border-of-border bg-of-surface p-3 text-xs text-of-muted">
        시작일과 목표일이 모두 있는 모듈이 없어 타임라인을 그릴 수 없습니다.
      </p>
    )
  }
  const left = (idx: number) => `${pct(idx - model.rangeStart, model.totalDays)}%`
  const width = (b: { startIdx: number; endIdx: number }) =>
    `${Math.max(pct(b.endIdx - b.startIdx + 1, model.totalDays), 1)}%`
  const todayLeft =
    todayIdx >= model.rangeStart && todayIdx <= model.rangeEnd ? left(todayIdx) : null
  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-of border border-of-border bg-of-surface">
        {model.bars.map((b) => (
          <div
            key={b.module.id}
            className="flex items-center border-b border-of-border/60 last:border-b-0"
          >
            <button
              type="button"
              className="w-40 shrink-0 truncate border-r border-of-border px-3 py-2 text-left text-[13px] hover:text-of-accent"
              onClick={() =>
                navigate(`/projects/${projectId}/work-packages?module_id=${b.module.id}`)
              }
            >
              {b.module.name}
            </button>
            <div className="relative h-8 flex-1">
              {todayLeft ? (
                <div
                  className="absolute top-0 h-full border-l-2 border-of-danger/70"
                  style={{ left: todayLeft }}
                  aria-hidden
                />
              ) : null}
              <div
                className="absolute top-2 h-4 rounded-sm bg-of-accent/70"
                style={{ left: left(b.startIdx), width: width(b) }}
                title={`${b.module.start_date} → ${b.module.target_date}`}
                aria-label={`${b.module.name} 기간`}
              />
            </div>
          </div>
        ))}
      </div>
      {model.undated.length > 0 ? (
        <p className="text-xs text-of-muted">
          기간 미정 {model.undated.length}건: {model.undated.map((m) => m.name).join(', ')}
        </p>
      ) : null}
    </div>
  )
}

export function ModulesPage() {
  const { projectId } = useParams() as { projectId: string }
  const modules = useModules(projectId)
  const me = useMe()
  const members = useMembers(projectId)

  const [name, setName] = useState('')
  const [lead, setLead] = useState('')
  const [layout, setLayout] = useState<ModuleLayout>(loadLayout)
  const changeLayout = (next: ModuleLayout) => {
    setLayout(next)
    saveLayout(next)
  }
  const create = useCreateModule(projectId)
  const [actionMessage, setActionMessage] = useState<{
    text: string
    tone: 'info' | 'success' | 'error'
  } | null>(null)

  if (modules.isPending || members.isPending) return <ListSkeleton />
  if (modules.isError) return <ErrorState error={modules.error} onRetry={() => modules.refetch()} />

  const myRole = members.data?.items.find((m) => m.user_id === me.data?.id)?.role
  const isOwner = myRole === 'owner'
  const items = modules.data.items

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 text-base font-semibold">모듈</h1>
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-xs text-of-muted">
          기능/릴리스 단위로 작업을 묶어 상태와 진행률을 봅니다. 작업 배정은 각 작업의 드로어에서 합니다.
        </p>
        <div className="flex shrink-0 items-center gap-1 text-xs">
          {(['list', 'gallery', 'timeline'] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={layout === l}
              className={`rounded-of border px-2 py-1 ${
                layout === l
                  ? 'border-of-accent bg-of-accent-soft text-of-accent'
                  : 'border-of-border text-of-muted hover:bg-of-surface-2'
              }`}
              onClick={() => changeLayout(l)}
            >
              {l === 'list' ? '목록' : l === 'gallery' ? '갤러리' : '타임라인'}
            </button>
          ))}
        </div>
      </div>
      {actionMessage ? (
        <p
          role={actionMessage.tone === 'error' ? 'alert' : 'status'}
          className={
            actionMessage.tone === 'error'
              ? 'mb-3 text-xs text-of-danger'
              : 'mb-3 text-xs text-of-muted'
          }
        >
          {actionMessage.text}
        </p>
      ) : null}

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
          {layout === 'timeline' ? (
            <ModuleTimeline modules={items} projectId={projectId} />
          ) : null}
          {layout !== 'timeline' &&
            STATE_ORDER.map((state) => {
            const group = items.filter((m) => m.state === state)
            if (group.length === 0) return null
            return (
              <section key={state} aria-label={MODULE_STATE_LABELS[state]}>
                <h2 className="mb-1.5 text-sm font-semibold">
                  {MODULE_STATE_LABELS[state]}{' '}
                  <span className="text-xs font-normal text-of-muted">{group.length}</span>
                </h2>
                {layout === 'gallery' ? (
                  <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {group.map((m) => (
                      <ModuleCard key={m.id} module={m} projectId={projectId} />
                    ))}
                  </ul>
                ) : (
                  <ul className="divide-y divide-of-border overflow-hidden rounded-of border border-of-border bg-of-surface">
                    {group.map((m) => (
                      <ModuleRow
                        key={m.id}
                        module={m}
                        isOwner={isOwner}
                        projectId={projectId}
                        members={members.data?.items ?? []}
                        onMessage={(text, tone = 'info') => setActionMessage({ text, tone })}
                      />
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
