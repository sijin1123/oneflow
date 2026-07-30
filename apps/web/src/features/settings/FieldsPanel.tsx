import {
  Braces,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  ListChecks,
  LoaderCircle,
  Lock,
  LockKeyhole,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  ToggleLeft,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import {
  InlineActionMenu,
  type InlineActionMenuItem,
} from '@/components/ui/action-menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  type CustomField,
  type CustomFieldType,
  FIELD_TYPE_LABELS,
  useCreateCustomField,
  useCustomFields,
  useDeleteCustomField,
  useReorderCustomFields,
  useUpdateCustomField,
} from '@/features/custom-fields/api'
import { usePermissionReport } from '@/features/members/api'
import { useProjectTypeOptions } from '@/features/project-types/useProjectTypeOptions'
import { useProject } from '@/features/projects/api'
import { type WpType } from '@/features/work-packages/types'
import { useTypeLabels } from '@/features/work-packages/useTypeLabels'
import { ApiError } from '@/lib/api'
import { confirmDestructive } from '@/lib/guards'
import { cn } from '@/lib/utils'

type CreateInput = {
  name: string
  field_type: CustomFieldType
  options?: string[]
  applies_to?: WpType[] | null
}

type UpdateInput = {
  fieldId: string
  name?: string
  options?: string[]
  applies_to?: WpType[] | null
  is_active?: boolean
}

const parseOptions = (value: string) =>
  value
    .split(',')
    .map((option) => option.trim())
    .filter(Boolean)

const hasDuplicateOptions = (value: string) => {
  const options = parseOptions(value)
  return new Set(options).size !== options.length
}

function TypeBindings({
  selected,
  options,
  disabled = false,
  labelPrefix,
  onChange,
}: {
  selected: WpType[]
  options: { key: string; label: string }[]
  disabled?: boolean
  labelPrefix: string
  onChange: (next: WpType[]) => void
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-[10px] font-medium text-of-muted">
        적용 작업 타입
      </legend>
      <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1.5">
        {options.map((item) => (
          <label
            key={item.key}
            className="flex min-w-0 items-center gap-1.5 text-[11px] text-of-text"
          >
            <input
              type="checkbox"
              aria-label={`${labelPrefix} ${item.label} 타입에 적용`}
              checked={selected.includes(item.key)}
              disabled={disabled}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, item.key]
                    : selected.filter((key) => key !== item.key),
                )
              }
              className="h-3.5 w-3.5 shrink-0 accent-of-accent"
            />
            <span className="truncate">{item.label}</span>
          </label>
        ))}
        <span className="text-[10px] text-of-muted">
          {selected.length === 0 ? '모든 타입에 적용' : `${selected.length}개 타입`}
        </span>
      </div>
    </fieldset>
  )
}

function FieldActions({
  field,
  canEdit,
  writeDisabled,
  onEdit,
  onToggle,
  onDelete,
}: {
  field: CustomField
  canEdit: boolean
  writeDisabled: boolean
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const items: InlineActionMenuItem[] = canEdit
    ? [
        {
          label: '편집',
          ariaLabel: `${field.name} 편집`,
          icon: <Pencil size={14} />,
          onSelect: onEdit,
        },
        {
          label: field.is_active ? '비활성화' : '활성화',
          ariaLabel: `${field.name} ${field.is_active ? '비활성화' : '활성화'}`,
          icon: <ToggleLeft size={14} />,
          disabled: writeDisabled,
          onSelect: onToggle,
        },
        {
          label: '삭제',
          ariaLabel: `${field.name} 삭제`,
          icon: <Trash2 size={14} />,
          tone: 'danger',
          disabled: writeDisabled,
          onSelect: onDelete,
        },
      ]
    : [
        {
          label: '쓰기 권한 없음',
          ariaLabel: `${field.name} 쓰기 권한 없음`,
          icon: <Lock size={14} />,
          disabled: true,
          onSelect: () => undefined,
        },
      ]

  return (
    <InlineActionMenu
      label={`${field.name} 필드 작업`}
      menuLabel={`${field.name} 필드 작업 메뉴`}
      items={items}
    />
  )
}

function FieldRow({
  field,
  index,
  total,
  projectId,
  canEdit,
  writeDisabled,
  projectTypes,
  typeLabel,
  reorderPending,
  onMove,
  onDirtyChange,
}: {
  field: CustomField
  index: number
  total: number
  projectId: string
  canEdit: boolean
  writeDisabled: boolean
  projectTypes: { key: string; label: string }[]
  typeLabel: (key: string) => string
  reorderPending: boolean
  onMove: (index: number, delta: -1 | 1) => void
  onDirtyChange: (fieldId: string, dirty: boolean) => void
}) {
  const update = useUpdateCustomField(projectId)
  const remove = useDeleteCustomField(projectId)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(field.name)
  const [options, setOptions] = useState(field.options?.join(', ') ?? '')
  const [appliesTo, setAppliesTo] = useState<WpType[]>(
    (field.applies_to ?? []) as WpType[],
  )
  const [updateRetry, setUpdateRetry] = useState<UpdateInput | null>(null)
  const [deleteRetry, setDeleteRetry] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const normalizedOptions =
    field.field_type === 'dropdown' ? parseOptions(options) : undefined
  const optionsInvalid =
    field.field_type === 'dropdown' &&
    (normalizedOptions?.length === 0 ||
      (normalizedOptions?.length ?? 0) > 50 ||
      hasDuplicateOptions(options))
  const dirty =
    editing &&
    (name.trim() !== field.name ||
      options !== (field.options?.join(', ') ?? '') ||
      JSON.stringify(appliesTo) !==
        JSON.stringify((field.applies_to ?? []) as WpType[]))

  useEffect(() => {
    onDirtyChange(field.id, dirty)
  }, [dirty, field.id, onDirtyChange])
  useEffect(
    () => () => {
      onDirtyChange(field.id, false)
    },
    [field.id, onDirtyChange],
  )

  const resetDraft = () => {
    setName(field.name)
    setOptions(field.options?.join(', ') ?? '')
    setAppliesTo((field.applies_to ?? []) as WpType[])
    setEditing(false)
    setUpdateRetry(null)
    update.reset()
  }

  const changeDraft = (change: () => void) => {
    change()
    setUpdateRetry(null)
    setMessage('')
    update.reset()
  }

  const submitUpdate = (input: UpdateInput, successMessage = '필드 설정을 저장했습니다.') => {
    if (writeDisabled) return
    setMessage('')
    setUpdateRetry(input)
    update.mutate(input, {
      onSuccess: (saved) => {
        setName(saved.name)
        setOptions(saved.options?.join(', ') ?? '')
        setAppliesTo((saved.applies_to ?? []) as WpType[])
        setEditing(false)
        setUpdateRetry(null)
        setMessage(successMessage)
      },
    })
  }

  const submitDelete = (fieldId: string) => {
    if (writeDisabled) return
    setMessage('')
    setDeleteRetry(fieldId)
    remove.mutate(fieldId, {
      onSuccess: () => {
        setDeleteRetry(null)
        setMessage('필드를 삭제했습니다.')
      },
    })
  }

  const deleteError =
    remove.error instanceof ApiError && remove.error.status === 409
      ? '저장된 값이 남아 있어 삭제할 수 없습니다. 필드를 비활성화하면 값은 보존됩니다.'
      : '필드를 삭제하지 못했습니다.'

  return (
    <li className="min-w-0 border-b border-of-border last:border-b-0">
      {editing ? (
        <div className="min-w-0 space-y-3 bg-of-surface-2/45 px-3 py-3">
          <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-start">
            <Input
              value={name}
              maxLength={80}
              onChange={(event) =>
                changeDraft(() => setName(event.target.value))
              }
              aria-label={`${field.name} 이름 편집`}
              className="h-8 min-w-0 text-xs"
            />
            <div className="flex h-8 items-center rounded-of border border-of-border bg-of-surface px-2 text-xs text-of-muted">
              {FIELD_TYPE_LABELS[field.field_type]}
              <span className="sr-only"> 타입 변경 불가</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                disabled={
                  !name.trim() ||
                  optionsInvalid ||
                  !dirty ||
                  writeDisabled ||
                  update.isPending
                }
                onClick={() =>
                  submitUpdate({
                    fieldId: field.id,
                    name: name.trim(),
                    ...(field.field_type === 'dropdown'
                      ? { options: normalizedOptions }
                      : {}),
                    applies_to: appliesTo.length > 0 ? appliesTo : null,
                  })
                }
              >
                {update.isPending ? (
                  <LoaderCircle
                    size={14}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Save size={14} aria-hidden="true" />
                )}
                {update.isPending ? '저장 중' : '저장'}
              </Button>
              <Button size="sm" variant="outline" onClick={resetDraft}>
                취소
              </Button>
            </div>
          </div>
          {field.field_type === 'dropdown' ? (
            <div>
              <Input
                value={options}
                onChange={(event) =>
                  changeDraft(() => setOptions(event.target.value))
                }
                aria-label={`${field.name} 드롭다운 옵션 편집`}
                placeholder="옵션을 쉼표로 구분"
                className="h-8 min-w-0 text-xs"
              />
              {optionsInvalid ? (
                <p className="mt-1 text-[11px] text-of-danger">
                  서로 다른 옵션을 1~50개 입력하세요.
                </p>
              ) : (
                <p className="mt-1 text-[10px] text-of-muted">
                  제거한 옵션의 기존 작업 값도 기록에서 유지됩니다.
                </p>
              )}
            </div>
          ) : null}
          <TypeBindings
            selected={appliesTo}
            options={projectTypes}
            labelPrefix={`${field.name} 편집`}
            disabled={update.isPending}
            onChange={(next) =>
              changeDraft(() => setAppliesTo(next))
            }
          />
          {update.isError ? (
            <div
              role="alert"
              className="flex min-w-0 flex-col gap-2 text-xs text-of-danger sm:flex-row sm:items-center sm:justify-between"
            >
              <span>저장하지 못했습니다. 입력 내용은 유지됩니다.</span>
              {updateRetry ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={writeDisabled || update.isPending}
                  onClick={() => submitUpdate(updateRetry)}
                >
                  <RefreshCw size={13} aria-hidden="true" /> 같은 내용으로 다시
                  시도
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 py-3 sm:grid-cols-[3.5rem_minmax(0,1fr)_8rem_10rem_auto]">
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              aria-label={`${field.name} 위로`}
              disabled={!canEdit || reorderPending || index === 0}
              className="inline-flex h-7 w-7 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-2 hover:text-of-text disabled:opacity-25"
              onClick={() => onMove(index, -1)}
            >
              <ChevronUp size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={`${field.name} 아래로`}
              disabled={!canEdit || reorderPending || index === total - 1}
              className="inline-flex h-7 w-7 items-center justify-center rounded-of text-of-muted hover:bg-of-surface-2 hover:text-of-text disabled:opacity-25"
              onClick={() => onMove(index, 1)}
            >
              <ChevronDown size={14} aria-hidden="true" />
            </button>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-of border',
                field.is_active
                  ? 'border-of-border bg-of-surface-2 text-of-muted'
                  : 'border-of-border bg-of-surface-2/55 text-of-muted/65',
              )}
            >
              <Braces size={14} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span
                className={cn(
                  'block truncate text-[13px] font-medium',
                  !field.is_active && 'text-of-muted line-through',
                )}
              >
                {field.name}
              </span>
              <span className="mt-0.5 block truncate text-[10px] text-of-muted sm:hidden">
                {FIELD_TYPE_LABELS[field.field_type]} ·{' '}
                {field.applies_to
                  ? field.applies_to.map((key) => typeLabel(key)).join(' · ')
                  : '모든 타입'}
              </span>
            </span>
          </div>
          <Badge variant={field.is_active ? 'neutral' : 'outline'} className="hidden sm:inline-flex">
            {FIELD_TYPE_LABELS[field.field_type]}
          </Badge>
          <span className="hidden truncate text-[11px] text-of-muted sm:block">
            {field.applies_to
              ? field.applies_to.map((key) => typeLabel(key)).join(' · ')
              : '모든 작업 타입'}
          </span>
          <FieldActions
            field={field}
            canEdit={canEdit}
            writeDisabled={writeDisabled}
            onEdit={() => {
              setName(field.name)
              setOptions(field.options?.join(', ') ?? '')
              setAppliesTo((field.applies_to ?? []) as WpType[])
              setMessage('')
              setEditing(true)
            }}
            onToggle={() =>
              submitUpdate(
                { fieldId: field.id, is_active: !field.is_active },
                field.is_active
                  ? '필드를 비활성화했습니다. 기존 값은 유지됩니다.'
                  : '필드를 활성화했습니다.',
              )
            }
            onDelete={() => {
              if (
                confirmDestructive(
                  `'${field.name}' 필드를 삭제할까요?\n저장된 값이 있으면 삭제되지 않습니다.`,
                )
              ) {
                submitDelete(field.id)
              }
            }}
          />
        </div>
      )}
      {remove.isError ? (
        <div
          role="alert"
          className="flex min-w-0 flex-col gap-2 border-t border-of-danger/15 bg-of-danger-soft/35 px-3 py-2 text-xs text-of-danger sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{deleteError}</span>
          {deleteRetry ? (
            <Button
              size="sm"
              variant="outline"
              disabled={writeDisabled || remove.isPending}
              onClick={() => submitDelete(deleteRetry)}
            >
              <RefreshCw size={13} aria-hidden="true" /> 삭제 다시 시도
            </Button>
          ) : null}
        </div>
      ) : null}
      {message ? (
        <p
          role="status"
          className="border-t border-of-success/15 bg-of-success-soft/35 px-3 py-2 text-xs text-of-success"
        >
          {message}
        </p>
      ) : null}
    </li>
  )
}

export function FieldsPanel({
  projectId,
  isOwner,
  onDirtyChange,
}: {
  projectId: string
  isOwner: boolean
  onDirtyChange: (dirty: boolean) => void
}) {
  const project = useProject(projectId)
  const fields = useCustomFields(projectId, true)
  const permissions = usePermissionReport(projectId, !isOwner)
  const projectTypes = useProjectTypeOptions(projectId)
  const typeLabel = useTypeLabels(projectId)
  const create = useCreateCustomField(projectId)
  const reorder = useReorderCustomFields(projectId)
  const [name, setName] = useState('')
  const [type, setType] = useState<CustomFieldType>('text')
  const [options, setOptions] = useState('')
  const [appliesTo, setAppliesTo] = useState<WpType[]>([])
  const [createRetry, setCreateRetry] = useState<CreateInput | null>(null)
  const [reorderRetry, setReorderRetry] = useState<string[] | null>(null)
  const [message, setMessage] = useState('')
  const [dirtyRows, setDirtyRows] = useState<Set<string>>(new Set())
  const fieldPermission = permissions.data?.verbs.find(
    (verb) => verb.key === 'field.manage',
  )?.effective
  const canManage = isOwner || fieldPermission === 'always'
  const canConfigure = canManage && !project.data?.archived_at
  const parsedOptions = parseOptions(options)
  const optionsInvalid =
    type === 'dropdown' &&
    (parsedOptions.length === 0 ||
      parsedOptions.length > 50 ||
      hasDuplicateOptions(options))
  const createDirty =
    name.trim() !== '' ||
    type !== 'text' ||
    options.trim() !== '' ||
    appliesTo.length > 0

  const markRowDirty = useCallback((fieldId: string, dirty: boolean) => {
    setDirtyRows((current) => {
      const next = new Set(current)
      if (dirty) next.add(fieldId)
      else next.delete(fieldId)
      return next
    })
  }, [])

  useEffect(() => {
    onDirtyChange(createDirty || dirtyRows.size > 0)
  }, [createDirty, dirtyRows, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  const summary = useMemo(() => {
    const items = fields.data?.items ?? []
    return {
      active: items.filter((field) => field.is_active).length,
      inactive: items.filter((field) => !field.is_active).length,
      types: new Set(items.map((field) => field.field_type)).size,
    }
  }, [fields.data?.items])

  const updateCreateDraft = (change: () => void) => {
    change()
    setCreateRetry(null)
    setMessage('')
    create.reset()
  }

  const submitCreate = (input: CreateInput) => {
    if (!canWrite) return
    setMessage('')
    setCreateRetry(input)
    create.mutate(input, {
      onSuccess: () => {
        setName('')
        setType('text')
        setOptions('')
        setAppliesTo([])
        setCreateRetry(null)
        setMessage('필드를 추가했습니다.')
      },
    })
  }

  const submitReorder = (orderedIds: string[]) => {
    if (!canWrite) return
    setMessage('')
    setReorderRetry(orderedIds)
    reorder.mutate(orderedIds, {
      onSuccess: () => {
        setReorderRetry(null)
        setMessage('필드 순서를 저장했습니다.')
      },
    })
  }

  const move = (index: number, delta: -1 | 1) => {
    const items = fields.data?.items ?? []
    const target = index + delta
    if (target < 0 || target >= items.length) return
    const ids = items.map((field) => field.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    submitReorder(ids)
  }

  const queryStates = [
    {
      key: 'fields',
      label: '필드 정의',
      active: true,
      isPending: fields.isPending,
      isFetching: fields.isFetching,
      isError: fields.isError,
      hasData: Boolean(fields.data),
      error: fields.error,
      retry: () => fields.refetch(),
    },
    {
      key: 'project',
      label: '프로젝트 권한',
      active: true,
      isPending: project.isPending,
      isFetching: project.isFetching,
      isError: project.isError,
      hasData: Boolean(project.data),
      error: project.error,
      retry: () => project.refetch(),
    },
    {
      key: 'permissions',
      label: '위임 권한',
      active: !isOwner,
      isPending: permissions.isPending,
      isFetching: permissions.isFetching,
      isError: permissions.isError,
      hasData: Boolean(permissions.data),
      error: permissions.error,
      retry: () => permissions.refetch(),
    },
    {
      key: 'project-types',
      label: '프로젝트 타입',
      active: true,
      isPending: projectTypes.isPending,
      isFetching: projectTypes.isFetching,
      isError: projectTypes.isError,
      hasData: Boolean(projectTypes.data),
      error: projectTypes.error,
      retry: () => projectTypes.refetch(),
    },
  ].filter((query) => query.active)
  const initialPending = queryStates.some(
    (query) => query.isPending && !query.hasData,
  )
  if (initialPending) {
    return (
      <section aria-label="사용자 정의 필드 설정" className="min-w-0">
        <ListSkeleton rows={6} />
      </section>
    )
  }
  const initialFailure = queryStates.find(
    (query) => query.isError && !query.hasData,
  )
  if (initialFailure) {
    return (
      <ErrorState
        error={initialFailure.error}
        onRetry={() => void initialFailure.retry()}
      />
    )
  }
  const staleQueries = queryStates.filter((query) => query.isError)
  const isFetching = queryStates.some((query) => query.isFetching)
  const writeBlocked = staleQueries.length > 0
  const canWrite = canConfigure && !writeBlocked

  return (
    <section
      aria-label="사용자 정의 필드 설정"
      aria-busy={isFetching}
      className="min-w-0 overflow-hidden rounded-of border border-of-border bg-of-surface"
    >
      <header className="flex min-w-0 flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase text-of-muted">
            Project fields
          </p>
          <h2 className="mt-1 flex items-center gap-2 text-sm font-semibold">
            <ListChecks size={15} aria-hidden="true" /> 사용자 정의 속성
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">
            작업에 필요한 속성과 적용 타입을 구성합니다. 타입은 생성 후
            고정되며, 비활성화하거나 옵션을 바꿔도 기존 값은 유지됩니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={isFetching}
            onClick={() => {
              for (const query of queryStates) void query.retry()
            }}
          >
            <RefreshCw
              size={13}
              aria-hidden="true"
              className={isFetching ? 'animate-spin' : undefined}
            />
            필드 설정 새로고침
          </Button>
          <Badge
            variant={canWrite ? 'accent' : 'outline'}
            className="self-start whitespace-nowrap"
          >
            {canWrite ? (
              `${fields.data?.total ?? 0}개 관리 중`
            ) : canConfigure && writeBlocked ? (
              <>
                <LockKeyhole size={12} aria-hidden="true" /> 최신 상태 확인 필요
              </>
            ) : (
              <>
                <LockKeyhole size={12} aria-hidden="true" /> 읽기 전용
              </>
            )}
          </Badge>
        </div>
      </header>

      {staleQueries.length > 0 ? (
        <div className="space-y-2 border-t border-of-border px-3 py-3 sm:px-4">
          {staleQueries.map((query) => (
            <div
              key={query.key}
              role="alert"
              className="flex min-w-0 flex-col gap-2 border border-of-warning/35 bg-of-warning/10 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-start gap-2">
                <CircleAlert
                  size={14}
                  className="mt-0.5 shrink-0 text-of-warning"
                  aria-hidden="true"
                />
                <span className="text-xs leading-5 text-of-muted">
                  최신 {query.label} 정보를 불러오지 못했습니다. 마지막 성공 데이터를 유지하며 다시 확인할 때까지 서버 변경은 차단됩니다.
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full shrink-0 sm:w-auto"
                disabled={query.isFetching}
                onClick={() => void query.retry()}
              >
                <RefreshCw size={13} aria-hidden="true" /> {query.label} 다시 시도
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      <div
        role="list"
        aria-label="사용자 정의 필드 요약"
        className="grid grid-cols-3 gap-px border-y border-of-border bg-of-border"
      >
        <div role="listitem" className="min-w-0 bg-of-surface-2/55 px-3 py-2.5">
          <p className="text-[10px] text-of-muted">활성</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">{summary.active}</p>
        </div>
        <div role="listitem" className="min-w-0 bg-of-surface-2/55 px-3 py-2.5">
          <p className="text-[10px] text-of-muted">비활성</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">{summary.inactive}</p>
        </div>
        <div role="listitem" className="min-w-0 bg-of-surface-2/55 px-3 py-2.5">
          <p className="text-[10px] text-of-muted">사용 타입</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">{summary.types}</p>
        </div>
      </div>

      {project.data?.archived_at ? (
        <p className="border-b border-of-warning/40 bg-of-warning/5 px-4 py-2 text-xs leading-5 text-of-muted">
          보관된 프로젝트의 필드와 기존 값은 조회할 수 있지만 변경할 수 없습니다.
        </p>
      ) : null}

      {canConfigure ? (
        <div className="space-y-3 border-b border-of-border bg-of-surface-2/35 px-3 py-3">
          <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-start">
            <Input
              value={name}
              maxLength={80}
              onChange={(event) =>
                updateCreateDraft(() => setName(event.target.value))
              }
              placeholder="새 필드 이름"
              aria-label="새 필드 이름"
              className="h-8 min-w-0 text-xs"
            />
            <Select
              aria-label="새 필드 타입"
              className="h-8 min-w-0 text-xs"
              value={type}
              onChange={(event) =>
                updateCreateDraft(() => {
                  setType(event.target.value as CustomFieldType)
                  if (event.target.value !== 'dropdown') setOptions('')
                })
              }
            >
              {(Object.keys(FIELD_TYPE_LABELS) as CustomFieldType[]).map(
                (fieldType) => (
                  <option key={fieldType} value={fieldType}>
                    {FIELD_TYPE_LABELS[fieldType]}
                  </option>
                ),
              )}
            </Select>
            <Button
              size="sm"
              disabled={
                !name.trim() || optionsInvalid || !canWrite || create.isPending
              }
              onClick={() =>
                submitCreate({
                  name: name.trim(),
                  field_type: type,
                  ...(type === 'dropdown' ? { options: parsedOptions } : {}),
                  ...(appliesTo.length > 0
                    ? { applies_to: appliesTo }
                    : {}),
                })
              }
            >
              {create.isPending ? (
                <LoaderCircle
                  size={14}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Plus size={14} aria-hidden="true" />
              )}
              {create.isPending ? '추가 중' : '필드 추가'}
            </Button>
          </div>
          {type === 'dropdown' ? (
            <div>
              <Input
                value={options}
                onChange={(event) =>
                  updateCreateDraft(() => setOptions(event.target.value))
                }
                placeholder="옵션을 쉼표로 구분"
                aria-label="드롭다운 옵션"
                className="h-8 min-w-0 text-xs"
              />
              {optionsInvalid && options.trim() ? (
                <p className="mt-1 text-[11px] text-of-danger">
                  서로 다른 옵션을 1~50개 입력하세요.
                </p>
              ) : null}
            </div>
          ) : null}
          <TypeBindings
            selected={appliesTo}
            options={projectTypes.options}
            labelPrefix="새 필드"
            disabled={create.isPending}
            onChange={(next) =>
              updateCreateDraft(() => setAppliesTo(next))
            }
          />
          {create.isError ? (
            <div
              role="alert"
              className="flex min-w-0 flex-col gap-2 text-xs text-of-danger sm:flex-row sm:items-center sm:justify-between"
            >
              <span>추가하지 못했습니다. 입력 내용은 유지됩니다.</span>
              {createRetry ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canWrite || create.isPending}
                  onClick={() => submitCreate(createRetry)}
                >
                  <RefreshCw size={13} aria-hidden="true" /> 같은 내용으로 다시
                  시도
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="border-b border-of-border bg-of-surface-2/45 px-4 py-2 text-xs text-of-muted">
          커스텀 필드 구성 권한이 없어 변경 작업은 숨겨졌습니다.
        </p>
      )}

      {reorder.isError ? (
        <div
          role="alert"
          className="flex min-w-0 flex-col gap-2 border-b border-of-danger/15 bg-of-danger-soft/35 px-3 py-2 text-xs text-of-danger sm:flex-row sm:items-center sm:justify-between"
        >
          <span>순서를 저장하지 못했습니다. 현재 목록을 유지합니다.</span>
          {reorderRetry ? (
            <Button
              size="sm"
              variant="outline"
              disabled={!canWrite || reorder.isPending}
              onClick={() => submitReorder(reorderRetry)}
            >
              <RefreshCw size={13} aria-hidden="true" /> 같은 순서로 다시 시도
            </Button>
          ) : null}
        </div>
      ) : null}

      {(fields.data?.total ?? 0) > 0 ? (
        <>
          <div className="hidden grid-cols-[3.5rem_minmax(0,1fr)_8rem_10rem_2rem] gap-2 border-b border-of-border bg-of-surface-2/30 px-3 py-2 text-[10px] font-medium uppercase text-of-muted sm:grid">
            <span>순서</span>
            <span>필드</span>
            <span>타입</span>
            <span>적용 범위</span>
            <span className="sr-only">작업</span>
          </div>
          <ul aria-label="사용자 정의 필드 목록" className="min-w-0">
            {fields.data?.items.map((field, index) => (
              <FieldRow
                key={field.id}
                field={field}
                index={index}
                total={fields.data?.items.length ?? 0}
                projectId={projectId}
                canEdit={canConfigure}
                writeDisabled={!canWrite}
                projectTypes={projectTypes.options}
                typeLabel={typeLabel}
                reorderPending={reorder.isPending}
                onMove={move}
                onDirtyChange={markRowDirty}
              />
            ))}
          </ul>
        </>
      ) : (
        <EmptyState
          title="사용자 정의 필드가 없습니다"
          hint={
            canConfigure
              ? '이름과 입력 타입을 선택해 첫 프로젝트 필드를 만드세요.'
              : '아직 이 프로젝트에 정의된 추가 속성이 없습니다.'
          }
          className="min-h-[190px] py-8"
        />
      )}

      {message ? (
        <p
          role="status"
          className="border-t border-of-success/15 bg-of-success-soft/35 px-3 py-2 text-xs text-of-success"
        >
          <CheckCircle2 size={13} className="mr-1 inline" aria-hidden="true" />
          {message}
        </p>
      ) : null}
    </section>
  )
}
