import * as Dialog from '@radix-ui/react-dialog'
import { Columns3, List, MoreHorizontal, Plus, Search, Timeline, X } from 'lucide-react'
import { type FormEvent, type RefObject, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { FrameContextActions } from '@/components/shell/FrameContextActions'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useMe, useMemberNames, useMembers } from '@/features/members/api'
import type { Member } from '@/features/members/types'
import { dayIndex, pct } from '@/features/work-packages/timeline'
import { todayISO } from '@/lib/datetime'
import { cn } from '@/lib/utils'

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
  const [activeAction, setActiveAction] = useState<{
    top: number
    left: number
    trigger: HTMLButtonElement
  } | null>(null)
  const [name, setName] = useState(module.name)
  const [lead, setLead] = useState(module.lead_id ?? '')
  const [state, setState] = useState<ModuleState>(module.state)

  const openActionMenu = (trigger: HTMLButtonElement) => {
    const rect = trigger.getBoundingClientRect()
    const width = 240
    const height = 216
    const maxLeft = Math.max(8, window.innerWidth - width - 8)
    const maxTop = Math.max(8, window.innerHeight - height)
    const left = Math.min(Math.max(8, rect.right - width), maxLeft)
    const top = Math.min(Math.max(8, rect.bottom + 6), maxTop)
    setActiveAction({ top, left, trigger })
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
          aria-haspopup="menu"
          aria-expanded={activeAction !== null}
          aria-controls={activeAction ? `module-actions-${module.id}` : undefined}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-of border border-of-border text-of-muted hover:bg-of-surface-2 hover:text-of-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
          onClick={(event) => {
            if (activeAction) setActiveAction(null)
            else openActionMenu(event.currentTarget)
          }}
        >
          <MoreHorizontal size={14} />
        </button>
        {activeAction ? (
          <ModuleItemActions
            module={module}
            projectId={projectId}
            isOwner={isOwner}
            trigger={activeAction.trigger}
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

const LAYOUTS: Array<{
  value: ModuleLayout
  label: string
  icon: typeof List
}> = [
  { value: 'list', label: '목록', icon: List },
  { value: 'gallery', label: '갤러리', icon: Columns3 },
  { value: 'timeline', label: '타임라인', icon: Timeline },
]

type ModuleStateFilter = ModuleState | 'all'

function stateFilterFrom(value: string | null): ModuleStateFilter {
  return value && STATE_ORDER.includes(value as ModuleState) ? (value as ModuleState) : 'all'
}

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

function ModuleCreateDialog({
  open,
  projectId,
  members,
  returnFocusRef,
  onOpenChange,
}: {
  open: boolean
  projectId: string
  members: Member[]
  returnFocusRef: RefObject<HTMLButtonElement | null>
  onOpenChange: (open: boolean) => void
}) {
  const create = useCreateModule(projectId)
  const [name, setName] = useState('')
  const [lead, setLead] = useState('')

  const close = () => {
    if (create.isPending) return
    create.reset()
    setName('')
    setLead('')
    onOpenChange(false)
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!name.trim() || create.isPending) return
    create.mutate(
      { name: name.trim(), lead_id: lead || null },
      { onSuccess: close },
    )
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-80 bg-black/35 backdrop-blur-[1px] data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:fade-in motion-reduce:animate-none" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-81 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-of border border-of-border bg-of-surface shadow-xl data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 motion-reduce:animate-none"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            returnFocusRef.current?.focus()
          }}
        >
          <form onSubmit={submit}>
            <div className="border-b border-of-border px-5 py-4">
              <Dialog.Title className="text-base font-semibold">모듈 추가</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-5 text-of-muted">
                기능이나 릴리스 범위를 만들고 선택적으로 리드를 지정합니다.
              </Dialog.Description>
            </div>
            <div className="space-y-4 px-5 py-4">
              <label className="block text-xs font-medium">
                이름
                <Input
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="예: 결제 안정화"
                  aria-label="새 모듈 이름"
                  className="mt-1"
                />
              </label>
              <label className="block text-xs font-medium">
                리드
                <Select
                  aria-label="새 모듈 리드"
                  className="mt-1"
                  value={lead}
                  onChange={(event) => setLead(event.target.value)}
                >
                  <option value="">리드 없음</option>
                  {members.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.display_name}
                    </option>
                  ))}
                </Select>
              </label>
              {create.isError ? (
                <p role="alert" className="text-xs text-of-danger">
                  생성하지 못했습니다. 잠시 후 다시 시도하세요.
                </p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-of-border px-5 py-3">
              <Button type="button" variant="outline" disabled={create.isPending} onClick={close}>
                취소
              </Button>
              <Button
                type="submit"
                disabled={!name.trim() || create.isPending}
                aria-busy={create.isPending}
              >
                <Plus size={14} />
                {create.isPending ? '추가 중' : '모듈 추가'}
              </Button>
            </div>
          </form>
          <button
            type="button"
            aria-label="모듈 추가 창 닫기"
            disabled={create.isPending}
            className="absolute right-3 top-3 grid size-8 place-items-center rounded-of text-of-muted hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
            onClick={close}
          >
            <X size={15} />
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
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
  const [params, setParams] = useSearchParams()
  const modules = useModules(projectId)
  const me = useMe()
  const members = useMembers(projectId)
  const [createOpen, setCreateOpen] = useState(false)
  const createTriggerRef = useRef<HTMLButtonElement>(null)
  const [layout, setLayout] = useState<ModuleLayout>(loadLayout)
  const changeLayout = (next: ModuleLayout) => {
    setLayout(next)
    saveLayout(next)
  }
  const [actionMessage, setActionMessage] = useState<{
    text: string
    tone: 'info' | 'success' | 'error'
  } | null>(null)

  const myRole = members.data?.items.find((m) => m.user_id === me.data?.id)?.role
  const isOwner = myRole === 'owner'
  const items = useMemo(() => modules.data?.items ?? [], [modules.data?.items])
  const query = params.get('q')?.trim() ?? ''
  const stateFilter = stateFilterFrom(params.get('state'))
  const visibleItems = useMemo(
    () =>
      items.filter(
        (module) =>
          (stateFilter === 'all' || module.state === stateFilter) &&
          (!query || module.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())),
      ),
    [items, query, stateFilter],
  )

  const updateParams = (next: Record<string, string | null>) => {
    const copy = new URLSearchParams(params)
    Object.entries(next).forEach(([key, value]) => {
      if (value) copy.set(key, value)
      else copy.delete(key)
    })
    setParams(copy, { replace: true })
  }

  return (
    <div className="flex h-full min-w-0 flex-col bg-of-surface">
      <h1 className="sr-only">Modules</h1>
      <FrameContextActions>
        {isOwner ? (
          <Button
            ref={createTriggerRef}
            type="button"
            size="sm"
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={14} />
            모듈 추가
          </Button>
        ) : null}
      </FrameContextActions>

      <div className="flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-of-border px-3 py-1">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <label className="relative min-w-36 flex-1 sm:max-w-56">
            <span className="sr-only">모듈 검색</span>
            <Search
              size={13}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-of-muted"
            />
            <Input
              value={query}
              aria-label="모듈 검색"
              placeholder="모듈 검색"
              className="h-7 pl-7 pr-7 text-xs"
              onChange={(event) => updateParams({ q: event.target.value || null })}
            />
            {query ? (
              <button
                type="button"
                aria-label="모듈 검색 지우기"
                className="absolute right-1 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-of text-of-muted hover:bg-of-surface-hover"
                onClick={() => updateParams({ q: null })}
              >
                <X size={12} />
              </button>
            ) : null}
          </label>
          <Select
            aria-label="모듈 상태 필터"
            className="h-7 w-28 text-xs"
            value={stateFilter}
            onChange={(event) =>
              updateParams({ state: event.target.value === 'all' ? null : event.target.value })
            }
          >
            <option value="all">모든 상태</option>
            {STATE_ORDER.map((state) => (
              <option key={state} value={state}>
                {MODULE_STATE_LABELS[state]}
              </option>
            ))}
          </Select>
          <span className="shrink-0 text-[11px] tabular-nums text-of-muted">
            {visibleItems.length}/{items.length}
          </span>
        </div>

        <div className="flex shrink-0 items-center rounded-of border border-of-border bg-of-surface-2 p-0.5">
          {LAYOUTS.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.value}
                type="button"
                aria-label={item.label}
                aria-pressed={layout === item.value}
                title={item.label}
                className={cn(
                  'grid size-7 place-items-center rounded-of text-of-muted hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus',
                  layout === item.value && 'bg-of-surface text-of-text shadow-sm',
                )}
                onClick={() => changeLayout(item.value)}
              >
                <Icon size={14} />
              </button>
            )
          })}
        </div>
      </div>

      <main
        data-testid="modules-scroll"
        className="of-scrollbar min-h-0 flex-1 overflow-y-auto p-3 sm:p-5"
      >
        <div className="mx-auto max-w-6xl space-y-4">
          {modules.isPending || members.isPending ? <ListSkeleton /> : null}
          {modules.isError || members.isError ? (
            <ErrorState
              error={modules.error ?? members.error}
              onRetry={() => {
                void modules.refetch()
                void members.refetch()
              }}
            />
          ) : null}

          {actionMessage ? (
            <p
              role={actionMessage.tone === 'error' ? 'alert' : 'status'}
              className={cn(
                'rounded-of border bg-of-surface px-3 py-2 text-xs',
                actionMessage.tone === 'error'
                  ? 'border-of-danger/30 text-of-danger'
                  : 'border-of-border text-of-muted',
              )}
            >
              {actionMessage.text}
            </p>
          ) : null}

          {!modules.isPending &&
            !members.isPending &&
            !modules.isError &&
            !members.isError ? (
            visibleItems.length === 0 ? (
              <EmptyState
                title={query || stateFilter !== 'all' ? '조건에 맞는 모듈이 없습니다' : '모듈이 없습니다'}
                hint={
                  query || stateFilter !== 'all'
                    ? '검색어나 상태 필터를 조정해 보세요.'
                    : isOwner
                      ? '모듈 추가에서 첫 기능 범위를 만들어 보세요.'
                      : '프로젝트 소유자가 모듈을 만들 수 있습니다.'
                }
              >
                {query || stateFilter !== 'all' ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => updateParams({ q: null, state: null })}
                  >
                    필터 지우기
                  </Button>
                ) : null}
              </EmptyState>
            ) : (
              <div className="space-y-5">
                {layout === 'timeline' ? (
                  <ModuleTimeline modules={visibleItems} projectId={projectId} />
                ) : null}
                {layout !== 'timeline' &&
                  STATE_ORDER.map((state) => {
                    const group = visibleItems.filter((module) => module.state === state)
                    if (group.length === 0) return null
                    return (
                      <section key={state} aria-label={MODULE_STATE_LABELS[state]}>
                        <h2 className="mb-1.5 text-sm font-semibold">
                          {MODULE_STATE_LABELS[state]}{' '}
                          <span className="text-xs font-normal text-of-muted">
                            {group.length}
                          </span>
                        </h2>
                        {layout === 'gallery' ? (
                          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {group.map((module) => (
                              <ModuleCard
                                key={module.id}
                                module={module}
                                projectId={projectId}
                              />
                            ))}
                          </ul>
                        ) : (
                          <ul className="divide-y divide-of-border overflow-hidden rounded-of border border-of-border bg-of-surface">
                            {group.map((module) => (
                              <ModuleRow
                                key={module.id}
                                module={module}
                                isOwner={isOwner}
                                projectId={projectId}
                                members={members.data?.items ?? []}
                                onMessage={(text, tone = 'info') =>
                                  setActionMessage({ text, tone })
                                }
                              />
                            ))}
                          </ul>
                        )}
                      </section>
                    )
                  })}
              </div>
            )
          ) : null}
        </div>
      </main>

      {isOwner ? (
        <ModuleCreateDialog
          open={createOpen}
          projectId={projectId}
          members={members.data?.items ?? []}
          returnFocusRef={createTriggerRef}
          onOpenChange={setCreateOpen}
        />
      ) : null}
    </div>
  )
}
