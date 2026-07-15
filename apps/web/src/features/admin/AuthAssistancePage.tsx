import * as Dialog from '@radix-ui/react-dialog'
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { SettingsFrame, SettingsSection } from '@/features/settings/SettingsShell'
import { ApiError } from '@/lib/api'

import {
  type AuthAssistanceFilters,
  type AuthAssistanceKind,
  type AuthAssistanceRequest,
  type AuthAssistanceStatus,
  useAdminAuthAssistance,
  useRedactAuthAssistance,
  useTriageAuthAssistance,
} from './authAssistanceApi'

const STATUSES: AuthAssistanceStatus[] = ['pending', 'in_review', 'resolved', 'rejected']
const KINDS: AuthAssistanceKind[] = ['sign_in_help', 'workspace_access']

const statusCopy: Record<AuthAssistanceStatus, { label: string; variant: 'warning' | 'info' | 'success' | 'danger' }> = {
  pending: { label: '대기', variant: 'warning' },
  in_review: { label: '검토 중', variant: 'info' },
  resolved: { label: '해결', variant: 'success' },
  rejected: { label: '거절', variant: 'danger' },
}

const kindCopy: Record<AuthAssistanceKind, string> = {
  sign_in_help: '로그인 도움',
  workspace_access: '워크스페이스 접근',
}

type Decision = {
  item: AuthAssistanceRequest
  status: 'resolved' | 'rejected'
  trigger: HTMLButtonElement
}

type Redaction = { item: AuthAssistanceRequest; trigger: HTMLButtonElement }

function isOpen(item: AuthAssistanceRequest) {
  return item.status === 'pending' || item.status === 'in_review'
}

function formatDateTime(value: string | null) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed)
}

function canonicalOffset(value: string | null) {
  const parsed = Number(value ?? 0)
  if (!Number.isInteger(parsed) || parsed < 0) return 0
  return Math.floor(parsed / 50) * 50
}

export function AuthAssistancePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawStatus = searchParams.get('status') ?? ''
  const rawKind = searchParams.get('kind') ?? ''
  const rawOffset = searchParams.get('offset')
  const status = STATUSES.includes(rawStatus as AuthAssistanceStatus)
    ? rawStatus as AuthAssistanceStatus
    : ''
  const kind = KINDS.includes(rawKind as AuthAssistanceKind)
    ? rawKind as AuthAssistanceKind
    : ''
  const offset = canonicalOffset(rawOffset)
  const expectedOffset = offset === 0 ? null : String(offset)
  const needsCanonical =
    rawStatus !== status ||
    rawKind !== kind ||
    rawOffset !== expectedOffset
  const filters: AuthAssistanceFilters = { status, kind, offset }
  const requests = useAdminAuthAssistance(filters, !needsCanonical)
  const triage = useTriageAuthAssistance()
  const redact = useRedactAuthAssistance()
  const paramsRef = useRef(new URLSearchParams(searchParams))
  paramsRef.current = new URLSearchParams(searchParams)
  const [decision, setDecision] = useState<Decision | null>(null)
  const [redaction, setRedaction] = useState<Redaction | null>(null)
  const [note, setNote] = useState('')

  const setParams = useCallback((updates: Record<string, string | null>) => {
    const next = new URLSearchParams(paramsRef.current)
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    paramsRef.current = next
    setSearchParams(next, { replace: true })
  }, [setSearchParams])

  useEffect(() => {
    if (!needsCanonical) return
    const next = new URLSearchParams(searchParams)
    if (status) next.set('status', status)
    else next.delete('status')
    if (kind) next.set('kind', kind)
    else next.delete('kind')
    if (expectedOffset) next.set('offset', expectedOffset)
    else next.delete('offset')
    paramsRef.current = next
    setSearchParams(next, { replace: true })
  }, [expectedOffset, kind, needsCanonical, searchParams, setSearchParams, status])

  useEffect(() => {
    if (!requests.data) return
    const nextOffset = requests.data.total === 0
      ? 0
      : Math.floor((requests.data.total - 1) / 50) * 50
    if (offset <= nextOffset) return
    setParams({ offset: nextOffset === 0 ? null : String(nextOffset) })
  }, [offset, requests.data, setParams])

  const closeDecision = () => {
    const trigger = decision?.trigger
    setDecision(null)
    setNote('')
    window.requestAnimationFrame(() => trigger?.focus({ preventScroll: true }))
  }

  const closeRedaction = () => {
    const trigger = redaction?.trigger
    setRedaction(null)
    window.requestAnimationFrame(() => trigger?.focus({ preventScroll: true }))
  }

  const refresh = () => {
    triage.reset()
    redact.reset()
    void requests.refetch()
  }

  const resetMutations = () => {
    triage.reset()
    redact.reset()
  }

  if (needsCanonical || requests.isPending) return <ListSkeleton />
  if (requests.isError) {
    if (requests.error instanceof ApiError && requests.error.status === 403) {
      return <EmptyState title="접근 권한이 없습니다" hint="로그인 지원 요청은 워크스페이스 관리자만 볼 수 있습니다." />
    }
    return <ErrorState error={requests.error} onRetry={() => requests.refetch()} />
  }

  const data = requests.data
  const lastOffset = data.total === 0 ? 0 : Math.floor((data.total - 1) / 50) * 50
  if (offset > lastOffset) return <ListSkeleton />
  const mutationError = triage.error ?? redact.error
  const busy = triage.isPending || redact.isPending

  return (
    <SettingsFrame
      eyebrow="Workspace administration"
      title="로그인 지원"
      description="로그인 도움과 워크스페이스 접근 요청을 검토하고 최소한의 연락 정보를 수명주기에 맞춰 관리합니다."
      meta={`${data.total}건`}
      actions={
        <Button type="button" size="icon" variant="outline" aria-label="로그인 지원 요청 새로고침" onClick={refresh} disabled={requests.isFetching || busy}>
          <RefreshCw className={requests.isFetching ? 'animate-spin' : undefined} />
        </Button>
      }
    >
      <SettingsSection title="요청 필터" description="상태와 요청 유형은 URL에 보존되어 새로고침과 공유 후에도 같은 범위를 유지합니다.">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-of-muted">
            상태
            <Select aria-label="로그인 지원 상태" value={status} className="mt-1 min-h-11" onChange={(event) => setParams({ status: event.target.value || null, offset: null })}>
              <option value="">전체 상태</option>
              {STATUSES.map((value) => <option key={value} value={value}>{statusCopy[value].label}</option>)}
            </Select>
          </label>
          <label className="text-xs font-medium text-of-muted">
            요청 유형
            <Select aria-label="로그인 지원 유형" value={kind} className="mt-1 min-h-11" onChange={(event) => setParams({ kind: event.target.value || null, offset: null })}>
              <option value="">전체 유형</option>
              {KINDS.map((value) => <option key={value} value={value}>{kindCopy[value]}</option>)}
            </Select>
          </label>
        </div>
        {mutationError && !decision && !redaction ? <MutationFeedback error={mutationError} onRefresh={refresh} /> : null}
      </SettingsSection>

      {data.total === 0 ? (
        <EmptyState title="지원 요청이 없습니다" hint="필터를 바꾸거나 새 요청이 접수된 뒤 다시 확인하세요." />
      ) : (
        <>
          <div className="hidden overflow-x-auto border border-of-border bg-of-surface md:block">
            <table className="w-full min-w-[66rem] text-xs">
              <thead>
                <tr className="border-b border-of-border text-left text-[11px] text-of-muted">
                  <th className="px-3 py-2 font-medium">요청</th>
                  <th className="px-3 py-2 font-medium">연락처 / 내용</th>
                  <th className="px-3 py-2 font-medium">접수</th>
                  <th className="px-3 py-2 font-medium">검토 기록</th>
                  <th className="px-3 py-2 text-right font-medium">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-of-border">
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-3 align-top"><RequestIdentity item={item} /></td>
                    <td className="max-w-80 px-3 py-3 align-top"><ContactDetails item={item} /></td>
                    <td className="whitespace-nowrap px-3 py-3 align-top"><SubmissionDetails item={item} /></td>
                    <td className="max-w-72 px-3 py-3 align-top"><TriageDetails item={item} /></td>
                    <td className="px-3 py-3 align-top"><RequestActions item={item} busy={busy} onReview={() => { resetMutations(); triage.mutate({ id: item.id, status: 'in_review', expectedVersion: item.version }) }} onTerminal={(nextStatus, trigger) => { resetMutations(); setDecision({ item, status: nextStatus, trigger }); setNote('') }} onRedact={(trigger) => { resetMutations(); setRedaction({ item, trigger }) }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul aria-label="모바일 로그인 지원 요청" className="grid gap-2 md:hidden">
            {data.items.map((item) => (
              <li key={item.id} className="border border-of-border bg-of-surface p-3 text-xs">
                <div className="flex items-start justify-between gap-3"><RequestIdentity item={item} /><span className="shrink-0 text-[11px] text-of-muted">v{item.version}</span></div>
                <div className="mt-3"><ContactDetails item={item} /></div>
                <div className="mt-3 grid gap-3 border-t border-of-border-subtle pt-3 sm:grid-cols-2"><SubmissionDetails item={item} /><TriageDetails item={item} /></div>
                <div className="mt-3 border-t border-of-border-subtle pt-3"><RequestActions item={item} busy={busy} onReview={() => { resetMutations(); triage.mutate({ id: item.id, status: 'in_review', expectedVersion: item.version }) }} onTerminal={(nextStatus, trigger) => { resetMutations(); setDecision({ item, status: nextStatus, trigger }); setNote('') }} onRedact={(trigger) => { resetMutations(); setRedaction({ item, trigger }) }} /></div>
              </li>
            ))}
          </ul>
        </>
      )}

      {offset > 0 || offset + data.items.length < data.total ? (
        <nav aria-label="로그인 지원 요청 페이지" className="flex items-center justify-between gap-3">
          <span className="text-xs tabular-nums text-of-muted">{offset + 1}-{Math.min(offset + data.items.length, data.total)} / {data.total}</span>
          <div className="flex gap-1">
            <Button type="button" size="icon" variant="outline" aria-label="이전 로그인 지원 요청 페이지" disabled={offset === 0} onClick={() => setParams({ offset: offset > 50 ? String(offset - 50) : null })}><ChevronLeft /></Button>
            <Button type="button" size="icon" variant="outline" aria-label="다음 로그인 지원 요청 페이지" disabled={offset + data.items.length >= data.total} onClick={() => setParams({ offset: String(offset + 50) })}><ChevronRight /></Button>
          </div>
        </nav>
      ) : null}

      <DecisionDialog decision={decision} note={note} busy={triage.isPending} error={triage.error} onNoteChange={setNote} onClose={closeDecision} onRefresh={() => { closeDecision(); refresh() }} onSubmit={() => { if (!decision || !note.trim()) return; triage.mutate({ id: decision.item.id, status: decision.status, expectedVersion: decision.item.version, note: note.trim() }, { onSuccess: closeDecision }) }} />
      <RedactionDialog redaction={redaction} busy={redact.isPending} error={redact.error} onClose={closeRedaction} onRefresh={() => { closeRedaction(); refresh() }} onSubmit={() => { if (!redaction) return; redact.mutate(redaction.item.id, { onSuccess: closeRedaction }) }} />
    </SettingsFrame>
  )
}

function RequestIdentity({ item }: { item: AuthAssistanceRequest }) {
  const status = statusCopy[item.status]
  return <div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><Badge variant={status.variant}>{status.label}</Badge><Badge variant="outline">{kindCopy[item.kind]}</Badge></div><p className="mt-2 font-mono text-[10px] text-of-muted">{item.id}</p></div>
}

function ContactDetails({ item }: { item: AuthAssistanceRequest }) {
  if (item.redacted_at) return <div className="flex items-center gap-2 text-of-muted"><ShieldCheck size={14} /><span>개인정보 삭제됨</span></div>
  return <div className="min-w-0"><p className="flex items-center gap-1.5 truncate font-medium"><Mail size={13} />{item.email ?? '연락처 없음'}</p><p className="mt-1 line-clamp-3 leading-5 text-of-muted">{item.reason ?? '추가 내용 없음'}</p></div>
}

function SubmissionDetails({ item }: { item: AuthAssistanceRequest }) {
  return <div className="space-y-1 text-[11px] text-of-muted"><p className="flex items-center gap-1.5"><Clock3 size={13} />{formatDateTime(item.last_submitted_at)}</p><p>접수 {item.submission_count}회</p><p>생성 {formatDateTime(item.created_at)}</p></div>
}

function TriageDetails({ item }: { item: AuthAssistanceRequest }) {
  return <div className="space-y-1 text-[11px] text-of-muted"><p className="line-clamp-3 text-of-text">{item.triage_note ?? '검토 메모 없음'}</p>{item.triaged_at ? <p>판단 {formatDateTime(item.triaged_at)}</p> : null}{item.redacted_at ? <p>삭제 {formatDateTime(item.redacted_at)}</p> : null}</div>
}

function RequestActions({ item, busy, onReview, onTerminal, onRedact }: { item: AuthAssistanceRequest; busy: boolean; onReview: () => void; onTerminal: (status: 'resolved' | 'rejected', trigger: HTMLButtonElement) => void; onRedact: (trigger: HTMLButtonElement) => void }) {
  if (!isOpen(item)) {
    return item.redacted_at
      ? <span className="text-xs text-of-muted">삭제 완료</span>
      : <Button type="button" size="sm" variant="outline" disabled={busy} onClick={(event) => onRedact(event.currentTarget)}><Trash2 />개인정보 삭제</Button>
  }
  return <div className="flex flex-wrap justify-end gap-1">{item.status === 'pending' ? <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onReview}><Eye />검토 시작</Button> : null}<Button type="button" size="sm" disabled={busy} onClick={(event) => onTerminal('resolved', event.currentTarget)}><CheckCircle2 />해결</Button><Button type="button" size="sm" variant="subtleDanger" disabled={busy} onClick={(event) => onTerminal('rejected', event.currentTarget)}>거절</Button></div>
}

function MutationFeedback({ error, onRefresh }: { error: unknown; onRefresh: () => void }) {
  return <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 border border-of-danger/20 bg-of-danger-soft px-3 py-2 text-xs text-of-danger"><span>{mutationMessage(error)}</span><Button type="button" size="sm" variant="outline" onClick={onRefresh}><RefreshCw />목록 새로고침</Button></div>
}

function mutationMessage(error: unknown) {
  const conflict = error instanceof ApiError && error.status === 409
  const forbidden = error instanceof ApiError && error.status === 403
  return conflict
    ? '다른 관리자가 이미 변경했거나 요청 상태가 최신이 아닙니다. 목록을 새로고침한 뒤 다시 시도하세요.'
    : forbidden
      ? '이 작업을 수행할 관리자 권한이 없습니다.'
      : '요청을 처리하지 못했습니다. 입력과 현재 상태를 확인한 뒤 다시 시도하세요.'
}

function DecisionDialog({ decision, note, busy, error, onNoteChange, onClose, onRefresh, onSubmit }: { decision: Decision | null; note: string; busy: boolean; error: unknown; onNoteChange: (value: string) => void; onClose: () => void; onRefresh: () => void; onSubmit: () => void }) {
  const label = decision?.status === 'resolved' ? '해결' : '거절'
  return <Dialog.Root open={decision !== null} onOpenChange={(open) => { if (!open && !busy) onClose() }}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-80 bg-black/35 backdrop-blur-[2px]" /><Dialog.Content className="fixed left-1/2 top-1/2 z-81 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-of border border-of-border bg-of-surface p-5 shadow-xl"><Dialog.Title className="text-base font-semibold">요청 {label}</Dialog.Title><Dialog.Description className="mt-1 text-xs leading-5 text-of-muted">최종 판단 근거는 감사 가능한 검토 메모로 남으며 이후 상태를 되돌릴 수 없습니다.</Dialog.Description><label className="mt-4 block text-xs font-medium text-of-muted">검토 메모<Textarea autoFocus aria-label="로그인 지원 검토 메모" maxLength={2000} value={note} disabled={busy} className="mt-1" onChange={(event) => onNoteChange(event.target.value)} /></label>{error ? <DialogMutationError error={error} onRefresh={onRefresh} /> : null}<div className="mt-4 flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>취소</Button><Button type="button" variant={decision?.status === 'rejected' ? 'danger' : 'default'} disabled={busy || !note.trim()} aria-busy={busy} onClick={onSubmit}>{busy ? <Loader2 className="animate-spin" /> : null}{label} 확정</Button></div><button type="button" className="absolute right-3 top-3 grid size-8 place-items-center rounded-of text-of-muted hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus" aria-label="검토 창 닫기" disabled={busy} onClick={onClose}><X size={16} /></button></Dialog.Content></Dialog.Portal></Dialog.Root>
}

function DialogMutationError({ error, onRefresh }: { error: unknown; onRefresh: () => void }) {
  const conflict = error instanceof ApiError && error.status === 409
  return <div role="alert" className="mt-3 border border-of-danger/20 bg-of-danger-soft px-3 py-2 text-xs text-of-danger"><p>{mutationMessage(error)}</p>{conflict ? <Button type="button" size="sm" variant="outline" className="mt-2" onClick={onRefresh}><RefreshCw />최신 목록 받기</Button> : null}</div>
}

function RedactionDialog({ redaction, busy, error, onClose, onRefresh, onSubmit }: { redaction: Redaction | null; busy: boolean; error: unknown; onClose: () => void; onRefresh: () => void; onSubmit: () => void }) {
  return <Dialog.Root open={redaction !== null} onOpenChange={(open) => { if (!open && !busy) onClose() }}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-80 bg-black/35 backdrop-blur-[2px]" /><Dialog.Content className="fixed left-1/2 top-1/2 z-81 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-of border border-of-border bg-of-surface p-5 shadow-xl"><Dialog.Title className="text-base font-semibold">연락 정보 삭제</Dialog.Title><Dialog.Description className="mt-1 text-xs leading-5 text-of-muted">완료된 요청의 이메일, 요청 내용과 검토 메모를 영구 삭제합니다. 요청 상태와 최소 감사 메타데이터는 유지됩니다.</Dialog.Description>{error ? <DialogMutationError error={error} onRefresh={onRefresh} /> : null}<div className="mt-4 flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>취소</Button><Button type="button" variant="danger" disabled={busy} aria-busy={busy} onClick={onSubmit}>{busy ? <Loader2 className="animate-spin" /> : <Trash2 />}삭제</Button></div><button type="button" className="absolute right-3 top-3 grid size-8 place-items-center rounded-of text-of-muted hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus" aria-label="삭제 확인 창 닫기" disabled={busy} onClick={onClose}><X size={16} /></button></Dialog.Content></Dialog.Portal></Dialog.Root>
}
