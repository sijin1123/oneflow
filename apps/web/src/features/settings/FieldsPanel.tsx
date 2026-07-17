import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useProjectTypeOptions } from '@/features/project-types/useProjectTypeOptions'
import { type WpType } from '@/features/work-packages/types'
import { useTypeLabels } from '@/features/work-packages/useTypeLabels'
import {
  type CustomFieldType,
  FIELD_TYPE_LABELS,
  useCreateCustomField,
  useReorderCustomFields,
  useCustomFields,
  useDeleteCustomField,
  useUpdateCustomField,
} from '@/features/custom-fields/api'
import { ApiError } from '@/lib/api'
import { confirmDestructive } from '@/lib/guards'

/* Custom field definitions (Pass 3 PR-J). Deactivation hides the input but
   keeps stored values; hard delete only succeeds on fields with no values
   (the server answers 409 otherwise — surfaced inline). */
export function FieldsPanel({
  projectId,
  isOwner,
  onDirtyChange,
}: {
  projectId: string
  isOwner: boolean
  onDirtyChange: (dirty: boolean) => void
}) {
  const fields = useCustomFields(projectId, true)
  const create = useCreateCustomField(projectId)
  const update = useUpdateCustomField(projectId)
  const remove = useDeleteCustomField(projectId)
  const reorder = useReorderCustomFields(projectId)
  const projectTypes = useProjectTypeOptions(projectId)
  const typeLabel = useTypeLabels(projectId)

  const move = (index: number, delta: -1 | 1) => {
    const items = fields.data?.items ?? []
    const target = index + delta
    if (target < 0 || target >= items.length) return
    const ids = items.map((f) => f.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    reorder.mutate(ids)
  }

  const [name, setName] = useState('')
  const [type, setType] = useState<CustomFieldType>('text')
  const [options, setOptions] = useState('')
  const [appliesTo, setAppliesTo] = useState<WpType[]>([])

  const dirty = name.trim() !== '' || options.trim() !== ''
  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  const createErr =
    create.error instanceof ApiError ? create.error.message : create.isError ? '실패' : null
  const removeErr =
    remove.error instanceof ApiError && remove.error.status === 409
      ? '값이 남아 있는 필드는 삭제할 수 없습니다. 대신 비활성화하세요.'
      : remove.isError
        ? '삭제하지 못했습니다.'
        : null

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-of border border-of-border bg-of-surface p-3">
        <p className="text-xs font-medium">커스텀 필드</p>
        <p className="text-xs text-of-muted">
          작업 드로어에 표시되는 프로젝트 전용 필드입니다. 비활성화하면 입력은 숨고 기존 값은
          유지됩니다.
        </p>
        {fields.data && fields.data.total > 0 ? (
          <ul className="space-y-1">
            {fields.data.items.map((f, idx) => (
              <li
                key={f.id}
                className="flex items-center gap-2 rounded-of border border-of-border px-2 py-1.5 text-xs"
              >
                <span className={`min-w-0 flex-1 truncate font-medium ${f.is_active ? '' : 'text-of-muted line-through'}`}>
                  {f.name}
                </span>
                <Badge variant="neutral">{FIELD_TYPE_LABELS[f.field_type]}</Badge>
                {f.field_type === 'dropdown' && f.options ? (
                  <span className="hidden max-w-40 truncate text-of-muted sm:inline">
                    {f.options.join(' · ')}
                  </span>
                ) : null}
                <span className="hidden shrink-0 text-[10px] text-of-muted sm:inline">
                  {f.applies_to
                    ? f.applies_to.map((key) => typeLabel(key)).join('·')
                    : '모든 타입'}
                </span>
                {isOwner ? (
                  <>
                    <button
                      type="button"
                      aria-label={`${f.name} 위로`}
                      className="shrink-0 text-of-muted hover:text-of-accent disabled:opacity-30"
                      disabled={reorder.isPending || idx === 0}
                      onClick={() => move(idx, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`${f.name} 아래로`}
                      className="shrink-0 text-of-muted hover:text-of-accent disabled:opacity-30"
                      disabled={reorder.isPending || idx === (fields.data?.items.length ?? 0) - 1}
                      onClick={() => move(idx, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="shrink-0 text-[11px] text-of-muted hover:text-of-accent"
                      onClick={() => update.mutate({ fieldId: f.id, is_active: !f.is_active })}
                    >
                      {f.is_active ? '비활성화' : '활성화'}
                    </button>
                    <button
                      type="button"
                      aria-label={`${f.name} 삭제`}
                      className="shrink-0 rounded-of p-1 text-of-muted hover:bg-of-surface-2 hover:text-of-danger"
                      onClick={() => {
                        if (
                          confirmDestructive(
                            `'${f.name}' 필드를 삭제할까요?\n값이 하나라도 남아 있으면 삭제되지 않습니다.`,
                          )
                        )
                          remove.mutate(f.id)
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-of-muted">정의된 필드가 없습니다.</p>
        )}
        {removeErr ? (
          <p role="alert" className="text-xs text-of-danger">
            {removeErr}
          </p>
        ) : null}
      </div>

      {isOwner ? (
        <div className="space-y-2 rounded-of border border-of-border bg-of-surface p-3">
          <p className="text-xs font-medium">필드 추가</p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="필드 이름"
              aria-label="새 필드 이름"
              className="h-8 w-40 text-xs"
            />
            <Select
              aria-label="새 필드 타입"
              className="h-8 w-28 text-xs"
              value={type}
              onChange={(e) => setType(e.target.value as CustomFieldType)}
            >
              {(Object.keys(FIELD_TYPE_LABELS) as CustomFieldType[]).map((t) => (
                <option key={t} value={t}>
                  {FIELD_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
            {type === 'dropdown' ? (
              <Input
                value={options}
                onChange={(e) => setOptions(e.target.value)}
                placeholder="옵션 (쉼표로 구분)"
                aria-label="드롭다운 옵션"
                className="h-8 w-52 text-xs"
              />
            ) : null}
            <span className="flex items-center gap-2 text-[11px] text-of-muted">
              적용 타입:
              {projectTypes.options.map((item) => (
                <label key={item.key} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    aria-label={`${item.label} 타입에 적용`}
                    checked={appliesTo.includes(item.key)}
                    onChange={(e) =>
                      setAppliesTo((prev) =>
                        e.target.checked
                          ? [...prev, item.key]
                          : prev.filter((key) => key !== item.key),
                      )
                    }
                    className="h-3 w-3 accent-of-accent"
                  />
                  {item.label}
                </label>
              ))}
              <span>(비우면 모든 타입)</span>
            </span>
            <Button
              size="sm"
              disabled={
                !name.trim() ||
                (type === 'dropdown' && !options.trim()) ||
                create.isPending
              }
              onClick={() =>
                create.mutate(
                  {
                    name: name.trim(),
                    field_type: type,
                    ...(type === 'dropdown'
                      ? {
                          options: options
                            .split(',')
                            .map((o) => o.trim())
                            .filter(Boolean),
                        }
                      : {}),
                    ...(appliesTo.length > 0 ? { applies_to: appliesTo } : {}),
                  },
                  {
                    onSuccess: () => {
                      setName('')
                      setOptions('')
                      setType('text')
                      setAppliesTo([])
                    },
                  },
                )
              }
            >
              필드 추가
            </Button>
          </div>
          {createErr ? (
            <p role="alert" className="text-xs text-of-danger">
              {createErr}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
