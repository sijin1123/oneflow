import {
  CalendarDays,
  CheckSquare,
  Hash,
  Link2,
  ListChecks,
  SlidersHorizontal,
  TextCursorInput,
  ToggleLeft,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import type React from 'react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
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
import { cn } from '@/lib/utils'

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

function FieldMetric({
  icon: Icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: LucideIcon
  label: string
  value: string
  tone?: 'accent' | 'neutral'
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-of border border-of-border bg-of-surface px-3 py-3">
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-of',
          tone === 'accent' ? 'bg-of-accent-soft text-of-accent' : 'bg-of-surface-2 text-of-muted',
        )}
      >
        <Icon size={15} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] text-of-muted">{label}</span>
        <span className="block text-sm font-semibold tabular-nums">{value}</span>
      </span>
    </div>
  )
}

function hasCustomValue(value: unknown) {
  return value !== undefined && value !== null && value !== ''
}

function scopeLabel(field: CustomField, typeLabel: (key: string) => string) {
  return field.applies_to
    ? field.applies_to.map((key) => typeLabel(key)).join(' · ')
    : '모든 타입'
}

function FieldInput({
  field,
  value,
  wpId,
  projectId,
  editable,
  canWrite,
}: {
  field: CustomField
  value: unknown
  wpId: string
  projectId: string
  editable: boolean
  canWrite: boolean
}) {
  const put = usePutCustomValue(wpId)
  const members = useMembers(projectId)
  // Local draft for typed inputs; committed on blur (delta PUT of one field).
  const [draft, setDraft] = useState<string | null>(null)

  const save = (v: unknown) => put.mutate({ field_id: field.id, value: v })
  const err =
    put.isError && put.error instanceof ApiError ? put.error.message : put.isError ? '실패' : null
  const commitText = () => {
    if (draft === null) return
    const trimmed = draft.trim()
    const current = typeof value === 'string' || typeof value === 'number' ? String(value) : ''
    if (trimmed !== current) {
      if (trimmed === '') save(null)
      else if (field.field_type === 'number') save(Number(trimmed))
      else save(trimmed)
    }
    setDraft(null)
  }

  let control: React.ReactNode
  if (!editable) {
    // Inactive with a stored value: read-only + a clear affordance.
    control = (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="min-w-0 text-of-muted">
          {String(value)} {field.is_active ? '(다른 타입 필드)' : '(비활성 필드)'}
        </span>
        {canWrite ? (
          <button
            type="button"
            className="text-of-muted hover:text-of-danger"
            onClick={() => save(null)}
          >
            비우기
          </button>
        ) : null}
      </div>
    )
    return <Wrapped control={control} err={err} />
  }

  switch (field.field_type) {
    case 'boolean':
      control = (
        <input
          type="checkbox"
          aria-label={field.name}
          checked={value === true}
          disabled={put.isPending}
          onChange={(e) => save(e.target.checked)}
          className="h-4 w-4 accent-of-accent"
        />
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
          onChange={(e) => save(e.target.value || null)}
        >
          <option value="">없음</option>
          {orphan && typeof value === 'string' ? (
            <option value={value}>{value} (제거된 옵션)</option>
          ) : null}
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      )
      break
    }
    case 'member':
      control = (
        <Select
          aria-label={field.name}
          className="h-8 text-xs"
          value={typeof value === 'string' ? value : ''}
          disabled={put.isPending}
          onChange={(e) => save(e.target.value || null)}
        >
          <option value="">없음</option>
          {members.data?.items.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.display_name}
            </option>
          ))}
        </Select>
      )
      break
    case 'date':
      control = (
        <Input
          type="date"
          aria-label={field.name}
          className="h-8 w-full text-xs sm:w-40"
          value={typeof value === 'string' ? value : ''}
          disabled={put.isPending}
          onChange={(e) => save(e.target.value || null)}
        />
      )
      break
    default:
      // text / number / url — commit on blur.
      control = (
        <Input
          type={field.field_type === 'number' ? 'number' : 'text'}
          aria-label={field.name}
          className="h-8 text-xs"
          value={draft ?? (value == null ? '' : String(value))}
          disabled={put.isPending}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitText}
        />
      )
  }
  return <Wrapped control={control} err={err} />
}

function Wrapped({ control, err }: { control: React.ReactNode; err: string | null }) {
  return (
    <>
      {control}
      {err ? (
        <p role="alert" className="text-[11px] text-of-danger">
          저장 실패: {err}
        </p>
      ) : null}
    </>
  )
}

/* Custom field values in the drawer (Pass 3 PR-J). Fetches definitions with
   include_inactive so stored values on deactivated fields stay visible. */
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

  if (!fields.data || fields.data.total === 0) return null
  const valueMap = new Map((values.data?.items ?? []).map((v) => [v.field_id, v.value]))

  // Binding shapes the FORM: a field renders when it is active AND applies to
  // the current type, or when a stored value remains (read-only + clear path).
  const bound = (f: (typeof fields.data.items)[number]) =>
    f.applies_to === null || f.applies_to.includes(wpType)
  const visible = fields.data.items.filter(
    (f) => (f.is_active && bound(f)) || valueMap.has(f.id),
  )
  if (visible.length === 0) return null
  const filled = visible.filter((f) => hasCustomValue(valueMap.get(f.id))).length
  const editableCount = visible.filter((f) => canWrite && f.is_active && bound(f)).length

  return (
    <section aria-label="커스텀 필드" className="rounded-of border border-of-border bg-of-surface p-4">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">커스텀 필드</h3>
          <p className="mt-1 text-xs leading-5 text-of-muted">
            프로젝트별 속성과 저장된 값을 한 곳에서 확인합니다.
          </p>
        </div>
        <Badge variant={canWrite ? 'accent' : 'outline'} className="self-start">
          {canWrite ? '편집 가능' : '읽기 전용'}
        </Badge>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <FieldMetric icon={SlidersHorizontal} label="필드" value={`${visible.length}개`} tone="accent" />
        <FieldMetric icon={CheckSquare} label="값 있음" value={`${filled}개`} />
        <FieldMetric icon={ListChecks} label="편집 가능" value={`${editableCount}개`} />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {visible.map((f) => {
          const Icon = FIELD_TYPE_ICONS[f.field_type]
          const value = valueMap.get(f.id)
          const editable = canWrite && f.is_active && bound(f)
          return (
          <div key={f.id} className="rounded-of border border-of-border bg-of-surface-2/35 p-3">
            <div className="mb-3 flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <label className="block truncate text-xs font-semibold">{f.name}</label>
                <p className="mt-1 truncate text-[11px] text-of-muted">
                  {scopeLabel(f, typeLabel)}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1">
                <Badge variant="neutral">
                  <Icon size={12} aria-hidden="true" /> {FIELD_TYPE_LABELS[f.field_type]}
                </Badge>
                <Badge variant={editable ? 'accent' : 'outline'}>
                  {editable ? '입력' : hasCustomValue(value) ? '보존값' : '읽기'}
                </Badge>
              </div>
            </div>
            <FieldInput
              field={f}
              value={value}
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
