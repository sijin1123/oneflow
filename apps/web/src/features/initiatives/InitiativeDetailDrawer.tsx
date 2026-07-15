import {
  ArrowUpRight,
  CalendarDays,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Unlink,
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import {
  PRIORITY_LABELS,
  type WpPriority,
} from '@/features/work-packages/types'
import { useStatusLabels } from '@/features/work-packages/useStatusLabels'

import {
  INITIATIVE_STATE_LABELS,
  type Initiative,
  type InitiativeWorkItem,
  useConnectInitiativeWorkItem,
  useDisconnectInitiativeWorkItem,
  useInitiativeWorkItemCandidates,
  useInitiativeWorkItems,
} from './api'

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
  onClose,
}: {
  initiative: Initiative | null
  onClose: () => void
}) {
  return (
    <Sheet open={initiative !== null} onOpenChange={(open) => !open && onClose()}>
      {initiative ? (
        <InitiativeDetailBody key={initiative.id} initiative={initiative} />
      ) : null}
    </Sheet>
  )
}

function InitiativeDetailBody({ initiative }: { initiative: Initiative }) {
  const navigate = useNavigate()
  const scope = useInitiativeWorkItems(initiative.id, true)
  const connect = useConnectInitiativeWorkItem(initiative.id)
  const disconnect = useDisconnectInitiativeWorkItem(initiative.id)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [draftQuery, setDraftQuery] = useState('')
  const [query, setQuery] = useState('')
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

  return (
    <SheetContent title="이니셔티브 상세" className="max-w-2xl">
      <header className="border-b border-of-border-subtle pb-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{initiative.name}</h2>
          <Badge variant="accent">{INITIATIVE_STATE_LABELS[initiative.state]}</Badge>
        </div>
        <p className="mt-1 text-xs text-of-muted">
          {initiative.description ?? '연결된 작업으로 이니셔티브의 실제 전략 범위를 구성합니다.'}
        </p>
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
          <div className="col-span-2 bg-of-surface px-3 py-2 sm:col-span-1">
            <dt className="text-[10px] text-of-muted">전략 범위 작업</dt>
            <dd className="mt-0.5 text-xs font-medium tabular-nums">
              {scope.data?.connected_work_item_count ?? initiative.connected_work_item_count}개
            </dd>
          </div>
        </dl>
      </header>

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
    </SheetContent>
  )
}
