import {
  ArrowUpRight,
  Copy,
  KeyRound,
  Pencil,
  Play,
  RefreshCw,
  RefreshCcw,
  RotateCw,
  Trash2,
  Webhook,
  X,
} from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { FrameContextActions } from '@/components/shell/FrameContextActions'
import { EmptyState, ErrorState } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api'
import { formatDateTime } from '@/lib/datetime'
import { useUnsavedLocationPrompt } from '@/lib/guards'

import {
  WEBHOOK_EVENTS,
  type WebhookDelivery,
  type WebhookDeliveryList,
  type WebhookEndpoint,
  type WebhookEndpointCreated,
  type WebhookEndpointList,
  type WebhookEvent,
  useCreateWebhook,
  useDeleteWebhook,
  useRetryWebhookDelivery,
  useRotateWebhookSecret,
  useTestWebhook,
  useUpdateWebhook,
  useWebhookDeliveries,
  useWebhooks,
} from './webhooksApi'

const EVENT_LABELS: Record<WebhookEvent, string> = {
  'work_package.created': '작업 생성',
  'work_package.updated': '작업 변경',
}

const DELIVERY_LABELS: Record<WebhookDelivery['status'], string> = {
  pending: '대기',
  sending: '전송 중',
  retrying: '재시도 예정',
  succeeded: '성공',
  failed: '실패',
  dead_letter: '처리 필요',
  skipped: '건너뜀',
}

const frameLinkClass =
  'of-touch-target inline-flex h-7 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-of border border-of-border bg-of-surface px-2 text-xs font-medium text-of-text transition-colors hover:border-of-border-strong hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus'

function deliveryLabel(status: string) {
  return DELIVERY_LABELS[status as WebhookDelivery['status']] ?? '알 수 없는 상태'
}

function EventSelector({ value, onChange }: { value: WebhookEvent[]; onChange: (next: WebhookEvent[]) => void }) {
  return (
    <fieldset className="flex min-w-0 flex-wrap gap-2">
      <legend className="mb-1 text-xs font-medium text-of-muted">이벤트</legend>
      {WEBHOOK_EVENTS.map((event) => (
        <label
          key={event}
          className="flex min-h-8 items-center gap-1.5 rounded-of border border-of-border bg-of-surface px-2 text-xs"
        >
          <input
            type="checkbox"
            checked={value.includes(event)}
            onChange={(change) =>
              onChange(change.target.checked ? [...value, event] : value.filter((item) => item !== event))
            }
            className="h-3 w-3 accent-of-accent"
          />
          {EVENT_LABELS[event]}
        </label>
      ))}
    </fieldset>
  )
}

function SecretNotice({ created, onDismiss }: { created: WebhookEndpointCreated; onDismiss: () => void }) {
  return (
    <div role="status" className="space-y-2 rounded-of border border-of-accent/30 bg-of-accent-soft p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-of-accent">서명 secret은 지금만 확인할 수 있습니다.</span>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => void navigator.clipboard?.writeText(created.secret)}>
            <Copy size={13} aria-hidden="true" /> 복사
          </Button>
          <Button size="sm" variant="ghost" onClick={onDismiss}>확인</Button>
        </div>
      </div>
      <code aria-label="새 webhook secret" className="block break-all rounded-of bg-of-surface px-2 py-1 font-mono text-[11px]">
        {created.secret}
      </code>
    </div>
  )
}

function EndpointRow({
  endpoint,
  onSecret,
  enabled,
  availableKeyIds,
  testResult,
  onTestStart,
  onTestResult,
  onDirtyChange,
}: {
  endpoint: WebhookEndpoint
  onSecret: (result: WebhookEndpointCreated) => void
  enabled: boolean
  availableKeyIds: string[]
  testResult?: WebhookDelivery
  onTestStart: () => void
  onTestResult: (result: WebhookDelivery) => void
  onDirtyChange: (id: string, dirty: boolean) => void
}) {
  const update = useUpdateWebhook()
  const remove = useDeleteWebhook()
  const rotate = useRotateWebhookSecret()
  const test = useTestWebhook()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(endpoint.name)
  const [url, setUrl] = useState(endpoint.url)
  const [events, setEvents] = useState<WebhookEvent[]>(endpoint.event_types)
  const [rotating, setRotating] = useState(false)
  const [targetKeyId, setTargetKeyId] = useState(endpoint.signing_key_id)
  const [reason, setReason] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const keyAvailable = availableKeyIds.includes(endpoint.signing_key_id)
  const defaultTargetKeyId = keyAvailable ? endpoint.signing_key_id : availableKeyIds[0] ?? ''
  const rotateConflict = rotate.error instanceof ApiError && rotate.error.status === 409
  const editDirty =
    editing &&
    (name !== endpoint.name || url !== endpoint.url || events.join('|') !== endpoint.event_types.join('|'))
  const rotationDirty =
    rotating &&
    (targetKeyId !== defaultTargetKeyId || reason.trim().length > 0)

  useEffect(() => {
    onDirtyChange(endpoint.id, editDirty || rotationDirty)
    return () => onDirtyChange(endpoint.id, false)
  }, [editDirty, endpoint.id, onDirtyChange, rotationDirty])

  useEffect(() => {
    if (editing) return
    setName(endpoint.name)
    setUrl(endpoint.url)
    setEvents(endpoint.event_types)
  }, [editing, endpoint.event_types, endpoint.name, endpoint.url])

  const cancelEdit = () => {
    setName(endpoint.name)
    setUrl(endpoint.url)
    setEvents(endpoint.event_types)
    setEditing(false)
  }

  const cancelRotation = () => {
    setTargetKeyId(defaultTargetKeyId)
    setReason('')
    setRotating(false)
  }

  if (editing) {
    return (
      <li className="grid min-w-0 gap-3 rounded-of border border-of-border bg-of-surface-2 p-3">
        <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(10rem,0.5fr)_minmax(16rem,1fr)]">
          <Input aria-label={`${endpoint.name} webhook 이름 편집`} value={name} onChange={(e) => setName(e.target.value)} />
          <Input aria-label={`${endpoint.name} webhook URL 편집`} value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <EventSelector value={events} onChange={setEvents} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={cancelEdit}>취소</Button>
          <Button
            size="sm"
            disabled={!name.trim() || !url.trim() || events.length === 0 || update.isPending}
            onClick={() =>
              update.mutate(
                { id: endpoint.id, name: name.trim(), url: url.trim(), event_types: events },
                { onSuccess: () => setEditing(false) },
              )
            }
          >저장</Button>
        </div>
      </li>
    )
  }

  return (
    <li className="grid min-w-0 gap-3 rounded-of border border-of-border bg-of-surface-2 p-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{endpoint.name}</span>
          <Badge variant={endpoint.is_active ? 'accent' : 'outline'}>{endpoint.is_active ? '활성' : '중지'}</Badge>
          <Badge variant="outline">secret v{endpoint.secret_version}</Badge>
          <Badge variant="outline">key {endpoint.signing_key_id}</Badge>
          {!keyAvailable ? <Badge variant="outline">configured key 없음</Badge> : null}
        </div>
        <p className="mt-1 truncate font-mono text-[11px] text-of-muted">{endpoint.url}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {endpoint.event_types.map((event) => <Badge key={event} variant="neutral">{EVENT_LABELS[event]}</Badge>)}
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        {enabled ? <>
          <Button size="icon" variant="ghost" title="편집" aria-label={`${endpoint.name} webhook 편집`} onClick={() => setEditing(true)}><Pencil size={14} /></Button>
          <Button size="icon" variant="ghost" title={endpoint.is_active ? '중지' : '활성화'} aria-label={`${endpoint.name} webhook ${endpoint.is_active ? '중지' : '활성화'}`} disabled={update.isPending} onClick={() => update.mutate({ id: endpoint.id, is_active: !endpoint.is_active })}><RefreshCcw size={14} /></Button>
          <Button size="icon" variant="ghost" title="secret 회전" aria-label={`${endpoint.name} secret 회전`} disabled={availableKeyIds.length === 0 || rotate.isPending} onClick={() => { setTargetKeyId(defaultTargetKeyId); setRotating(true) }}><RotateCw size={14} /></Button>
          <Button size="icon" variant="ghost" title="테스트 전송" aria-label={`${endpoint.name} 테스트 전송`} disabled={!endpoint.is_active || test.isPending} onClick={() => { onTestStart(); test.mutate(endpoint.id, { onSuccess: onTestResult }) }}><Play size={14} /></Button>
        </> : null}
        <Button size="icon" variant="ghost" title="삭제" aria-label={`${endpoint.name} webhook 삭제`} disabled={remove.isPending} onClick={() => setConfirmingDelete(true)}><Trash2 size={14} /></Button>
      </div>
      {testResult ? <p role="status" className="text-xs text-of-muted lg:col-span-2">테스트 전송: {testResult.status === 'succeeded' ? '성공' : `실패 ${testResult.error ?? ''}`}</p> : null}
      {rotating ? <div className="grid gap-2 rounded-of border border-of-border p-2 text-xs lg:col-span-2">
        <label className="grid gap-1">Signing key
          <select aria-label={`${endpoint.name} signing key`} value={targetKeyId} onChange={(event) => setTargetKeyId(event.target.value)} className="h-8 rounded-of border border-of-border bg-of-surface px-2">
            {availableKeyIds.map((keyId) => <option key={keyId} value={keyId}>{keyId}</option>)}
          </select>
        </label>
        <Input aria-label={`${endpoint.name} secret rotation reason`} value={reason} maxLength={240} placeholder="회전 사유" onChange={(event) => setReason(event.target.value)} />
        <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={cancelRotation}>취소</Button><Button size="sm" disabled={!targetKeyId || !reason.trim() || rotate.isPending} onClick={() => rotate.mutate({ id: endpoint.id, target_signing_key_id: targetKeyId, expected_secret_version: endpoint.secret_version, reason: reason.trim() }, { onSuccess: (result) => { cancelRotation(); onSecret(result) } })}>확인 및 새 secret 발급</Button></div>
      </div> : null}
      {update.isError || rotate.isError || test.isError || remove.isError ? <p role="alert" className="text-xs text-of-danger lg:col-span-2">{rotateConflict ? '다른 관리자가 먼저 secret을 변경했습니다. 최신 상태를 확인해 다시 시도해 주세요.' : '요청을 완료하지 못했습니다.'}</p> : null}
      <Dialog.Root
        open={confirmingDelete}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setConfirmingDelete(false)
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-80 bg-black/35 backdrop-blur-[1px] data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:fade-in motion-reduce:animate-none" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-81 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-of border border-of-border bg-of-surface p-5 shadow-xl data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 motion-reduce:animate-none">
            <Dialog.Title className="text-base font-semibold">Webhook endpoint 삭제</Dialog.Title>
            <Dialog.Description className="mt-1 text-xs leading-5 text-of-muted">
              <strong className="font-medium text-of-text">{endpoint.name}</strong> endpoint를 삭제합니다. 기존 전송 감사 기록은 운영 이력으로 유지됩니다.
            </Dialog.Description>
            {remove.isError ? (
              <p role="alert" className="mt-3 text-xs text-of-danger">
                endpoint를 삭제하지 못했습니다. 같은 작업을 다시 시도할 수 있습니다.
              </p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="outline" disabled={remove.isPending}>취소</Button>
              </Dialog.Close>
              <Button
                type="button"
                variant="danger"
                disabled={remove.isPending}
                aria-busy={remove.isPending}
                onClick={() => remove.mutate(endpoint.id, { onSuccess: () => setConfirmingDelete(false) })}
              >
                <Trash2 size={14} aria-hidden="true" />
                {remove.isPending ? '삭제 중' : 'endpoint 삭제'}
              </Button>
            </div>
            <button
              type="button"
              className="absolute right-3 top-3 grid size-8 place-items-center rounded-of text-of-muted transition-colors hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
              aria-label="Webhook 삭제 확인 닫기"
              disabled={remove.isPending}
              onClick={() => setConfirmingDelete(false)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </li>
  )
}

export function WebhooksPage() {
  const webhooks = useWebhooks()
  const deliveries = useWebhookDeliveries()
  const create = useCreateWebhook()
  const retry = useRetryWebhookDelivery()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<WebhookEvent[]>(['work_package.created'])
  const [secret, setSecret] = useState<WebhookEndpointCreated | null>(null)
  const [testResults, setTestResults] = useState<Record<string, WebhookDelivery>>({})
  const [retryError, setRetryError] = useState(false)
  const [dirtyEndpoints, setDirtyEndpoints] = useState<Set<string>>(() => new Set())
  const [failedRefreshes, setFailedRefreshes] = useState<string[]>([])
  const [endpointSnapshot, setEndpointSnapshot] = useState<WebhookEndpointList | null>(null)
  const [deliverySnapshot, setDeliverySnapshot] = useState<WebhookDeliveryList | null>(null)
  useEffect(() => setRetryError(false), [deliveries.dataUpdatedAt])
  useEffect(() => {
    if (webhooks.data) setEndpointSnapshot(webhooks.data)
  }, [webhooks.data])
  useEffect(() => {
    if (deliveries.data) setDeliverySnapshot(deliveries.data)
  }, [deliveries.data])
  const endpointData = webhooks.data ?? endpointSnapshot
  const deliveryData = deliveries.data ?? deliverySnapshot
  const endpointsById = useMemo(
    () => new Map((endpointData?.items ?? []).map((endpoint) => [endpoint.id, endpoint])),
    [endpointData?.items],
  )
  const endpointItems = endpointData?.items ?? []
  const deliveryItems = deliveryData?.items ?? []
  const activeEndpointCount = endpointItems.filter((endpoint) => endpoint.is_active).length
  const failedDeliveryCount = deliveryItems.filter(
    (delivery) => delivery.status === 'failed' || delivery.status === 'dead_letter',
  ).length
  const refreshing = webhooks.isFetching || deliveries.isFetching
  const createDirty =
    name.length > 0 ||
    url.length > 0 ||
    events.length !== 1 ||
    events[0] !== 'work_package.created'
  useUnsavedLocationPrompt(
    createDirty || dirtyEndpoints.size > 0,
    '저장하지 않은 Webhook 변경을 버리고 이동할까요?',
  )

  const setEndpointDirty = useCallback((id: string, dirty: boolean) => {
    setDirtyEndpoints((current) => {
      const hasId = current.has(id)
      if (hasId === dirty) return current
      const next = new Set(current)
      if (dirty) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const refreshAll = async () => {
    setRetryError(false)
    const results = await Promise.all([webhooks.refetch(), deliveries.refetch()])
    const labels = ['Endpoint', 'Delivery audit']
    setFailedRefreshes(results.flatMap((result, index) => result.isError ? [labels[index]] : []))
  }

  const retryOne = async (label: string, refetch: () => Promise<{ isError: boolean }>) => {
    const result = await refetch()
    setFailedRefreshes((current) => result.isError
      ? current.includes(label) ? current : [...current, label]
      : current.filter((item) => item !== label))
  }

  const refreshActionLabel = failedRefreshes.length > 0 ? '모두 새로고침 다시 시도' : '모두 새로고침'
  const endpointStale = Boolean(endpointData && webhooks.isError)
  const deliveryStale = Boolean(deliveryData && deliveries.isError)

  if (!endpointData && webhooks.isError) {
    if (webhooks.error instanceof ApiError && webhooks.error.status === 403) {
      return <EmptyState title="접근 권한이 없습니다" hint="워크스페이스 webhook은 관리자만 관리할 수 있습니다." />
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-col bg-of-surface">
      <FrameContextActions>
        <Link to="/admin/integrations" className={frameLinkClass} aria-label="통합 허브" title="통합 허브">
          <span className="hidden min-[360px]:inline">통합 허브</span>
          <ArrowUpRight size={13} aria-hidden="true" />
        </Link>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={refreshing}
          onClick={() => void refreshAll()}
          aria-label={refreshActionLabel}
          title={refreshActionLabel}
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : undefined} aria-hidden="true" />
          <span className="hidden min-[360px]:inline">{refreshActionLabel}</span>
        </Button>
      </FrameContextActions>

      <div
        data-testid="webhook-operations-scroll"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        aria-busy={refreshing}
      >
        <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-6">
          <header className="grid gap-4 border-b border-of-border pb-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase text-of-muted">Workspace administration</p>
              <h1 className="mt-1 text-xl font-semibold">Webhooks</h1>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">
                OneFlow 작업 이벤트를 허용된 HTTPS endpoint로 서명해 전달하고, 실패한 전송을 운영 이력에서 복구합니다.
              </p>
            </div>
            <dl
              aria-label="Webhook 운영 요약"
              className="grid grid-cols-4 divide-x divide-of-border-subtle border-y border-of-border-subtle sm:min-w-80"
            >
              <div className="px-2 py-2 sm:px-3">
                <dt className="text-[11px] text-of-muted">Endpoint</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums">{endpointData?.total ?? '—'}</dd>
              </div>
              <div className="px-2 py-2 sm:px-3">
                <dt className="text-[11px] text-of-muted">활성</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums">{endpointData ? activeEndpointCount : '—'}</dd>
              </div>
              <div className="px-2 py-2 sm:px-3">
                <dt className="text-[11px] text-of-muted">주의</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums">{deliveryData ? failedDeliveryCount : '—'}</dd>
              </div>
              <div className="px-2 py-2 sm:px-3">
                <dt className="text-[11px] text-of-muted">전송</dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums">{deliveryData?.total ?? '—'}</dd>
              </div>
            </dl>
          </header>

          {failedRefreshes.length > 0 ? (
            <div role="alert" className="mt-4 border-l-2 border-of-warning bg-of-warning-soft/30 px-3 py-2 text-xs leading-5 text-of-text">
              {failedRefreshes.join(', ')} 상태를 새로고침하지 못했습니다. 마지막 성공 결과를 유지했으며 상단에서 같은 전체 요청을 다시 시도할 수 있습니다.
            </div>
          ) : null}

          {!endpointData && webhooks.isPending ? (
            <section aria-label="Webhook endpoint 확인 중" className="grid gap-3 border-b border-of-border py-6">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-20 w-full" />
            </section>
          ) : !endpointData && webhooks.isError ? (
            <section aria-labelledby="webhook-endpoints-title" className="border-b border-of-border py-6">
              <h2 id="webhook-endpoints-title" className="text-sm font-semibold">Endpoint 운영</h2>
              <div className="mt-3">
                <ErrorState error={webhooks.error} onRetry={() => void retryOne('Endpoint', webhooks.refetch)} />
              </div>
            </section>
          ) : endpointData ? (
            <>
              {endpointStale ? (
                <div role="alert" className="mt-4 flex min-w-0 flex-wrap items-center gap-2 border-l-2 border-of-warning bg-of-warning-soft/30 px-3 py-2 text-xs leading-5 text-of-text">
                  <p className="min-w-0 flex-1">Endpoint 최신 상태를 확인하지 못해 마지막 성공 결과를 유지했습니다.</p>
                  <Button size="sm" variant="ghost" onClick={() => void retryOne('Endpoint', webhooks.refetch)} aria-label="Endpoint 다시 시도">
                    <RefreshCw size={13} aria-hidden="true" /> 다시 시도
                  </Button>
                </div>
              ) : null}
              {!endpointData.enabled ? (
                <section aria-labelledby="webhook-disabled-title" className="border-b border-of-border py-5">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-of border border-of-border-subtle bg-of-surface-2 text-of-muted">
                      <KeyRound size={15} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h2 id="webhook-disabled-title" className="text-sm font-semibold">Webhook 전달이 꺼져 있습니다</h2>
                      <p className="mt-1 text-xs leading-5 text-of-muted">
                        운영자가 signing key와 outbound host allowlist를 설정해야 새 endpoint와 외부 전송을 사용할 수 있습니다. 기존 endpoint 삭제는 계속 가능합니다.
                      </p>
                    </div>
                  </div>
                </section>
              ) : (
                <section aria-labelledby="webhook-create-title" className="border-b border-of-border py-6">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 id="webhook-create-title" className="text-sm font-semibold">새 endpoint</h2>
                      <p className="mt-1 text-xs leading-5 text-of-muted">운영 allowlist에 포함된 HTTPS URL과 받을 작업 이벤트를 선택합니다.</p>
                    </div>
                    <KeyRound size={15} className="mt-0.5 shrink-0 text-of-muted" aria-hidden="true" />
                  </div>
                  <form
                    className="mt-4 grid min-w-0 gap-3"
                    onSubmit={(event) => {
                      event.preventDefault()
                      create.mutate(
                        { name: name.trim(), url: url.trim(), event_types: events },
                        {
                          onSuccess: (result) => {
                            setSecret(result)
                            setName('')
                            setUrl('')
                            setEvents(['work_package.created'])
                          },
                        },
                      )
                    }}
                  >
                    <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(10rem,0.5fr)_minmax(16rem,1fr)_auto]">
                      <Input aria-label="Webhook 이름" placeholder="배포 자동화" value={name} onChange={(event) => setName(event.target.value)} />
                      <Input aria-label="Webhook URL" placeholder="https://hooks.example.com/oneflow" value={url} onChange={(event) => setUrl(event.target.value)} />
                      <Button type="submit" disabled={!name.trim() || !url.trim() || events.length === 0 || create.isPending}>
                        <Webhook size={14} aria-hidden="true" /> 추가
                      </Button>
                    </div>
                    <EventSelector value={events} onChange={setEvents} />
                    {create.isError ? (
                      <div className="flex min-w-0 flex-wrap items-center gap-2" role="alert">
                        <p className="text-xs text-of-danger">endpoint를 만들지 못했습니다. URL allowlist와 입력값을 확인해 주세요.</p>
                        <Button type="submit" size="sm" variant="ghost" disabled={create.isPending}>같은 입력 재시도</Button>
                      </div>
                    ) : null}
                  </form>
                </section>
              )}

              <section aria-labelledby="webhook-endpoints-title" className="border-b border-of-border py-6">
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 id="webhook-endpoints-title" className="text-sm font-semibold">Endpoints</h2>
                    <p className="mt-1 text-xs leading-5 text-of-muted">전달 대상, 이벤트, 활성 상태와 signing secret 버전을 관리합니다.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-of-muted">
                    <Badge variant={endpointData.enabled ? 'accent' : 'outline'}>
                      {endpointData.enabled ? '전달 사용' : '전달 중지'}
                    </Badge>
                    {endpointData.enabled ? (
                      <>
                        <span>기본 key <code>{endpointData.active_signing_key_id}</code></span>
                        <span>사용 가능 {endpointData.available_signing_key_ids.length}개</span>
                      </>
                    ) : null}
                  </div>
                </div>

                {secret ? <div className="mt-4"><SecretNotice created={secret} onDismiss={() => setSecret(null)} /></div> : null}

                {endpointData.items.length === 0 ? (
                  <div className="mt-4">
                    <EmptyState title="등록된 webhook이 없습니다" hint="운영 allowlist에 포함된 HTTPS endpoint를 추가하세요." />
                  </div>
                ) : (
                  <ul className="mt-4 grid gap-2">
                    {endpointData.items.map((endpoint) => (
                      <EndpointRow
                        key={endpoint.id}
                        endpoint={endpoint}
                        onSecret={setSecret}
                        enabled={endpointData.enabled}
                        availableKeyIds={endpointData.available_signing_key_ids}
                        testResult={testResults[endpoint.id]}
                        onTestStart={() => setTestResults((current) => {
                          if (!(endpoint.id in current)) return current
                          const next = { ...current }
                          delete next[endpoint.id]
                          return next
                        })}
                        onTestResult={(result) => setTestResults((current) => ({ ...current, [endpoint.id]: result }))}
                        onDirtyChange={setEndpointDirty}
                      />
                    ))}
                  </ul>
                )}
              </section>

              <section aria-labelledby="webhook-key-audit-title" className="border-b border-of-border py-6">
                <div className="min-w-0">
                  <h2 id="webhook-key-audit-title" className="text-sm font-semibold">Key change audit</h2>
                  <p className="mt-1 text-xs leading-5 text-of-muted">최근 signing key 전환과 secret 재발급 사유를 확인합니다.</p>
                </div>
                {endpointData.rotations.length === 0 ? (
                  <p className="mt-4 text-xs text-of-muted">아직 key 변경 기록이 없습니다.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-of-border-subtle border-y border-of-border-subtle">
                    {endpointData.rotations.map((rotation) => (
                      <li key={rotation.id} className="grid min-w-0 gap-1 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_auto]">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{endpointsById.get(rotation.endpoint_id)?.name ?? '삭제된 endpoint'}</p>
                          <p className="break-words text-of-muted">{rotation.reason}</p>
                        </div>
                        <p className="break-all font-mono text-[11px] text-of-muted sm:text-right">
                          {rotation.previous_signing_key_id} v{rotation.previous_secret_version} → {rotation.signing_key_id} v{rotation.secret_version} · {formatDateTime(rotation.created_at)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : null}

          <section aria-labelledby="webhook-delivery-audit-title" className="py-6">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="webhook-delivery-audit-title" className="text-sm font-semibold">Delivery audit</h2>
                <p className="mt-1 text-xs leading-5 text-of-muted">
                  최근 전송 결과와 실패 원인을 확인하고 실패 건을 다시 보냅니다. 이 화면이 보이는 동안 자동으로 갱신됩니다.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Badge variant="outline">{deliveryData?.total ?? 0}건</Badge>
                <Button
                  size="icon"
                  variant="ghost"
                  title="전송 감사 새로고침"
                  aria-label="전송 감사 새로고침"
                  disabled={deliveries.isFetching}
                  onClick={() => {
                    setRetryError(false)
                    void retryOne('Delivery audit', deliveries.refetch)
                  }}
                >
                  <RefreshCw size={14} className={deliveries.isFetching ? 'animate-spin' : undefined} aria-hidden="true" />
                </Button>
              </div>
            </div>

            {deliveryStale ? (
              <div role="alert" className="mt-4 flex min-w-0 flex-wrap items-center gap-2 border-l-2 border-of-warning bg-of-warning-soft/30 px-3 py-2 text-xs leading-5 text-of-text">
                <p className="min-w-0 flex-1">전송 감사 최신 상태를 확인하지 못해 마지막 성공 결과를 유지했습니다.</p>
                <Button size="sm" variant="ghost" onClick={() => void retryOne('Delivery audit', deliveries.refetch)} aria-label="Delivery audit 다시 시도">
                  <RefreshCw size={13} aria-hidden="true" /> 다시 시도
                </Button>
              </div>
            ) : null}

            {!deliveryData && deliveries.isPending ? (
              <div role="status" aria-label="전송 감사 확인 중" className="mt-4 grid gap-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : !deliveryData && deliveries.isError ? (
              <div className="mt-4"><ErrorState error={deliveries.error} onRetry={() => void retryOne('Delivery audit', deliveries.refetch)} /></div>
            ) : deliveryItems.length === 0 ? (
              <p className="mt-4 text-xs text-of-muted">아직 전송 기록이 없습니다.</p>
            ) : (
              <ul className="mt-3 divide-y divide-of-border-subtle border-y border-of-border-subtle">
                {deliveryItems.map((delivery) => {
                  const endpoint = endpointsById.get(delivery.endpoint_id)
                  return (
                    <li key={delivery.id} className="grid min-w-0 gap-2 py-3 text-xs sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <Badge variant={delivery.status === 'succeeded' ? 'accent' : delivery.status === 'failed' || delivery.status === 'dead_letter' ? 'outline' : 'neutral'}>{deliveryLabel(delivery.status)}</Badge>
                          <span className="truncate font-medium">{endpoint?.name ?? '삭제된 endpoint'}</span>
                          <span className="break-all font-mono text-[11px] text-of-muted">{delivery.event_type} · {delivery.signing_key_id} v{delivery.secret_version}</span>
                          {delivery.signing_snapshot_source === 'migrated_current' ? <Badge variant="outline">migration estimate</Badge> : null}
                        </div>
                        <p className="mt-1 text-[11px] text-of-muted">
                          {formatDateTime(delivery.created_at)} · 시도 {delivery.attempt_count} · {delivery.response_status ? `HTTP ${delivery.response_status}` : delivery.error ?? '대기 중'}{delivery.duration_ms !== null ? ` · ${delivery.duration_ms}ms` : ''}
                        </p>
                        {delivery.status === 'retrying' && delivery.next_attempt_at ? (
                          <p className="mt-1 text-[11px] text-of-muted">다음 시도 {formatDateTime(delivery.next_attempt_at)}</p>
                        ) : null}
                      </div>
                      {(delivery.status === 'failed' || delivery.status === 'dead_letter') && endpoint?.is_active && endpointData?.enabled ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={retry.isPending}
                          aria-label={`${endpoint.name} delivery 재시도`}
                          onClick={() => {
                            setRetryError(false)
                            retry.mutate(delivery.id, {
                              onError: () => setRetryError(true),
                              onSuccess: (result) => setTestResults((current) => {
                                if (!(result.endpoint_id in current)) return current
                                const next = { ...current }
                                delete next[result.endpoint_id]
                                return next
                              }),
                            })
                          }}
                        >
                          <RotateCw size={13} aria-hidden="true" /> 재시도
                        </Button>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
            {retryError ? (
              <p role="alert" className="mt-3 text-xs text-of-danger">
                전송 재시도를 완료하지 못했습니다. 같은 전송에서 다시 시도해 주세요.
              </p>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  )
}
