import { Archive, Building2, ExternalLink, LoaderCircle, Mail, Pencil, Plus, RotateCcw, Search, Tag, X } from 'lucide-react'
import { useState } from 'react'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useMe } from '@/features/members/api'
import { confirmDestructive } from '@/lib/guards'

import {
  useArchiveCustomer,
  useCreateCustomer,
  useCustomers,
  useRestoreCustomer,
  useUpdateCustomer,
} from './api'
import type { Customer, CustomerInput } from './types'

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(new Date(value))
}

const MAX_TAGS = 12
const MAX_TAG_LENGTH = 32

function normalizeTag(value: string) {
  return value.trim().toLocaleLowerCase()
}

function CustomerTagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const addTag = () => {
    const tag = normalizeTag(draft)
    if (!tag) return
    if (tag.length > MAX_TAG_LENGTH) {
      setError(`태그는 ${MAX_TAG_LENGTH}자 이하여야 합니다.`)
      return
    }
    if (tags.includes(tag)) {
      setError('이미 추가된 태그입니다.')
      return
    }
    if (tags.length >= MAX_TAGS) {
      setError(`태그는 최대 ${MAX_TAGS}개까지 추가할 수 있습니다.`)
      return
    }
    onChange([...tags, tag])
    setDraft('')
    setError(null)
  }

  return (
    <div className="mt-3 space-y-2">
      <label htmlFor="customer-tag-input" className="text-xs font-medium text-of-muted">태그 (선택)</label>
      <div className="flex min-w-0 gap-2">
        <Input
          id="customer-tag-input"
          value={draft}
          onChange={(event) => { setDraft(event.target.value); setError(null) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault()
              addTag()
            }
          }}
          maxLength={MAX_TAG_LENGTH + 1}
          placeholder="예: enterprise"
          aria-describedby="customer-tag-help"
        />
        <Button type="button" size="sm" variant="outline" onClick={addTag} disabled={!draft.trim() || tags.length >= MAX_TAGS}>
          <Plus size={14} aria-hidden="true" />추가
        </Button>
      </div>
      <p id="customer-tag-help" className="text-[11px] text-of-muted">Enter 또는 쉼표로 추가 · {tags.length}/{MAX_TAGS}</p>
      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" aria-label="선택한 고객 태그">
          {tags.map((tag) => (
            <span key={tag} className="inline-flex h-7 items-center gap-1 rounded-of border border-of-border bg-of-surface-subtle px-2 text-xs">
              <Tag size={12} aria-hidden="true" />{tag}
              <button type="button" className="rounded p-0.5 text-of-muted hover:bg-of-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus" onClick={() => onChange(tags.filter((item) => item !== tag))} aria-label={`${tag} 태그 제거`} title="태그 제거">
                <X size={12} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {error ? <p className="text-xs text-of-danger" role="alert">{error}</p> : null}
    </div>
  )
}

function CustomerEditor({ customer, onClose }: { customer?: Customer; onClose: () => void }) {
  const create = useCreateCustomer()
  const update = useUpdateCustomer()
  const [name, setName] = useState(customer?.name ?? '')
  const [description, setDescription] = useState(customer?.description ?? '')
  const [email, setEmail] = useState(customer?.email ?? '')
  const [url, setUrl] = useState(customer?.url ?? '')
  const [tags, setTags] = useState(customer?.tags ?? [])
  const mutation = customer ? update : create
  const canSubmit = name.trim().length > 0 && !mutation.isPending

  const submit = () => {
    if (!canSubmit) return
    const input: CustomerInput = {
      name: name.trim(),
      description: description.trim() || null,
      email: email.trim() || null,
      url: url.trim() || null,
      tags,
    }
    if (customer) update.mutate({ id: customer.id, ...input }, { onSuccess: onClose })
    else create.mutate({ ...input, name: name.trim() }, { onSuccess: onClose })
  }

  return (
    <form className="rounded-of border border-of-border bg-of-surface p-4 shadow-[var(--of-shadow-card)]" aria-label={customer ? `${customer.name} 고객 수정` : '새 고객 생성'} onSubmit={(event) => { event.preventDefault(); submit() }}>
      <div className="mb-4 flex min-w-0 flex-wrap items-start justify-between gap-2 border-b border-of-border pb-3"><div><h2 className="text-sm font-semibold">{customer ? '고객 정보 수정' : '새 고객'}</h2><p className="mt-1 text-xs leading-5 text-of-muted">고객 정보와 연결된 작업의 진행 상황을 한곳에서 확인합니다.</p></div><Button size="sm" variant="ghost" onClick={onClose}><X size={14} />취소</Button></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-medium text-of-muted">이름 <span className="text-of-danger">*</span><Input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required autoFocus placeholder="고객 이름" /></label>
        <label className="space-y-1 text-xs font-medium text-of-muted">이메일 (선택)<Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" maxLength={320} placeholder="team@example.com" /></label>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-medium text-of-muted">웹사이트 (선택)<Input value={url} onChange={(event) => setUrl(event.target.value)} type="url" maxLength={2048} placeholder="https://example.com" /></label>
        <label className="space-y-1 text-xs font-medium text-of-muted">설명 (선택)<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={10_000} rows={3} className="flex w-full rounded-of border border-of-border bg-of-surface px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-of-focus" placeholder="고객과 협업 범위를 간단히 설명하세요." /></label>
      </div>
      <CustomerTagEditor tags={tags} onChange={setTags} />
      {mutation.isError ? <p className="mt-3 text-xs text-of-danger" role="alert">{errorMessage(mutation.error, '고객 정보를 저장하지 못했습니다.')}</p> : null}
      <div className="mt-4 flex items-center gap-2"><Button size="sm" type="submit" disabled={!canSubmit}>{mutation.isPending ? <LoaderCircle className="animate-spin" /> : null}{customer ? '저장' : '고객 만들기'}</Button><span className="text-[11px] text-of-muted">필수 항목: 이름</span></div>
    </form>
  )
}

function CustomerCard({ customer, canManage, selectedTag, onEdit, onSelectTag }: { customer: Customer; canManage: boolean; selectedTag: string; onEdit: (customer: Customer) => void; onSelectTag: (tag: string) => void }) {
  const archive = useArchiveCustomer()
  const restore = useRestoreCustomer()
  const archived = customer.archived_at !== null
  const mutation = archived ? restore : archive
  const progress = customer.progress

  return (
    <li className="min-w-0 rounded-of border border-of-border bg-of-surface p-4 shadow-[var(--of-shadow-card)]">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="break-words text-sm font-semibold">{customer.name}</h2>{archived ? <Badge variant="outline">보관됨</Badge> : <Badge variant="accent">활성</Badge>}</div>{customer.description ? <p className="mt-1.5 max-w-3xl break-words text-xs leading-5 text-of-muted">{customer.description}</p> : <p className="mt-1.5 text-xs text-of-muted">설명이 없습니다.</p>}</div>{canManage ? <div className="flex shrink-0 flex-wrap gap-1.5"><Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => onEdit(customer)}><Pencil size={13} />수정</Button><Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => { const message = archived ? `'${customer.name}' 고객을 복원할까요?` : `'${customer.name}' 고객을 보관할까요?\n연결된 작업은 삭제되지 않습니다.`; if (confirmDestructive(message)) mutation.mutate(customer.id) }}>{mutation.isPending ? <LoaderCircle className="animate-spin" /> : archived ? <RotateCcw size={13} /> : <Archive size={13} />}{archived ? '복원' : '보관'}</Button></div> : null}</div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-of-muted">{customer.email ? <a className="inline-flex items-center gap-1 hover:text-of-accent hover:underline" href={`mailto:${customer.email}`}><Mail size={13} aria-hidden="true" />{customer.email}</a> : null}{customer.url ? <a className="inline-flex items-center gap-1 break-all hover:text-of-accent hover:underline" href={customer.url} target="_blank" rel="noreferrer"><ExternalLink size={13} aria-hidden="true" />{customer.url}</a> : null}{archived ? <span>보관일 {formatDate(customer.archived_at!)}</span> : null}</div>
      {customer.tags.length > 0 ? <div className="mt-3 flex flex-wrap gap-1.5" aria-label={`${customer.name} 태그`}>{customer.tags.map((tag) => <button key={tag} type="button" className={`inline-flex h-7 items-center gap-1 rounded-of border px-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus ${selectedTag === tag ? 'border-of-accent bg-of-accent-soft text-of-accent' : 'border-of-border bg-of-surface-subtle text-of-muted hover:bg-of-hover hover:text-of-text'}`} onClick={() => onSelectTag(selectedTag === tag ? '' : tag)} aria-pressed={selectedTag === tag}><Tag size={12} aria-hidden="true" />{tag}</button>)}</div> : null}
      <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-of-border pt-3 text-xs sm:grid-cols-5"><div><dt className="text-of-muted">전체 작업</dt><dd className="mt-1 font-semibold tabular-nums">{progress.total}</dd></div><div><dt className="text-of-muted">진행 중</dt><dd className="mt-1 font-semibold tabular-nums text-of-accent">{progress.open}</dd></div><div><dt className="text-of-muted">완료</dt><dd className="mt-1 font-semibold tabular-nums">{progress.done}</dd></div><div><dt className="text-of-muted">기한 초과</dt><dd className="mt-1 font-semibold tabular-nums text-of-danger">{progress.overdue}</dd></div><div><dt className="text-of-muted">연결 프로젝트</dt><dd className="mt-1 font-semibold tabular-nums">{progress.project_count}</dd></div></dl>
      {mutation.isError ? <p className="mt-3 text-xs text-of-danger" role="alert">{errorMessage(mutation.error, '고객 상태를 변경하지 못했습니다.')}</p> : null}
    </li>
  )
}

export function CustomersPage() {
  const me = useMe()
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [selectedTag, setSelectedTag] = useState('')
  const [editing, setEditing] = useState<Customer | 'new' | null>(null)
  const customers = useCustomers({ query: appliedSearch, includeArchived, tag: selectedTag })
  const tagSource = useCustomers({ includeArchived })
  const canManage = me.data?.is_admin === true

  if (customers.isPending) return <ListSkeleton />
  if (customers.isError) return <ErrorState error={customers.error} onRetry={() => customers.refetch()} />

  const items = customers.data.items
  const availableTags = [...new Set((tagSource.data?.items ?? items).flatMap((customer) => customer.tags))]
    .sort((left, right) => left.localeCompare(right, 'ko'))
  return (
    <main className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-5 px-4 py-5 sm:px-6">
      <header className="flex min-w-0 flex-col gap-4 border-b border-of-border pb-4"><div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="mb-2 inline-flex items-center gap-1 rounded-of border border-of-border bg-of-surface px-2 py-1 text-[11px] font-medium text-of-muted"><Building2 size={12} aria-hidden="true" />Workspace</div><h1 className="text-base font-semibold">고객</h1><p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">고객 정보와 고객에 연결된 작업 항목의 진행 상황을 확인합니다.</p></div>{canManage ? <Button size="sm" onClick={() => setEditing('new')}><Plus size={14} />고객 만들기</Button> : null}</div><div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center"><form className="flex min-w-0 flex-1 gap-2 sm:max-w-md" onSubmit={(event) => { event.preventDefault(); setAppliedSearch(search) }}><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="고객 이름으로 검색" aria-label="고객 이름으로 검색" /><Button size="sm" variant="outline" type="submit"><Search size={14} />검색</Button></form><label className="inline-flex min-w-0 items-center gap-2 text-xs text-of-muted"><Tag size={14} aria-hidden="true" /><span className="sr-only sm:not-sr-only">태그</span><select value={selectedTag} onChange={(event) => setSelectedTag(event.target.value)} disabled={tagSource.isPending} className="h-8 min-w-0 rounded-of border border-of-border bg-of-surface px-2 text-xs text-of-text outline-none focus-visible:ring-2 focus-visible:ring-of-focus" aria-label="고객 태그 필터"><option value="">전체</option>{availableTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}</select></label><label className="inline-flex items-center gap-2 text-xs text-of-muted"><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} className="h-4 w-4 rounded border-of-border" />보관된 고객 포함</label></div></header>
      {editing ? <CustomerEditor key={editing === 'new' ? 'new' : editing.id} customer={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} /> : null}
      <section aria-label="고객 목록" className="min-w-0"><div className="mb-3 flex items-center justify-between gap-2"><p className="text-sm font-semibold">고객 목록 <span className="ml-1 text-xs font-normal text-of-muted">{customers.data.total}</span></p>{appliedSearch || selectedTag ? <button type="button" className="text-xs text-of-accent hover:underline" onClick={() => { setSearch(''); setAppliedSearch(''); setSelectedTag('') }}>필터 지우기</button> : null}</div>{items.length === 0 ? <EmptyState title={appliedSearch || selectedTag ? '검색 결과가 없습니다' : '등록된 고객이 없습니다'} hint={canManage ? '고객을 만들면 연결된 작업의 진행 현황을 이곳에서 볼 수 있습니다.' : '워크스페이스 관리자가 고객을 등록하면 이곳에 표시됩니다.'}>{canManage && !editing ? <Button size="sm" onClick={() => setEditing('new')}><Plus size={14} />고객 만들기</Button> : null}</EmptyState> : <ul className="space-y-3">{items.map((customer) => <CustomerCard key={customer.id} customer={customer} canManage={canManage} selectedTag={selectedTag} onEdit={setEditing} onSelectTag={setSelectedTag} />)}</ul>}</section>
    </main>
  )
}
