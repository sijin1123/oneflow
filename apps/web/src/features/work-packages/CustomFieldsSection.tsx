import {
  CalendarDays,
  Hash,
  Link2,
  ListChecks,
  RotateCcw,
  SlidersHorizontal,
  TextCursorInput,
  ToggleLeft,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import type React from 'react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  type CustomField,
  FIELD_TYPE_LABELS,
  useCustomFields,
  useCustomValues,
  usePutCustomValue,
} from '@/features/custom-fields/api'
import { useMembers } from '@/features/members/api'
import { ApiError } from '@/lib/api'

import { useTypeLabels } from './useTypeLabels'

const FIELD_TYPE_ICONS: Record<CustomField['field_type'], LucideIcon> = {
  text: TextCursorInput,
  number: Hash,
  boolean: ToggleLeft,
  date: CalendarDays,
  dropdown: ListChecks,
  member: UserRound,
  url: Link2,
}

function hasCustomValue(value: unknown) {
  return value !== undefined && value !== null && value !== ''
}

function scopeLabel(field: CustomField, typeLabel: (key: string) => string) {
  return field.applies_to
    ? field.applies_to.map((key) => typeLabel(key)).join(' · ')
    : '모든 타입'
}

function MemberFieldInput({
  field,
  value,
  displayName,
  projectId,
  pending,
  onSave,
}: {
  field: CustomField
  value: unknown
  displayName: string | null
  projectId: string
  pending: boolean
  onSave: (value: unknown) => void
}) {
  const members = useMembers(projectId)
  const selected = typeof value === 'string' ? value : ''
  const selectedExists = members.data?.items.some((member) => member.user_id === selected)

  if (members.isError) {
    return (
      <div className="flex items-center justify-between gap-3 text-xs">
        <p role="alert" className="text-of-danger">멤버 목록을 불러오지 못했습니다.</p>
        <Button variant="ghost" size="sm" onClick={() => { void members.refetch() }}>
          <RotateCcw size={13} aria-hidden="true" /> 다시 시도
        </Button>
      </div>
    )
  }

  return (
    <Select
      aria-label={field.name}
      className="h-8 text-xs"
      value={selected}
      disabled={pending || members.isPending}
      onChange={(event) => onSave(event.target.value || null)}
    >
      <option value="">없음</option>
      {selected && !selectedExists ? (
        <option value={selected}>{displayName || selected} (현재 값)</option>
      ) : null}
      {members.data?.items.map((member) => (
        <option key={member.user_id} value={member.user_id}>
          {member.display_name}
        </option>
      ))}
    </Select>
  )
}

function FieldInput({
  field,
  value,
  memberDisplayName,
  wpId,
  projectId,
  editable,
  canWrite,
}: {
  field: CustomField
  value: unknown
  memberDisplayName: string | null
  wpId: string
  projectId: string
  editable: boolean
  canWrite: boolean
}) {
  const put = usePutCustomValue(wpId)
  const [draft, setDraft] = useState<string | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)

  const save = (nextValue: unknown) => put.mutate({ field_id: field.id, value: nextValue })
  const mutationError =
    put.isError && put.error instanceof ApiError ? put.error.message : put.isError ? '실패' : null
  const commitText = () => {
    if (draft === null) return
    const trimmed = draft.trim()
    const current = typeof value === 'string' || typeof value === 'number' ? String(value) : ''
    if (trimmed === current) {
      setDraft(null)
      setDraftError(null)
      return
    }
    if (trimmed === '') {
      save(null)
    } else if (field.field_type === 'number') {
      const numberValue = Number(trimmed)
      if (!Number.isFinite(numberValue)) {
        setDraftError('유효한 숫자를 입력하세요.')
        return
      }
      save(numberValue)
    } else {
      save(trimmed)
    }
    setDraft(null)
    setDraftError(null)
  }

  let control: React.ReactNode
  if (!editable) {
    const shownValue = field.field_type === 'member' && memberDisplayName
      ? memberDisplayName
      : String(value)
    control = (
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
        <span className="min-w-0 truncate text-of-secondary">
          {shownValue} {field.is_active ? '(다른 타입 필드)' : '(비활성 필드)'}
        </span>
        {canWrite ? (
          <button
            type="button"
            className="shrink-0 rounded-of px-1.5 py-1 text-of-muted transition-colors hover:bg-of-surface-hover hover:text-of-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
            disabled={put.isPending}
            onClick={() => save(null)}
          >
            비우기
          </button>
        ) : null}
      </div>
    )
    return <FieldControl control={control} error={mutationError} />
  }

  switch (field.field_type) {
    case 'boolean':
      control = (
        <label className="inline-flex min-h-8 items-center gap-2 text-xs text-of-secondary">
          <input
            type="checkbox"
            aria-label={field.name}
            checked={value === true}
            disabled={put.isPending}
            onChange={(event) => save(event.target.checked)}
            className="h-4 w-4 accent-of-accent"
          />
          {value === true ? '예' : '아니오'}
        </label>
      )
      break
    case 'dropdown': {
      const orphan = typeof value === 'string' && !(field.options ?? []).includes(value)
      control = (
        <Select
          aria-label={field.name}
          className="h-8 text-xs"
          value={typeof value === 'string' ? value : ''}
          disabled={put.isPending}
          onChange={(event) => save(event.target.value || null)}
        >
          <option value="">없음</option>
          {orphan && typeof value === 'string' ? (
            <option value={value}>{value} (제거된 옵션)</option>
          ) : null}
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </Select>
      )
      break
    }
    case 'member':
      control = (
        <MemberFieldInput
          field={field}
          value={value}
          displayName={memberDisplayName}
          projectId={projectId}
          pending={put.isPending}
          onSave={save}
        />
      )
      break
    case 'date':
      control = (
        <Input
          type="date"
          aria-label={field.name}
          className="h-8 w-full text-xs sm:max-w-44"
          value={typeof value === 'string' ? value : ''}
          disabled={put.isPending}
          onChange={(event) => save(event.target.value || null)}
        />
      )
      break
    default:
      control = (
        <Input
          type={field.field_type === 'number' ? 'number' : field.field_type === 'url' ? 'url' : 'text'}
          aria-label={field.name}
          className="h-8 text-xs"
          value={draft ?? (value == null ? '' : String(value))}
          disabled={put.isPending}
          onChange={(event) => {
            setDraft(event.target.value)
            setDraftError(null)
          }}
          onBlur={commitText}
        />
      )
  }
  return <FieldControl control={control} error={draftError ?? mutationError} />
}

function FieldControl({ control, error }: { control: React.ReactNode; error: string | null }) {
  return (
    <div className="min-w-0">
      {control}
      {error ? <p role="alert" className="mt-1 text-[11px] text-of-danger">저장 실패: {error}</p> : null}
    </div>
  )
}

function SectionStatus({
  message,
  error,
  onRetry,
}: {
  message: string
  error?: boolean
  onRetry?: () => void
}) {
  return (
    <section aria-label="커스텀 필드" className="border-y border-of-border-subtle bg-of-surface">
      <div className="flex min-h-11 items-center gap-2 px-3">
        <SlidersHorizontal size={14} className="text-of-muted" aria-hidden="true" />
        <h3 className="text-xs font-semibold">커스텀 필드</h3>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-of-border-subtle px-3 py-3 text-xs">
        <p role={error ? 'alert' : 'status'} className={error ? 'text-of-danger' : 'text-of-muted'}>{message}</p>
        {onRetry ? (
          <Button variant="ghost" size="sm" onClick={onRetry}>
            <RotateCcw size={13} aria-hidden="true" /> 다시 시도
          </Button>
        ) : null}
      </div>
    </section>
  )
}

export function CustomFieldsSection({
  wpId,
  projectId,
  wpType,
  canWrite,
}: {
  wpId: string
  projectId: string
  wpType: string
  canWrite: boolean
}) {
  const fields = useCustomFields(projectId, true)
  const values = useCustomValues(wpId)
  const typeLabel = useTypeLabels(projectId)

  if (fields.isError) {
    return <SectionStatus error message="커스텀 필드 정의를 불러오지 못했습니다." onRetry={() => { void fields.refetch() }} />
  }
  if (fields.isPending || !fields.data) {
    return <SectionStatus message="커스텀 필드를 불러오는 중..." />
  }
  if (fields.data.total === 0) return null
  if (values.isError) {
    return <SectionStatus error message="커스텀 필드 값을 불러오지 못했습니다." onRetry={() => { void values.refetch() }} />
  }
  if (values.isPending || !values.data) {
    return <SectionStatus message="커스텀 필드 값을 불러오는 중..." />
  }

  const valueMap = new Map(values.data.items.map((entry) => [entry.field_id, entry]))
  const bound = (field: CustomField) =>
    field.applies_to === null || field.applies_to.includes(wpType)
  const visible = fields.data.items.filter(
    (field) => (field.is_active && bound(field)) || valueMap.has(field.id),
  )
  if (visible.length === 0) return null
  const filled = visible.filter((field) => hasCustomValue(valueMap.get(field.id)?.value)).length

  return (
    <section aria-label="커스텀 필드" className="border-y border-of-border-subtle bg-of-surface">
      <div className="flex min-h-11 min-w-0 items-center gap-2 px-3">
        <SlidersHorizontal size={14} className="shrink-0 text-of-muted" aria-hidden="true" />
        <h3 className="text-xs font-semibold">커스텀 필드</h3>
        <span className="truncate text-[11px] text-of-muted">{visible.length}개 · 값 {filled}개</span>
      </div>

      <div className="divide-y divide-of-border-subtle border-t border-of-border-subtle">
        {visible.map((field) => {
          const Icon = FIELD_TYPE_ICONS[field.field_type]
          const entry = valueMap.get(field.id)
          const editable = canWrite && field.is_active && bound(field)
          return (
            <div
              key={field.id}
              className="grid min-w-0 gap-2 px-3 py-2.5 transition-colors hover:bg-of-surface-hover/60 sm:grid-cols-[minmax(10rem,0.85fr)_minmax(0,1.4fr)] sm:items-center"
            >
              <div className="flex min-w-0 items-start gap-2">
                <Icon size={14} className="mt-0.5 shrink-0 text-of-muted" aria-hidden="true" />
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <label className="truncate text-xs font-medium">{field.name}</label>
                    <Badge variant="neutral" className="shrink-0">{FIELD_TYPE_LABELS[field.field_type]}</Badge>
                    {!editable ? (
                      <Badge variant="outline" className="shrink-0">
                        {hasCustomValue(entry?.value) ? '보존값' : '읽기'}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-of-muted">{scopeLabel(field, typeLabel)}</p>
                </div>
              </div>
              <FieldInput
                field={field}
                value={entry?.value}
                memberDisplayName={entry?.member_display_name ?? null}
                wpId={wpId}
                projectId={projectId}
                editable={editable}
                canWrite={canWrite}
              />
            </div>
          )
        })}
      </div>
    </section>
  )
}
