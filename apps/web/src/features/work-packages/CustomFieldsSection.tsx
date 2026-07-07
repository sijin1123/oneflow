import type React from 'react'
import { useState } from 'react'

import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  type CustomField,
  useCustomFields,
  useCustomValues,
  usePutCustomValue,
} from '@/features/custom-fields/api'
import { useMembers } from '@/features/members/api'
import { ApiError } from '@/lib/api'

function FieldInput({
  field,
  value,
  wpId,
  projectId,
  editable,
}: {
  field: CustomField
  value: unknown
  wpId: string
  projectId: string
  editable: boolean
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
      <div className="flex items-center gap-2 text-xs">
        <span className="text-of-muted">
          {String(value)} {field.is_active ? '(다른 타입 필드)' : '(비활성 필드)'}
        </span>
        <button
          type="button"
          className="text-of-muted hover:text-of-danger"
          onClick={() => save(null)}
        >
          비우기
        </button>
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
          className="h-3.5 w-3.5 accent-of-accent"
        />
      )
      break
    case 'dropdown': {
      const orphan = typeof value === 'string' && !(field.options ?? []).includes(value)
      control = (
        <Select
          aria-label={field.name}
          className="h-7 text-xs"
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
          className="h-7 text-xs"
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
          className="h-7 w-36 text-xs"
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
          className="h-7 text-xs"
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
}: {
  wpId: string
  projectId: string
  wpType: string
}) {
  const fields = useCustomFields(projectId, true)
  const values = useCustomValues(wpId)

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

  return (
    <section aria-label="커스텀 필드" className="space-y-3 border-t border-of-border pt-3">
      <h3 className="text-xs font-semibold text-of-muted">커스텀 필드</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {visible.map((f) => (
          <div key={f.id} className="space-y-1">
            <label className="text-xs font-medium text-of-muted">{f.name}</label>
            <FieldInput
              field={f}
              value={valueMap.get(f.id)}
              wpId={wpId}
              projectId={projectId}
              editable={f.is_active && bound(f)}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
