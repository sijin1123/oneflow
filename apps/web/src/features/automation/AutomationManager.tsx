import {
  Activity,
  Archive,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDot,
  ListOrdered,
  LoaderCircle,
  Lock,
  LockKeyhole,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import {
  InlineActionMenu,
  type InlineActionMenuItem,
} from '@/components/ui/action-menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useMembers, usePermissionReport } from '@/features/members/api'
import { useProjectStatuses } from '@/features/project-statuses/api'
import { useProjectTypeOptions } from '@/features/project-types/useProjectTypeOptions'
import { useProject } from '@/features/projects/api'
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  WP_PRIORITIES,
  WP_STATUSES,
  type WpPriority,
} from '@/features/work-packages/types'
import { formatDateTime } from '@/lib/datetime'
import { confirmDestructive } from '@/lib/guards'
import { cn } from '@/lib/utils'

import {
  type AutomationRule,
  type AutomationRuleInput,
  type AutomationRuleUpdate,
  useAutomationRuleRuns,
  useAutomationRules,
  useCreateAutomationRule,
  useDeleteAutomationRule,
  useReorderAutomationRules,
  useUpdateAutomationRule,
} from './api'

type TriggerType = 'status_changed_to' | 'type_changed_to' | 'priority_changed_to'
type ActionType = 'set_priority' | 'set_assignee'
type ConditionField = '' | 'status' | 'type' | 'priority'
type ValueOption = readonly [string, string]

const fieldSubject = (field: string) => {
  if (field === 'type') return '타입이'
  if (field === 'priority') return '우선순위가'
  return '상태가'
}

const triggerTypeLabel = (triggerType: string) => {
  if (triggerType === 'type_changed_to') return '타입 변경'
  if (triggerType === 'priority_changed_to') return '우선순위 변경'
  return '상태 변경'
}

const actionTypeLabel = (actionType: string) =>
  actionType === 'set_assignee' ? '담당자 지정' : '우선순위 설정'

function AutomationRuleRow({
  projectId,
  rule,
  index,
  total,
  canEdit,
  members,
  triggerOptions,
  conditionOptions,
  ruleText,
  reorderPending,
  onMove,
  onDirtyChange,
}: {
  projectId: string
  rule: AutomationRule
  index: number
  total: number
  canEdit: boolean
  members: Array<{ user_id: string; display_name: string; role: string }>
  triggerOptions: ValueOption[]
  conditionOptions: (field: ConditionField) => ValueOption[]
  ruleText: string
  reorderPending: boolean
  onMove: (index: number, delta: -1 | 1) => void
  onDirtyChange: (ruleId: string, dirty: boolean) => void
}) {
  const update = useUpdateAutomationRule(projectId)
  const remove = useDeleteAutomationRule(projectId)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(rule.name)
  const [triggerValue, setTriggerValue] = useState(rule.trigger_value)
  const [actionValue, setActionValue] = useState(rule.action_value)
  const [conditionField, setConditionField] = useState<ConditionField>(
    (rule.condition_field ?? '') as ConditionField,
  )
  const [conditionValue, setConditionValue] = useState(rule.condition_value ?? '')
  const [retryPatch, setRetryPatch] = useState<AutomationRuleUpdate | null>(null)
  const [retryDelete, setRetryDelete] = useState(false)
  const [failureLabel, setFailureLabel] = useState('')
  const [message, setMessage] = useState('')
  const writableMembers = members.filter((member) => member.role !== 'viewer')
  const dirty =
    editing &&
    (name.trim() !== rule.name ||
      triggerValue !== rule.trigger_value ||
      actionValue !== rule.action_value ||
      conditionField !== (rule.condition_field ?? '') ||
      conditionValue !== (rule.condition_value ?? ''))

  useEffect(() => setName(rule.name), [rule.name])
  useEffect(() => setTriggerValue(rule.trigger_value), [rule.trigger_value])
  useEffect(() => setActionValue(rule.action_value), [rule.action_value])
  useEffect(
    () => setConditionField((rule.condition_field ?? '') as ConditionField),
    [rule.condition_field],
  )
  useEffect(() => setConditionValue(rule.condition_value ?? ''), [rule.condition_value])
  useEffect(() => {
    onDirtyChange(rule.id, dirty)
  }, [dirty, onDirtyChange, rule.id])
  useEffect(
    () => () => {
      onDirtyChange(rule.id, false)
    },
    [onDirtyChange, rule.id],
  )

  const resetDraft = () => {
    setName(rule.name)
    setTriggerValue(rule.trigger_value)
    setActionValue(rule.action_value)
    setConditionField((rule.condition_field ?? '') as ConditionField)
    setConditionValue(rule.condition_value ?? '')
    setEditing(false)
    setRetryPatch(null)
    setFailureLabel('')
    update.reset()
  }

  const changeDraft = (change: () => void) => {
    change()
    setRetryPatch(null)
    setFailureLabel('')
    setMessage('')
    update.reset()
  }

  const submitPatch = (
    patch: AutomationRuleUpdate,
    successMessage: string,
    closeEditor = false,
  ) => {
    if (!canEdit) return
    setMessage('')
    setFailureLabel(successMessage.replace('했습니다.', '하지 못했습니다.'))
    setRetryPatch(patch)
    update.mutate(patch, {
      onSuccess: (saved) => {
        setName(saved.name)
        setTriggerValue(saved.trigger_value)
        setActionValue(saved.action_value)
        setConditionField((saved.condition_field ?? '') as ConditionField)
        setConditionValue(saved.condition_value ?? '')
        if (closeEditor) setEditing(false)
        setRetryPatch(null)
        setFailureLabel('')
        setMessage(successMessage)
      },
    })
  }

  const submitDelete = () => {
    if (!canEdit) return
    setMessage('')
    setRetryDelete(true)
    remove.mutate(rule.id, {
      onSuccess: () => {
        setRetryDelete(false)
      },
    })
  }

  const firedText =
    rule.fired_count > 0
      ? `${rule.fired_count}회 실행 · 마지막 ${formatDateTime(rule.last_fired_at ?? '')}`
      : '아직 실행되지 않음'

  const actionItems: InlineActionMenuItem[] = canEdit
    ? [
        {
          label: '편집',
          ariaLabel: `${rule.name} 규칙 편집`,
          icon: <Pencil size={14} />,
          onSelect: () => {
            setMessage('')
            setEditing(true)
          },
        },
        {
          label: rule.is_active ? '사용 중지' : '사용 시작',
          ariaLabel: `${rule.name} 규칙 ${rule.is_active ? '사용 중지' : '사용 시작'}`,
          icon: rule.is_active ? <Archive size={14} /> : <CheckCircle2 size={14} />,
          onSelect: () =>
            submitPatch(
              { id: rule.id, is_active: !rule.is_active },
              rule.is_active ? '규칙을 중지했습니다.' : '규칙을 시작했습니다.',
            ),
        },
        {
          label: '삭제',
          ariaLabel: `${rule.name} 규칙 삭제`,
          icon: <Trash2 size={14} />,
          tone: 'danger',
          onSelect: () => {
            if (confirmDestructive(`'${rule.name}' 자동화 규칙을 삭제할까요?`)) {
              submitDelete()
            }
          },
        },
      ]
    : [
        {
          label: '쓰기 권한 없음',
          ariaLabel: `${rule.name} 쓰기 권한 없음`,
          icon: <Lock size={14} />,
          disabled: true,
          onSelect: () => undefined,
        },
      ]

  return (
    <li
      className={cn(
        'min-w-0 border-b border-of-border px-3 py-3 last:border-b-0',
        !rule.is_active && 'bg-of-surface-2/35',
      )}
    >
      {editing ? (
        <div className="space-y-3">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={name}
              maxLength={80}
              aria-label={`${rule.name} 규칙 이름 편집`}
              onChange={(event) => changeDraft(() => setName(event.target.value))}
              className="h-8 min-w-0 flex-1 text-xs"
            />
            <Badge variant="outline" className="self-start whitespace-nowrap sm:self-auto">
              {triggerTypeLabel(rule.trigger_type)} · {actionTypeLabel(rule.action_type)}
            </Badge>
          </div>
          <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1fr)]">
            <label className="min-w-0">
              <span className="mb-1 block text-[10px] font-medium text-of-muted">WHEN</span>
              <Select
                aria-label={`${rule.name} 트리거 값 편집`}
                className="h-8 min-w-0 w-full text-xs"
                value={triggerValue}
                onChange={(event) =>
                  changeDraft(() => setTriggerValue(event.target.value))
                }
              >
                {triggerOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>
            <div className="grid min-w-0 grid-cols-2 gap-2">
              <label className="min-w-0">
                <span className="mb-1 block text-[10px] font-medium text-of-muted">AND</span>
                <Select
                  aria-label={`${rule.name} 보조 조건 필드 편집`}
                  className="h-8 min-w-0 w-full text-xs"
                  value={conditionField}
                  onChange={(event) => {
                    const next = event.target.value as ConditionField
                    const nextOptions = conditionOptions(next)
                    changeDraft(() => {
                      setConditionField(next)
                      setConditionValue(nextOptions[0]?.[0] ?? '')
                    })
                  }}
                >
                  <option value="">조건 없음</option>
                  <option value="status">상태</option>
                  <option value="type">타입</option>
                  <option value="priority">우선순위</option>
                </Select>
              </label>
              <label className="min-w-0">
                <span className="mb-1 block text-[10px] font-medium text-of-muted">VALUE</span>
                <Select
                  aria-label={`${rule.name} 보조 조건 값 편집`}
                  className="h-8 min-w-0 w-full text-xs"
                  value={conditionValue}
                  disabled={conditionField === ''}
                  onChange={(event) =>
                    changeDraft(() => setConditionValue(event.target.value))
                  }
                >
                  {conditionField === '' ? <option value="">해당 없음</option> : null}
                  {conditionOptions(conditionField).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            <label className="min-w-0">
              <span className="mb-1 block text-[10px] font-medium text-of-muted">THEN</span>
              <Select
                aria-label={
                  rule.action_type === 'set_assignee'
                    ? `${rule.name} 담당자 값 편집`
                    : `${rule.name} 우선순위 값 편집`
                }
                className="h-8 min-w-0 w-full text-xs"
                value={actionValue}
                onChange={(event) =>
                  changeDraft(() => setActionValue(event.target.value))
                }
              >
                {rule.action_type === 'set_assignee'
                  ? writableMembers.map((member) => (
                      <option key={member.user_id} value={member.user_id}>
                        {member.display_name}
                      </option>
                    ))
                  : WP_PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>
                        {PRIORITY_LABELS[priority]}
                      </option>
                    ))}
              </Select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={
                !canEdit ||
                update.isPending ||
                !name.trim() ||
                !triggerValue ||
                !actionValue ||
                (conditionField !== '' && !conditionValue)
              }
              onClick={() =>
                submitPatch(
                  {
                    id: rule.id,
                    name: name.trim(),
                    trigger_value: triggerValue,
                    action_value: actionValue,
                    condition_field: conditionField || null,
                    condition_value: conditionField ? conditionValue : null,
                  },
                  '규칙을 저장했습니다.',
                  true,
                )
              }
            >
              {update.isPending ? (
                <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <Save size={14} aria-hidden="true" />
              )}
              {update.isPending ? '저장 중' : '저장'}
            </Button>
            <Button size="sm" variant="outline" disabled={update.isPending} onClick={resetDraft}>
              취소
            </Button>
            <p className="min-w-0 text-[11px] text-of-muted">
              트리거와 액션 종류는 생성 후 고정되며 값과 AND 조건은 변경할 수 있습니다.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 items-start gap-2">
          <div className="flex shrink-0 flex-col items-center gap-0.5">
            <Button
              size="icon"
              variant="ghost"
              title="위로 이동"
              aria-label={`${rule.name} 위로`}
              disabled={!canEdit || reorderPending || index === 0}
              onClick={() => onMove(index, -1)}
              className="h-6 w-6"
            >
              <ChevronUp size={13} aria-hidden="true" />
            </Button>
            <span className="text-[10px] font-semibold tabular-nums text-of-muted">
              {index + 1}
            </span>
            <Button
              size="icon"
              variant="ghost"
              title="아래로 이동"
              aria-label={`${rule.name} 아래로`}
              disabled={!canEdit || reorderPending || index === total - 1}
              onClick={() => onMove(index, 1)}
              className="h-6 w-6"
            >
              <ChevronDown size={13} aria-hidden="true" />
            </Button>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  'min-w-0 truncate text-xs font-semibold',
                  !rule.is_active && 'text-of-muted line-through',
                )}
              >
                {rule.name}
              </span>
              <Badge variant={rule.is_active ? 'accent' : 'outline'}>
                {rule.is_active ? '사용 중' : '중지'}
              </Badge>
              <Badge variant="outline">{triggerTypeLabel(rule.trigger_type)}</Badge>
            </div>
            <p
              className={cn(
                'mt-1 break-words text-xs leading-5 text-of-text',
                !rule.is_active && 'text-of-muted',
              )}
            >
              {ruleText}
            </p>
            <p className="mt-1 flex items-center gap-1 text-[11px] text-of-muted">
              <Activity size={12} aria-hidden="true" /> {firedText}
            </p>
          </div>
          <InlineActionMenu
            label={`${rule.name} 자동화 규칙 작업`}
            menuLabel={`${rule.name} 자동화 규칙 작업 메뉴`}
            note={canEdit ? undefined : '읽기 전용'}
            items={actionItems}
          />
        </div>
      )}

      {update.isError ? (
        <div
          role="alert"
          className="mt-2 flex min-w-0 flex-col gap-2 rounded-of bg-of-danger-soft/40 px-2 py-2 text-xs text-of-danger sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{failureLabel || '규칙을 변경하지 못했습니다.'} 입력 내용은 유지됩니다.</span>
          {retryPatch ? (
            <Button
              size="sm"
              variant="outline"
              disabled={!canEdit || update.isPending}
              onClick={() =>
                submitPatch(
                  retryPatch,
                  retryPatch.is_active === undefined
                    ? '규칙을 저장했습니다.'
                    : retryPatch.is_active
                      ? '규칙을 시작했습니다.'
                      : '규칙을 중지했습니다.',
                  editing,
                )
              }
            >
              <RefreshCw size={13} aria-hidden="true" /> 같은 내용으로 다시 시도
            </Button>
          ) : null}
        </div>
      ) : null}
      {remove.isError ? (
        <div
          role="alert"
          className="mt-2 flex min-w-0 flex-col gap-2 rounded-of bg-of-danger-soft/40 px-2 py-2 text-xs text-of-danger sm:flex-row sm:items-center sm:justify-between"
        >
          <span>규칙을 삭제하지 못했습니다.</span>
          {retryDelete ? (
            <Button
              size="sm"
              variant="outline"
              disabled={!canEdit || remove.isPending}
              onClick={submitDelete}
            >
              <RefreshCw size={13} aria-hidden="true" /> 삭제 다시 시도
            </Button>
          ) : null}
        </div>
      ) : null}
      {message ? (
        <p role="status" className="mt-2 text-[11px] text-of-success">
          <CheckCircle2 size={12} className="mr-1 inline" aria-hidden="true" />
          {message}
        </p>
      ) : null}
    </li>
  )
}

export function AutomationManager({
  projectId,
  isOwner,
  onDirtyChange,
}: {
  projectId: string
  isOwner: boolean
  onDirtyChange: (dirty: boolean) => void
}) {
  const project = useProject(projectId)
  const rules = useAutomationRules(projectId)
  const runs = useAutomationRuleRuns(projectId)
  const permissions = usePermissionReport(projectId, !isOwner)
  const members = useMembers(projectId)
  const projectStatuses = useProjectStatuses(projectId)
  const projectTypes = useProjectTypeOptions(projectId)
  const create = useCreateAutomationRule(projectId)
  const reorder = useReorderAutomationRules(projectId)
  const [composerOpen, setComposerOpen] = useState(false)
  const [name, setName] = useState('')
  const [triggerType, setTriggerType] = useState<TriggerType>('status_changed_to')
  const [triggerValue, setTriggerValue] = useState('in_review')
  const [actionType, setActionType] = useState<ActionType>('set_priority')
  const [actionValue, setActionValue] = useState('high')
  const [conditionField, setConditionField] = useState<ConditionField>('')
  const [conditionValue, setConditionValue] = useState('')
  const [createRetry, setCreateRetry] = useState<AutomationRuleInput | null>(null)
  const [reorderRetry, setReorderRetry] = useState<string[] | null>(null)
  const [message, setMessage] = useState('')
  const [dirtyRows, setDirtyRows] = useState<Set<string>>(new Set())
  const automationPermission = permissions.data?.verbs.find(
    (verb) => verb.key === 'automation.manage',
  )?.effective
  const canManage = isOwner || automationPermission === 'always'
  const requiredQueries = [
    { key: 'rules', label: '자동화 규칙', query: rules },
    { key: 'project', label: '프로젝트 정보', query: project },
    { key: 'members', label: '프로젝트 멤버', query: members },
    { key: 'statuses', label: '워크 아이템 상태', query: projectStatuses },
    { key: 'types', label: '프로젝트 타입', query: projectTypes },
    ...(!isOwner
      ? [{ key: 'permissions', label: '자동화 권한', query: permissions }]
      : []),
  ]
  const initialFailure = requiredQueries.find(
    ({ query }) => query.isError && query.data === undefined,
  )
  const staleQueries = requiredQueries.filter(
    ({ query }) => query.isError && query.data !== undefined,
  )
  const writesFresh = staleQueries.length === 0
  const canConfigure = canManage && !project.data?.archived_at
  const canEdit = canConfigure && writesFresh
  const refreshingAll =
    requiredQueries.some(({ query }) => query.isFetching) || runs.isFetching
  const writableMembers = (members.data?.items ?? []).filter(
    (member) => member.role !== 'viewer',
  )
  const statusNames = useMemo(
    () => new Map(projectStatuses.data?.items.map((status) => [status.key, status.name]) ?? []),
    [projectStatuses.data?.items],
  )
  const typeNames = useMemo(
    () => new Map(projectTypes.options.map((type) => [type.key, type.label])),
    [projectTypes.options],
  )
  const statusLabel = useCallback(
    (key: string) => statusNames.get(key) ?? STATUS_LABELS[key as keyof typeof STATUS_LABELS] ?? key,
    [statusNames],
  )
  const typeLabel = useCallback((key: string) => typeNames.get(key) ?? key, [typeNames])

  const statusOptions = useMemo<ValueOption[]>(
    () => WP_STATUSES.map((status) => [status, statusLabel(status)] as const),
    [statusLabel],
  )
  const typeOptions = useMemo<ValueOption[]>(
    () => projectTypes.options.map((type) => [type.key, type.label] as const),
    [projectTypes.options],
  )
  const priorityOptions = useMemo<ValueOption[]>(
    () =>
      WP_PRIORITIES.map(
        (priority) => [priority, PRIORITY_LABELS[priority]] as const,
      ),
    [],
  )

  const optionsForTrigger = useCallback(
    (value: string): ValueOption[] => {
      if (value === 'type_changed_to') return typeOptions
      if (value === 'priority_changed_to') return priorityOptions
      return statusOptions
    },
    [priorityOptions, statusOptions, typeOptions],
  )
  const optionsForCondition = useCallback(
    (field: ConditionField): ValueOption[] => {
      if (field === 'type') return typeOptions
      if (field === 'priority') return priorityOptions
      if (field === 'status') return statusOptions
      return []
    },
    [priorityOptions, statusOptions, typeOptions],
  )
  const memberName = useCallback(
    (id: string | null) =>
      members.data?.items.find((member) => member.user_id === id)?.display_name ??
      (id ? '알 수 없음' : '미배정'),
    [members.data?.items],
  )
  const valueLabel = useCallback(
    (field: string, value: string) => {
      if (field === 'status') return statusLabel(value)
      if (field === 'type') return typeLabel(value)
      return PRIORITY_LABELS[value as WpPriority] ?? value
    },
    [statusLabel, typeLabel],
  )
  const ruleText = useCallback(
    (rule: AutomationRule) => {
      const triggerKey = rule.trigger_type.replace('_changed_to', '')
      const trigger = `${fieldSubject(triggerKey)} '${valueLabel(
        triggerKey,
        rule.trigger_value,
      )}'으로 바뀌면`
      const condition =
        rule.condition_field && rule.condition_value
          ? ` 그리고 ${fieldSubject(rule.condition_field)} '${valueLabel(
              rule.condition_field,
              rule.condition_value,
            )}'일 때`
          : ''
      const action =
        rule.action_type === 'set_assignee'
          ? `담당자를 '${memberName(rule.action_value)}'로 지정`
          : `우선순위를 '${valueLabel('priority', rule.action_value)}'로 설정`
      return `${trigger}${condition} → ${action}`
    },
    [memberName, valueLabel],
  )
  const createDirty =
    name.trim() !== '' ||
    triggerType !== 'status_changed_to' ||
    triggerValue !== 'in_review' ||
    actionType !== 'set_priority' ||
    actionValue !== 'high' ||
    conditionField !== '' ||
    conditionValue !== ''

  const markRowDirty = useCallback((ruleId: string, dirty: boolean) => {
    setDirtyRows((current) => {
      const next = new Set(current)
      if (dirty) next.add(ruleId)
      else next.delete(ruleId)
      return next
    })
  }, [])

  useEffect(() => {
    onDirtyChange(createDirty || dirtyRows.size > 0)
  }, [createDirty, dirtyRows, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  const summary = useMemo(() => {
    const items = rules.data?.items ?? []
    return {
      active: items.filter((rule) => rule.is_active).length,
      inactive: items.filter((rule) => !rule.is_active).length,
      fired: items.reduce((total, rule) => total + rule.fired_count, 0),
    }
  }, [rules.data?.items])

  const resetComposer = () => {
    setName('')
    setTriggerType('status_changed_to')
    setTriggerValue('in_review')
    setActionType('set_priority')
    setActionValue('high')
    setConditionField('')
    setConditionValue('')
    setCreateRetry(null)
    setComposerOpen(false)
    create.reset()
  }

  const changeComposer = (change: () => void) => {
    change()
    setCreateRetry(null)
    setMessage('')
    create.reset()
  }

  const submitCreate = (input: AutomationRuleInput) => {
    if (!canEdit) return
    setMessage('')
    setCreateRetry(input)
    create.mutate(input, {
      onSuccess: () => {
        resetComposer()
        setMessage('자동화 규칙을 추가했습니다.')
      },
    })
  }

  const submitReorder = (orderedIds: string[]) => {
    if (!canEdit) return
    setMessage('')
    setReorderRetry(orderedIds)
    reorder.mutate(orderedIds, {
      onSuccess: () => {
        setReorderRetry(null)
        setMessage('규칙 우선순위를 저장했습니다.')
      },
    })
  }

  const move = (index: number, delta: -1 | 1) => {
    const items = rules.data?.items ?? []
    const target = index + delta
    if (target < 0 || target >= items.length) return
    const ids = items.map((rule) => rule.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    submitReorder(ids)
  }

  if (requiredQueries.some(({ query }) => query.isPending && query.data === undefined)) {
    return (
      <section aria-label="자동화 규칙" className="min-w-0">
        <ListSkeleton rows={6} />
      </section>
    )
  }
  if (initialFailure) {
    return (
      <ErrorState
        error={initialFailure.query.error}
        onRetry={() => void initialFailure.query.refetch()}
      />
    )
  }

  return (
    <section
      aria-label="자동화 규칙"
      className="min-w-0 overflow-hidden rounded-of border border-of-border bg-of-surface"
    >
      <header className="flex min-w-0 flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase text-of-muted">
            Project automation
          </p>
          <h2 className="mt-1 flex items-center gap-2 text-sm font-semibold">
            <Bot size={15} aria-hidden="true" /> 규칙과 실행 흐름
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-of-muted">
            조건이 더 구체적인 규칙을 먼저 평가하고, 같은 구체성에서는 위 규칙이
            먼저 적용됩니다.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            size="icon"
            variant="outline"
            title="자동화 새로 고침"
            aria-label="자동화 새로 고침"
            disabled={refreshingAll}
            onClick={() => {
              void Promise.all([
                rules.refetch(),
                project.refetch(),
                members.refetch(),
                projectStatuses.refetch(),
                projectTypes.refetch(),
                ...(!isOwner ? [permissions.refetch()] : []),
                runs.refetch(),
              ])
            }}
          >
            <RefreshCw
              size={14}
              className={refreshingAll ? 'animate-spin' : undefined}
              aria-hidden="true"
            />
          </Button>
          <Badge variant={canConfigure ? 'accent' : 'outline'} className="whitespace-nowrap">
            {canConfigure ? (
              `${rules.data?.total ?? 0}개 관리 중`
            ) : (
              <>
                <LockKeyhole size={12} aria-hidden="true" /> 읽기 전용
              </>
            )}
          </Badge>
          {canConfigure ? (
            <Button
              size="sm"
              variant={composerOpen ? 'outline' : 'default'}
              disabled={!canEdit && !composerOpen}
              onClick={() => {
                if (composerOpen) resetComposer()
                else setComposerOpen(true)
              }}
            >
              {composerOpen ? null : <Plus size={14} aria-hidden="true" />}
              {composerOpen ? '작성 닫기' : '새 규칙'}
            </Button>
          ) : null}
        </div>
      </header>

      {staleQueries.length > 0 ? (
        <div className="space-y-px border-t border-of-danger/15 bg-of-danger/15">
          {staleQueries.map(({ key, label, query }) => (
            <div
              key={key}
              role="alert"
              aria-label={`${label} 갱신 실패`}
              className="flex min-w-0 flex-col gap-2 bg-of-danger-soft/45 px-3 py-2 text-xs text-of-danger sm:flex-row sm:items-center sm:justify-between"
            >
              <span>
                {label} 정보를 갱신하지 못했습니다. 마지막 성공 데이터를 표시하며 관련 변경은
                복구 전까지 잠깁니다.
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
              >
                <RefreshCw
                  size={13}
                  className={query.isFetching ? 'animate-spin' : undefined}
                  aria-hidden="true"
                />
                {label} 다시 시도
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      <div
        role="list"
        aria-label="자동화 규칙 요약"
        className="grid grid-cols-3 gap-px border-y border-of-border bg-of-border"
      >
        <div role="listitem" className="min-w-0 bg-of-surface-2/55 px-3 py-2.5">
          <p className="text-[10px] text-of-muted">활성</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">{summary.active}</p>
        </div>
        <div role="listitem" className="min-w-0 bg-of-surface-2/55 px-3 py-2.5">
          <p className="text-[10px] text-of-muted">중지</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">{summary.inactive}</p>
        </div>
        <div role="listitem" className="min-w-0 bg-of-surface-2/55 px-3 py-2.5">
          <p className="text-[10px] text-of-muted">누적 실행</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">{summary.fired}</p>
        </div>
      </div>

      {project.data?.archived_at ? (
        <p className="border-b border-of-warning/40 bg-of-warning/5 px-4 py-2 text-xs leading-5 text-of-muted">
          보관된 프로젝트의 규칙과 실행 이력은 조회할 수 있지만 변경할 수 없습니다.
        </p>
      ) : null}

      {composerOpen && canConfigure ? (
        <div
          aria-label="새 자동화 규칙"
          className="space-y-3 border-b border-of-border bg-of-surface-2/35 px-3 py-3"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-of bg-of-surface text-of-muted">
              <ListOrdered size={14} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold">새 규칙 조합</p>
              <p className="text-[11px] text-of-muted">
                이름, 트리거, 선택 AND 조건과 실행 액션을 저장합니다.
              </p>
            </div>
          </div>
          <Input
            value={name}
            maxLength={80}
            onChange={(event) => changeComposer(() => setName(event.target.value))}
            placeholder="규칙 이름"
            aria-label="새 규칙 이름"
            className="h-8 min-w-0 text-xs"
          />
          <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1fr)]">
            <div className="grid min-w-0 grid-cols-2 gap-2">
              <label className="min-w-0">
                <span className="mb-1 block text-[10px] font-medium text-of-muted">WHEN</span>
                <Select
                  aria-label="트리거 종류"
                  className="h-8 min-w-0 w-full text-xs"
                  value={triggerType}
                  onChange={(event) => {
                    const next = event.target.value as TriggerType
                    const nextOptions = optionsForTrigger(next)
                    changeComposer(() => {
                      setTriggerType(next)
                      setTriggerValue(nextOptions[0]?.[0] ?? '')
                    })
                  }}
                >
                  <option value="status_changed_to">상태 변경</option>
                  <option value="type_changed_to">타입 변경</option>
                  <option value="priority_changed_to">우선순위 변경</option>
                </Select>
              </label>
              <label className="min-w-0">
                <span className="mb-1 block text-[10px] font-medium text-of-muted">VALUE</span>
                <Select
                  aria-label="트리거 값"
                  className="h-8 min-w-0 w-full text-xs"
                  value={triggerValue}
                  onChange={(event) =>
                    changeComposer(() => setTriggerValue(event.target.value))
                  }
                >
                  {optionsForTrigger(triggerType).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            <div className="grid min-w-0 grid-cols-2 gap-2">
              <label className="min-w-0">
                <span className="mb-1 block text-[10px] font-medium text-of-muted">AND</span>
                <Select
                  aria-label="보조 조건 필드"
                  className="h-8 min-w-0 w-full text-xs"
                  value={conditionField}
                  onChange={(event) => {
                    const next = event.target.value as ConditionField
                    const nextOptions = optionsForCondition(next)
                    changeComposer(() => {
                      setConditionField(next)
                      setConditionValue(nextOptions[0]?.[0] ?? '')
                    })
                  }}
                >
                  <option value="">조건 없음</option>
                  <option value="status">상태</option>
                  <option value="type">타입</option>
                  <option value="priority">우선순위</option>
                </Select>
              </label>
              <label className="min-w-0">
                <span className="mb-1 block text-[10px] font-medium text-of-muted">VALUE</span>
                <Select
                  aria-label="보조 조건 값"
                  className="h-8 min-w-0 w-full text-xs"
                  value={conditionValue}
                  disabled={conditionField === ''}
                  onChange={(event) =>
                    changeComposer(() => setConditionValue(event.target.value))
                  }
                >
                  {conditionField === '' ? <option value="">해당 없음</option> : null}
                  {optionsForCondition(conditionField).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            <div className="grid min-w-0 grid-cols-2 gap-2">
              <label className="min-w-0">
                <span className="mb-1 block text-[10px] font-medium text-of-muted">THEN</span>
                <Select
                  aria-label="액션 종류"
                  className="h-8 min-w-0 w-full text-xs"
                  value={actionType}
                  onChange={(event) => {
                    const next = event.target.value as ActionType
                    changeComposer(() => {
                      setActionType(next)
                      setActionValue(
                        next === 'set_priority'
                          ? 'high'
                          : (writableMembers[0]?.user_id ?? ''),
                      )
                    })
                  }}
                >
                  <option value="set_priority">우선순위 설정</option>
                  <option value="set_assignee">담당자 지정</option>
                </Select>
              </label>
              <label className="min-w-0">
                <span className="mb-1 block text-[10px] font-medium text-of-muted">VALUE</span>
                <Select
                  aria-label={actionType === 'set_assignee' ? '지정할 담당자' : '설정 우선순위'}
                  className="h-8 min-w-0 w-full text-xs"
                  value={actionValue}
                  onChange={(event) =>
                    changeComposer(() => setActionValue(event.target.value))
                  }
                >
                  {actionType === 'set_assignee'
                    ? writableMembers.map((member) => (
                        <option key={member.user_id} value={member.user_id}>
                          {member.display_name}
                        </option>
                      ))
                    : priorityOptions.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                </Select>
              </label>
            </div>
          </div>
          {actionType === 'set_assignee' && writableMembers.length === 0 ? (
            <p className="text-[11px] text-of-danger">
              담당자로 지정할 수 있는 소유자 또는 멤버가 없습니다.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={
                !canEdit ||
                create.isPending ||
                !name.trim() ||
                !triggerValue ||
                !actionValue ||
                (conditionField !== '' && !conditionValue)
              }
              onClick={() =>
                submitCreate({
                  name: name.trim(),
                  trigger_type: triggerType,
                  trigger_value: triggerValue,
                  action_type: actionType,
                  action_value: actionValue,
                  condition_field: conditionField || null,
                  condition_value: conditionField ? conditionValue : null,
                  is_active: true,
                })
              }
            >
              {create.isPending ? (
                <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <Plus size={14} aria-hidden="true" />
              )}
              {create.isPending ? '추가 중' : '규칙 추가'}
            </Button>
            <Button size="sm" variant="outline" disabled={create.isPending} onClick={resetComposer}>
              취소
            </Button>
          </div>
          {create.isError ? (
            <div
              role="alert"
              className="flex min-w-0 flex-col gap-2 text-xs text-of-danger sm:flex-row sm:items-center sm:justify-between"
            >
              <span>규칙을 추가하지 못했습니다. 입력 내용은 유지됩니다.</span>
              {createRetry ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canEdit || create.isPending}
                  onClick={() => submitCreate(createRetry)}
                >
                  <RefreshCw size={13} aria-hidden="true" /> 같은 내용으로 다시 시도
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {!canConfigure ? (
        <p className="border-b border-of-border bg-of-surface-2/45 px-4 py-2 text-xs text-of-muted">
          자동화 구성 권한이 없어 변경 작업은 숨겨졌습니다.
        </p>
      ) : !writesFresh ? (
        <p className="border-b border-of-warning/30 bg-of-warning/5 px-4 py-2 text-xs text-of-muted">
          최신 권한과 옵션을 확인할 때까지 서버 변경은 잠깁니다. 작성 중인 입력은
          유지됩니다.
        </p>
      ) : null}

      {reorder.isError ? (
        <div
          role="alert"
          className="flex min-w-0 flex-col gap-2 border-b border-of-danger/15 bg-of-danger-soft/35 px-3 py-2 text-xs text-of-danger sm:flex-row sm:items-center sm:justify-between"
        >
          <span>규칙 우선순위를 저장하지 못했습니다. 현재 목록을 유지합니다.</span>
          {reorderRetry ? (
            <Button
              size="sm"
              variant="outline"
              disabled={!canEdit || reorder.isPending}
              onClick={() => submitReorder(reorderRetry)}
            >
              <RefreshCw size={13} aria-hidden="true" /> 같은 순서로 다시 시도
            </Button>
          ) : null}
        </div>
      ) : null}

      {(rules.data?.total ?? 0) > 0 ? (
        <>
          <div className="hidden grid-cols-[3rem_minmax(0,1fr)_6rem_2rem] gap-2 border-b border-of-border bg-of-surface-2/30 px-3 py-2 text-[10px] font-medium uppercase text-of-muted sm:grid">
            <span>우선</span>
            <span>규칙</span>
            <span>상태</span>
            <span className="sr-only">작업</span>
          </div>
          <ul aria-label="자동화 규칙 목록" className="min-w-0">
            {rules.data?.items.map((rule, index) => (
              <AutomationRuleRow
                key={rule.id}
                projectId={projectId}
                rule={rule}
                index={index}
                total={rules.data?.items.length ?? 0}
                canEdit={canEdit}
                members={members.data?.items ?? []}
                triggerOptions={optionsForTrigger(rule.trigger_type)}
                conditionOptions={optionsForCondition}
                ruleText={ruleText(rule)}
                reorderPending={reorder.isPending}
                onMove={move}
                onDirtyChange={markRowDirty}
              />
            ))}
          </ul>
        </>
      ) : (
        <EmptyState
          title="자동화 규칙이 없습니다"
          hint={
            canEdit
              ? '새 규칙을 열어 트리거와 액션을 연결하세요.'
              : '아직 이 프로젝트에 정의된 자동화 규칙이 없습니다.'
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

      <details className="group border-t border-of-border">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-3 text-xs font-semibold hover:bg-of-surface-2/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-of-accent">
          <Activity size={14} aria-hidden="true" />
          실행 이력
          <Badge variant="outline">{runs.data?.total ?? 0}</Badge>
          <ChevronDown
            size={13}
            className="ml-auto transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="border-t border-of-border bg-of-surface-2/20 px-3 py-3">
          {runs.isPending && runs.data === undefined ? (
            <p className="flex items-center gap-2 text-xs text-of-muted">
              <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />
              실행 이력을 불러오는 중입니다.
            </p>
          ) : runs.isError && runs.data === undefined ? (
            <div
              role="alert"
              className="flex min-w-0 flex-col gap-2 text-xs text-of-danger sm:flex-row sm:items-center sm:justify-between"
            >
              <span>실행 이력을 불러오지 못했습니다.</span>
              <Button
                size="sm"
                variant="outline"
                disabled={runs.isFetching}
                onClick={() => void runs.refetch()}
              >
                <RefreshCw size={13} aria-hidden="true" /> 다시 시도
              </Button>
            </div>
          ) : (
            <>
              {runs.isError ? (
                <div
                  role="alert"
                  aria-label="자동화 실행 이력 갱신 실패"
                  className="mb-2 flex min-w-0 flex-col gap-2 rounded-of bg-of-danger-soft/45 px-2.5 py-2 text-xs text-of-danger sm:flex-row sm:items-center sm:justify-between"
                >
                  <span>실행 이력을 갱신하지 못했습니다. 마지막 성공 이력을 표시합니다.</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={runs.isFetching}
                    onClick={() => void runs.refetch()}
                  >
                    <RefreshCw
                      size={13}
                      className={runs.isFetching ? 'animate-spin' : undefined}
                      aria-hidden="true"
                    />
                    실행 이력 다시 시도
                  </Button>
                </div>
              ) : null}
              {runs.data && runs.data.total > 0 ? (
                <ul aria-label="자동화 실행 이력" className="space-y-1.5">
                  {runs.data.items.map((run) => (
                    <li
                      key={run.id}
                      className="flex min-w-0 flex-col gap-1 rounded-of border border-of-border bg-of-surface px-2.5 py-2 text-[11px] sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-of-fg">{run.rule_name}</p>
                        <p className="mt-0.5 break-words text-of-muted">
                          {run.work_package_id ? (
                            <Link
                              to={`/projects/${projectId}/work-packages/${run.work_package_id}`}
                              className="text-of-accent hover:underline"
                            >
                              {run.work_package_subject}
                            </Link>
                          ) : (
                            run.work_package_subject
                          )}{' '}
                          · {run.field === 'assignee_id' ? '담당자' : '우선순위'}{' '}
                          {run.field === 'assignee_id'
                            ? `${memberName(run.old_value)} → ${memberName(run.new_value)}`
                            : `${valueLabel('priority', run.old_value ?? 'none')} → ${valueLabel(
                                'priority',
                                run.new_value ?? 'none',
                              )}`}
                        </p>
                      </div>
                      <span className="shrink-0 text-of-muted">
                        {formatDateTime(run.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-center gap-2 text-xs text-of-muted">
                  <CircleDot size={13} aria-hidden="true" /> 아직 실행된 규칙이 없습니다.
                </p>
              )}
            </>
          )}
        </div>
      </details>
    </section>
  )
}
