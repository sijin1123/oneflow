import {
  Copy,
  KeyRound,
  Pencil,
  Play,
  RefreshCw,
  RefreshCcw,
  RotateCw,
  Trash2,
  Webhook,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SettingsFrame, SettingsSection } from '@/features/settings/SettingsShell'
import { ApiError } from '@/lib/api'
import { formatDateTime } from '@/lib/datetime'

import {
  WEBHOOK_EVENTS,
  type WebhookDelivery,
  type WebhookEndpoint,
  type WebhookEndpointCreated,
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
}: {
  endpoint: WebhookEndpoint
  onSecret: (result: WebhookEndpointCreated) => void
  enabled: boolean
  availableKeyIds: string[]
  testResult?: WebhookDelivery
  onTestStart: () => void
  onTestResult: (result: WebhookDelivery) => void
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
  const keyAvailable = availableKeyIds.includes(endpoint.signing_key_id)
  const defaultTargetKeyId = keyAvailable ? endpoint.signing_key_id : availableKeyIds[0] ?? ''
  const rotateConflict = rotate.error instanceof ApiError && rotate.error.status === 409

  if (editing) {
    return (
      <li className="grid min-w-0 gap-3 rounded-of border border-of-border bg-of-surface-2 p-3">
        <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(10rem,0.5fr)_minmax(16rem,1fr)]">
          <Input aria-label={`${endpoint.name} webhook 이름 편집`} value={name} onChange={(e) => setName(e.target.value)} />
          <Input aria-label={`${endpoint.name} webhook URL 편집`} value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <EventSelector value={events} onChange={setEvents} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>취소</Button>
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
        <Button size="icon" variant="ghost" title="삭제" aria-label={`${endpoint.name} webhook 삭제`} disabled={remove.isPending} onClick={() => { if (window.confirm(`${endpoint.name} webhook을 삭제할까요?`)) remove.mutate(endpoint.id) }}><Trash2 size={14} /></Button>
      </div>
      {testResult ? <p role="status" className="text-xs text-of-muted lg:col-span-2">테스트 전송: {testResult.status === 'succeeded' ? '성공' : `실패 ${testResult.error ?? ''}`}</p> : null}
      {rotating ? <div className="grid gap-2 rounded-of border border-of-border p-2 text-xs lg:col-span-2">
        <label className="grid gap-1">Signing key
          <select aria-label={`${endpoint.name} signing key`} value={targetKeyId} onChange={(event) => setTargetKeyId(event.target.value)} className="h-8 rounded-of border border-of-border bg-of-surface px-2">
            {availableKeyIds.map((keyId) => <option key={keyId} value={keyId}>{keyId}</option>)}
          </select>
        </label>
        <Input aria-label={`${endpoint.name} secret rotation reason`} value={reason} maxLength={240} placeholder="회전 사유" onChange={(event) => setReason(event.target.value)} />
        <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setRotating(false)}>취소</Button><Button size="sm" disabled={!targetKeyId || !reason.trim() || rotate.isPending} onClick={() => rotate.mutate({ id: endpoint.id, target_signing_key_id: targetKeyId, expected_secret_version: endpoint.secret_version, reason: reason.trim() }, { onSuccess: (result) => { setRotating(false); setReason(''); onSecret(result) } })}>확인 및 새 secret 발급</Button></div>
      </div> : null}
      {update.isError || rotate.isError || test.isError || remove.isError ? <p role="alert" className="text-xs text-of-danger lg:col-span-2">{rotateConflict ? '다른 관리자가 먼저 secret을 변경했습니다. 최신 상태를 확인해 다시 시도해 주세요.' : '요청을 완료하지 못했습니다.'}</p> : null}
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
  useEffect(() => setRetryError(false), [deliveries.dataUpdatedAt])
  const endpointsById = useMemo(
    () => new Map((webhooks.data?.items ?? []).map((endpoint) => [endpoint.id, endpoint])),
    [webhooks.data?.items],
  )

  if (webhooks.isPending || deliveries.isPending) return <ListSkeleton />
  if (webhooks.isError) {
    if (webhooks.error instanceof ApiError && webhooks.error.status === 403) {
      return <EmptyState title="접근 권한이 없습니다" hint="워크스페이스 webhook은 관리자만 관리할 수 있습니다." />
    }
    return <ErrorState error={webhooks.error} onRetry={() => webhooks.refetch()} />
  }

  return (
    <SettingsFrame
      eyebrow="Workspace administration"
      title="Webhooks"
      description="OneFlow 작업 이벤트를 허용된 외부 endpoint로 서명해 전달하고 결과를 감사합니다."
      meta={`${webhooks.data.total}개 endpoint`}
    >
      {!webhooks.data.enabled ? (
        <SettingsSection title="Webhook 전달이 꺼져 있습니다" description="운영자가 signing key와 outbound host allowlist를 설정해야 합니다.">
          <p className="text-xs text-of-muted">설정 전에는 endpoint 생성과 외부 전송이 노출되지 않습니다.</p>
        </SettingsSection>
      ) : (
        <SettingsSection title="새 endpoint" description="HTTPS URL과 받을 작업 이벤트를 선택합니다." actions={<KeyRound size={15} className="text-of-muted" />}>
          <form
            className="grid min-w-0 gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              create.mutate(
                { name: name.trim(), url: url.trim(), event_types: events },
                { onSuccess: (result) => { setSecret(result); setName(''); setUrl('') } },
              )
            }}
          >
            <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(10rem,0.5fr)_minmax(16rem,1fr)_auto]">
              <Input aria-label="Webhook 이름" placeholder="배포 자동화" value={name} onChange={(e) => setName(e.target.value)} />
              <Input aria-label="Webhook URL" placeholder="https://hooks.example.com/oneflow" value={url} onChange={(e) => setUrl(e.target.value)} />
              <Button type="submit" disabled={!name.trim() || !url.trim() || events.length === 0 || create.isPending}><Webhook size={14} /> 추가</Button>
            </div>
            <EventSelector value={events} onChange={setEvents} />
            {create.isError ? <p role="alert" className="text-xs text-of-danger">endpoint를 만들지 못했습니다. URL allowlist와 입력값을 확인해 주세요.</p> : null}
          </form>
        </SettingsSection>
      )}

      {webhooks.data.enabled ? <p className="text-xs text-of-muted">활성 기본 key: <code>{webhooks.data.active_signing_key_id}</code> · 사용 가능 key: {webhooks.data.available_signing_key_ids.join(', ')}</p> : null}

      {secret ? <SecretNotice created={secret} onDismiss={() => setSecret(null)} /> : null}

      <SettingsSection title="Endpoints" description="전달 대상, 이벤트, 활성 상태와 signing secret 버전을 관리합니다.">
        {webhooks.data.items.length === 0 ? (
          <EmptyState title="등록된 webhook이 없습니다" hint="운영 allowlist에 포함된 HTTPS endpoint를 추가하세요." />
        ) : (
          <ul className="grid gap-2">{webhooks.data.items.map((endpoint) => (
            <EndpointRow
              key={endpoint.id}
              endpoint={endpoint}
              onSecret={setSecret}
              enabled={webhooks.data.enabled}
              availableKeyIds={webhooks.data.available_signing_key_ids}
              testResult={testResults[endpoint.id]}
              onTestStart={() => setTestResults((current) => {
                if (!(endpoint.id in current)) return current
                const next = { ...current }
                delete next[endpoint.id]
                return next
              })}
              onTestResult={(result) => setTestResults((current) => ({ ...current, [endpoint.id]: result }))}
            />
          ))}</ul>
        )}
      </SettingsSection>

      <SettingsSection title="Key change audit" description="최근 signing key 전환과 secret 재발급 사유를 확인합니다.">
        {webhooks.data.rotations.length === 0 ? (
          <p className="text-xs text-of-muted">아직 key 변경 기록이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-of-border border-y border-of-border">
            {webhooks.data.rotations.map((rotation) => (
              <li key={rotation.id} className="grid min-w-0 gap-1 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <p className="truncate font-medium">{endpointsById.get(rotation.endpoint_id)?.name ?? '삭제된 endpoint'}</p>
                  <p className="break-words text-of-muted">{rotation.reason}</p>
                </div>
                <p className="font-mono text-[11px] text-of-muted">{rotation.previous_signing_key_id} v{rotation.previous_secret_version} → {rotation.signing_key_id} v{rotation.secret_version} · {formatDateTime(rotation.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>

      <SettingsSection
        title="Delivery audit"
        description="최근 전송 결과와 실패 원인을 확인하고 실패 건을 다시 보냅니다. 이 탭이 보이는 동안 자동으로 갱신됩니다."
        actions={
          <div className="flex items-center gap-1">
            <Badge variant="outline">{deliveries.data?.total ?? 0}건</Badge>
            <Button
              size="icon"
              variant="ghost"
              title="전송 감사 새로고침"
              aria-label="전송 감사 새로고침"
              disabled={deliveries.isFetching}
              onClick={() => { setRetryError(false); void deliveries.refetch() }}
            >
              <RefreshCw size={14} />
            </Button>
          </div>
        }
      >
        {deliveries.isError ? (
          <ErrorState error={deliveries.error} onRetry={() => deliveries.refetch()} />
        ) : deliveries.data.items.length === 0 ? (
          <p className="text-xs text-of-muted">아직 전송 기록이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-of-border border-y border-of-border">
            {deliveries.data.items.map((delivery) => {
              const endpoint = endpointsById.get(delivery.endpoint_id)
              return (
                <li key={delivery.id} className="grid min-w-0 gap-2 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Badge variant={delivery.status === 'succeeded' ? 'accent' : delivery.status === 'failed' || delivery.status === 'dead_letter' ? 'outline' : 'neutral'}>{deliveryLabel(delivery.status)}</Badge>
                      <span className="truncate font-medium">{endpoint?.name ?? '삭제된 endpoint'}</span>
                      <span className="font-mono text-[11px] text-of-muted">{delivery.event_type} · {delivery.signing_key_id} v{delivery.secret_version}</span>
                      {delivery.signing_snapshot_source === 'migrated_current' ? <Badge variant="outline">migration estimate</Badge> : null}
                    </div>
                    <p className="mt-1 text-[11px] text-of-muted">{formatDateTime(delivery.created_at)} · 시도 {delivery.attempt_count} · {delivery.response_status ? `HTTP ${delivery.response_status}` : delivery.error ?? '대기 중'}{delivery.duration_ms !== null ? ` · ${delivery.duration_ms}ms` : ''}</p>
                    {delivery.status === 'retrying' && delivery.next_attempt_at ? <p className="mt-1 text-[11px] text-of-muted">다음 시도 {formatDateTime(delivery.next_attempt_at)}</p> : null}
                  </div>
                  {(delivery.status === 'failed' || delivery.status === 'dead_letter') && endpoint?.is_active && webhooks.data.enabled ? (
                    <Button size="sm" variant="outline" disabled={retry.isPending} aria-label={`${endpoint.name} delivery 재시도`} onClick={() => {
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
                    }}><RotateCw size={13} /> 재시도</Button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
        {retryError ? <p role="alert" className="mt-2 text-xs text-of-danger">전송 재시도를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.</p> : null}
      </SettingsSection>
    </SettingsFrame>
  )
}
