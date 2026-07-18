import {
  ArrowUpRight,
  Bell,
  BellOff,
  CalendarDays,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Unlink,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { HEALTH_LABELS, HEALTH_STYLES } from '@/features/projects/types'
import {
  PRIORITY_LABELS,
  type WpPriority,
} from '@/features/work-packages/types'
import { useStatusLabels } from '@/features/work-packages/useStatusLabels'

import {
  INITIATIVE_STATE_LABELS,
  type Initiative,
  type InitiativeLabel,
  type InitiativeWorkItem,
  useConnectInitiativeWorkItem,
  useDisconnectInitiativeWorkItem,
  useInitiativeWorkItemCandidates,
  useInitiativeWorkItems,
  useUpdateInitiative,
  useUpdateInitiativeSubscription,
} from './api'
import { InitiativeActivityPanel } from './InitiativeActivityPanel'
import { InitiativeLifecyclePanel } from './InitiativeLifecyclePanel'
import { InitiativeOrganizationPanel } from './InitiativeOrganizationPanel'

function WorkItemMeta({ item }: { item: InitiativeWorkItem }) {
  const statusLabel = useStatusLabels(item.project_id)
  const priority = PRIORITY_LABELS[item.priority as WpPriority] ?? item.priority
  return (
    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
      <Badge variant="neutral">{statusLabel(item.status)}</Badge>
      <Badge variant="outline">{priority}</Badge>
      {item.due_date ? (
        <span className="inline-flex items-center gap-1 text-[11px] text-of-muted">
          <CalendarDays size={11} aria-hidden="true" /> {item.due_date}
        </span>
      ) : null}
    </div>
  )
}

function ScopeRow({
  item,
  canEdit,
  busy,
  onOpen,
  onDisconnect,
}: {
  item: InitiativeWorkItem
  canEdit: boolean
  busy: boolean
  onOpen: () => void
  onDisconnect: () => void
}) {
  return (
    <li className="flex min-w-0 items-start gap-2 border-b border-of-border-subtle py-2.5 last:border-b-0">
      <button
        type="button"
        className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
        onClick={onOpen}
      >
        <span className="block truncate text-[11px] text-of-muted">{item.project_name}</span>
        <span className="mt-0.5 block text-[13px] font-medium text-of-text hover:text-of-accent">
          {item.subject}
        </span>
        <WorkItemMeta item={item} />
      </button>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="icon" variant="ghost" aria-label={`${item.subject} 열기`} onClick={onOpen}>
          <ArrowUpRight />
        </Button>
        {canEdit ? (
          <Button
            size="icon"
            variant="ghost"
            aria-label={`${item.subject} 이니셔티브 연결 해제`}
            disabled={busy}
            onClick={onDisconnect}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Unlink />}
          </Button>
        ) : null}
      </div>
    </li>
  )
}

function CandidateRow({
  item,
  busy,
  onConnect,
}: {
  item: InitiativeWorkItem
  busy: boolean
  onConnect: () => void
}) {
  return (
    <li className="flex min-w-0 items-center gap-2 border-b border-of-border-subtle py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[11px] text-of-muted">{item.project_name}</span>
        <span className="block truncate text-xs font-medium">{item.subject}</span>
        <WorkItemMeta item={item} />
      </div>
      <Button size="sm" variant="outline" disabled={busy} onClick={onConnect}>
        {busy ? <Loader2 className="animate-spin" /> : <Link2 />}
        연결
      </Button>
    </li>
  )
}

export function InitiativeDetailDrawer({
  initiative,
  availableLabels,
  onClose,
}: {
  initiative: Initiative | null
  availableLabels: InitiativeLabel[]
  onClose: () => void
}) {
  return (
    <Sheet open={initiative !== null} onOpenChange={(open) => !open && onClose()}>
      {initiative ? (
        <InitiativeDetailBody
          key={initiative.id}
          initiative={initiative}
          availableLabels={availableLabels}
          onClose={onClose}
        />
      ) : null}
    </Sheet>
  )
}

function InitiativeDetailBody({
  initiative,
  availableLabels,
  onClose,
}: {
  initiative: Initiative
  availableLabels: InitiativeLabel[]
  onClose: () => void
}) {
  const navigate = useNavigate()
  const update = useUpdateInitiative()
  const scope = useInitiativeWorkItems(initiative.id, true)
  const connect = useConnectInitiativeWorkItem(initiative.id)
  const disconnect = useDisconnectInitiativeWorkItem(initiative.id)
  const subscription = useUpdateInitiativeSubscription(initiative.id)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [draftQuery, setDraftQuery] = useState('')
  const [query, setQuery] = useState('')
  const [editingDetails, setEditingDetails] = useState(false)
  const [name, setName] = useState(initiative.name)
  const [description, setDescription] = useState(initiative.description ?? '')
  const [startDate, setStartDate] = useState(initiative.start_date ?? '')
  const [targetDate, setTargetDate] = useState(initiative.target_date ?? '')
  const candidates = useInitiativeWorkItemCandidates(
    initiative.id,
    query,
    pickerOpen && initiative.is_mine,
  )

  const openWorkItem = (item: InitiativeWorkItem) =>
    navigate(`/projects/${item.project_id}/work-packages/${item.id}`)
  const hiddenCount = scope.data
    ? Math.max(0, scope.data.connected_work_item_count - scope.data.total)
    : 0
  const visibleOverflow = scope.data
    ? Math.max(0, scope.data.total - scope.data.items.length)
    : 0
  const invalidDateRange = Boolean(startDate && targetDate && startDate > targetDate)
  const resetDetails = () => {
    setName(initiative.name)
    setDescription(initiative.description ?? '')
    setStartDate(initiative.start_date ?? '')
    setTargetDate(initiative.target_date ?? '')
    update.reset()
  }

  return (
    <SheetContent title="이니셔티브 상세" className="max-w-2xl">
      <header className="border-b border-of-border-subtle pb-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{initiative.name}</h2>
          <Badge variant="accent">{INITIATIVE_STATE_LABELS[initiative.state]}</Badge>
          {initiative.health ? (
            <span className={`rounded-of px-1.5 py-0.5 text-[10px] font-medium ${HEALTH_STYLES[initiative.health]}`}>
              {HEALTH_LABELS[initiative.health]}
            </span>
          ) : null}
          {initiative.is_mine ? (
            <Button
              size="sm"
              variant={editingDetails ? 'secondary' : 'outline'}
              aria-expanded={editingDetails}
              onClick={() => {
                if (!editingDetails) resetDetails()
                setEditingDetails((editing) => !editing)
              }}
            >
              {editingDetails ? <X /> : <Pencil />}
              {editingDetails ? '편집 닫기' : '기본 정보 편집'}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant={initiative.is_following ? 'secondary' : 'outline'}
            disabled={subscription.isPending}
            aria-pressed={initiative.is_following}
            onClick={() => subscription.mutate(!initiative.is_following)}
          >
            {initiative.is_following ? <BellOff /> : <Bell />}
            {initiative.is_following ? '팔로잉' : '팔로우'}
          </Button>
        </div>
        <p className="mt-1 text-xs text-of-muted">
          {initiative.description ?? '연결된 작업으로 이니셔티브의 실제 전략 범위를 구성합니다.'}
        </p>
        {editingDetails && initiative.is_mine ? (
          <form
            aria-label="이니셔티브 기본 정보 편집"
            className="mt-3 grid min-w-0 gap-3 border-y border-of-border-subtle bg-of-surface-2 px-3 py-3"
            onSubmit={(event) => {
              event.preventDefault()
              if (!name.trim() || invalidDateRange || update.isPending) return
              update.mutate(
                {
                  id: initiative.id,
                  name: name.trim(),
                  description: description.trim() || null,
                  start_date: startDate || null,
                  target_date: targetDate || null,
                },
                { onSuccess: () => setEditingDetails(false) },
              )
            }}
          >
            <label className="min-w-0 space-y-1 text-xs font-medium text-of-muted">
              이름
              <Input
                autoFocus
                aria-label="이니셔티브 이름"
                className="h-8 min-w-0 bg-of-surface text-xs"
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="min-w-0 space-y-1 text-xs font-medium text-of-muted">
              설명
              <Textarea
                aria-label="이니셔티브 설명"
                className="min-h-20 bg-of-surface text-xs"
                maxLength={10_000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="전략 목표와 성공 기준을 기록하세요."
              />
            </label>
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="min-w-0 space-y-1 text-xs font-medium text-of-muted">
                시작일
                <Input
                  type="date"
                  aria-label="이니셔티브 시작일"
                  className="h-8 min-w-0 bg-of-surface text-xs"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </label>
              <label className="min-w-0 space-y-1 text-xs font-medium text-of-muted">
                목표일
                <Input
                  type="date"
                  aria-label="이니셔티브 목표일"
                  className="h-8 min-w-0 bg-of-surface text-xs"
                  value={targetDate}
                  onChange={(event) => setTargetDate(event.target.value)}
                />
              </label>
            </div>
            {invalidDateRange ? (
              <p role="alert" className="text-xs text-of-danger">
                목표일은 시작일보다 빠를 수 없습니다.
              </p>
            ) : null}
            {update.isError ? (
              <p role="alert" className="text-xs text-of-danger">
                {update.error instanceof Error
                  ? update.error.message
                  : '기본 정보를 저장하지 못했습니다.'}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={update.isPending}
                onClick={() => {
                  resetDetails()
                  setEditingDetails(false)
                }}
              >
                취소
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!name.trim() || invalidDateRange || update.isPending}
              >
                {update.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                저장
              </Button>
            </div>
          </form>
        ) : null}
        {subscription.isError ? (
          <p role="alert" className="mt-2 text-xs text-of-danger">
            구독 상태를 저장하지 못했습니다. 다시 시도해 주세요.
          </p>
        ) : null}
        <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-of border border-of-border-subtle bg-of-border-subtle sm:grid-cols-3">
          <div className="bg-of-surface px-3 py-2">
            <dt className="text-[10px] text-of-muted">소유자</dt>
            <dd className="mt-0.5 truncate text-xs font-medium">
              {initiative.owner_name ?? '소유자 없음'}
            </dd>
          </div>
          <div className="bg-of-surface px-3 py-2">
            <dt className="text-[10px] text-of-muted">연결 프로젝트</dt>
            <dd className="mt-0.5 text-xs font-medium tabular-nums">
              {initiative.connected_project_count}개
            </dd>
          </div>
          <div className="bg-of-surface px-3 py-2">
            <dt className="text-[10px] text-of-muted">시작일</dt>
            <dd className="mt-0.5 text-xs font-medium tabular-nums">
              {initiative.start_date ?? '미정'}
            </dd>
          </div>
          <div className="bg-of-surface px-3 py-2">
            <dt className="text-[10px] text-of-muted">목표일</dt>
            <dd className="mt-0.5 text-xs font-medium tabular-nums">
              {initiative.target_date ?? '미정'}
            </dd>
          </div>
          <div className="bg-of-surface px-3 py-2">
            <dt className="text-[10px] text-of-muted">전략 범위 작업</dt>
            <dd className="mt-0.5 text-xs font-medium tabular-nums">
              {scope.data?.connected_work_item_count ?? initiative.connected_work_item_count}개
            </dd>
          </div>
          <div className="bg-of-surface px-3 py-2">
            <dt className="text-[10px] text-of-muted">팔로워</dt>
            <dd className="mt-0.5 text-xs font-medium tabular-nums">
              {initiative.follower_count}명
            </dd>
          </div>
        </dl>
      </header>

      <InitiativeLifecyclePanel initiative={initiative} />

      <InitiativeOrganizationPanel
        initiative={initiative}
        availableLabels={availableLabels}
        onDeleted={onClose}
      />

      <section className="pt-4" aria-labelledby="initiative-scope-heading">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 id="initiative-scope-heading" className="text-sm font-semibold">
              연결된 작업
            </h3>
            <p className="mt-0.5 text-[11px] text-of-muted">
              멤버 권한이 있는 프로젝트의 작업만 표시됩니다.
            </p>
          </div>
          {initiative.is_mine ? (
            <Button
              size="sm"
              variant={pickerOpen ? 'secondary' : 'outline'}
              aria-expanded={pickerOpen}
              onClick={() => {
                setPickerOpen((open) => !open)
                connect.reset()
              }}
            >
              <Plus /> 작업 연결
            </Button>
          ) : null}
        </div>

        {pickerOpen && initiative.is_mine ? (
          <div className="mt-3 border-y border-of-border-subtle bg-of-surface-2 px-3 py-3">
            <form
              className="flex min-w-0 gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                setQuery(draftQuery.trim())
              }}
            >
              <Input
                value={draftQuery}
                maxLength={255}
                className="h-8 min-w-0 flex-1 text-xs"
                aria-label="연결할 작업 검색"
                placeholder="연결된 프로젝트의 작업 검색"
                onChange={(event) => setDraftQuery(event.target.value)}
              />
              <Button size="sm" variant="outline" type="submit">
                <Search /> 검색
              </Button>
            </form>
            {candidates.isPending ? (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-of-muted" role="status">
                <Loader2 className="animate-spin" /> 연결 가능한 작업 확인 중
              </p>
            ) : candidates.isError ? (
              <div className="mt-3 flex flex-wrap items-center gap-2" role="alert">
                <span className="text-xs text-of-danger">작업 후보를 불러오지 못했습니다.</span>
                <Button size="sm" variant="outline" onClick={() => void candidates.refetch()}>
                  <RefreshCw /> 재시도
                </Button>
              </div>
            ) : candidates.data.items.length === 0 ? (
              <p className="mt-3 text-xs text-of-muted">
                {query ? '검색 조건에 맞는 연결 가능한 작업이 없습니다.' : '연결 가능한 작업이 없습니다.'}
              </p>
            ) : (
              <>
                <ul className="mt-2 max-h-64 overflow-y-auto">
                  {candidates.data.items.map((item) => (
                    <CandidateRow
                      key={item.id}
                      item={item}
                      busy={connect.isPending && connect.variables === item.id}
                      onConnect={() => connect.mutate(item.id)}
                    />
                  ))}
                </ul>
                {candidates.data.total > candidates.data.items.length ? (
                  <p className="mt-2 text-[11px] text-of-muted">
                    {candidates.data.total}건 중 {candidates.data.items.length}건 표시. 검색어로 범위를 좁혀주세요.
                  </p>
                ) : null}
              </>
            )}
            {connect.isError ? (
              <p className="mt-2 text-xs text-of-danger" role="alert">
                {connect.error instanceof Error ? connect.error.message : '작업을 연결하지 못했습니다.'}
              </p>
            ) : null}
          </div>
        ) : null}

        {scope.isPending ? (
          <div className="mt-3">
            <ListSkeleton rows={4} />
          </div>
        ) : scope.isError ? (
          <div className="mt-3">
            <ErrorState error={scope.error} onRetry={() => scope.refetch()} />
          </div>
        ) : scope.data.items.length === 0 ? (
          <div className="mt-3 border border-dashed border-of-border px-4 py-7 text-center">
            <Link2 className="mx-auto text-of-muted" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium">연결된 작업이 없습니다</p>
            <p className="mt-1 text-xs text-of-muted">
              {initiative.is_mine
                ? '연결된 프로젝트에서 이 전략에 포함할 작업을 선택하세요.'
                : '이니셔티브 소유자가 전략 범위 작업을 연결할 수 있습니다.'}
            </p>
          </div>
        ) : (
          <ul className="mt-3">
            {scope.data.items.map((item) => (
              <ScopeRow
                key={item.id}
                item={item}
                canEdit={initiative.is_mine}
                busy={disconnect.isPending && disconnect.variables === item.id}
                onOpen={() => openWorkItem(item)}
                onDisconnect={() => {
                  disconnect.reset()
                  if (window.confirm(`'${item.subject}' 작업의 이니셔티브 연결을 해제할까요?`)) {
                    disconnect.mutate(item.id)
                  }
                }}
              />
            ))}
          </ul>
        )}
        {visibleOverflow > 0 ? (
          <p className="mt-2 text-[11px] text-of-muted">가시 작업 {visibleOverflow}개가 더 있습니다.</p>
        ) : null}
        {hiddenCount > 0 ? (
          <p className="mt-2 text-[11px] text-of-muted">
            권한이 없는 프로젝트의 연결 작업 {hiddenCount}개는 세부 정보를 숨겼습니다.
          </p>
        ) : null}
        {disconnect.isError ? (
          <p className="mt-2 text-xs text-of-danger" role="alert">
            {disconnect.error instanceof Error
              ? disconnect.error.message
              : '작업 연결을 해제하지 못했습니다.'}
          </p>
        ) : null}
      </section>

      <InitiativeActivityPanel initiativeId={initiative.id} />
    </SheetContent>
  )
}
