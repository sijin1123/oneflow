import {
  Archive,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ListOrdered,
  Pencil,
  Save,
  Trash2,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { InlineActionMenu } from '@/components/ui/action-menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useMembers } from '@/features/members/api'
import {
  PRIORITY_LABELS,
  WP_PRIORITIES,
  WP_STATUSES,
  WP_TYPES,
  type WpPriority,
} from '@/features/work-packages/types'
import { useStatusLabels } from '@/features/work-packages/useStatusLabels'
import { useTypeLabels } from '@/features/work-packages/useTypeLabels'
import { formatDateTime } from '@/lib/datetime'
import { confirmDestructive } from '@/lib/guards'

import {
  type AutomationRule,
  useAutomationRuleRuns,
  useAutomationRules,
  useCreateAutomationRule,
  useDeleteAutomationRule,
  useReorderAutomationRules,
  useSetAutomationRuleActive,
} from './api'

type TriggerType = 'status_changed_to' | 'type_changed_to' | 'priority_changed_to'
type ConditionField = '' | 'status' | 'type' | 'priority'
type RulePatch = {
  id: string
  is_active?: boolean
  trigger_value?: string
  action_value?: string
  name?: string
}

const CONDITION_FIELD_LABELS: Record<string, string> = {
  status: '상태',
  type: '타입',
  priority: '우선순위',
}

/* Automation rules (PLAN §3 Phase 3 자동화): owners define status→priority rules
   the backend applies inside the work-package PATCH transaction. */
export function AutomationManager({ projectId, isOwner }: { projectId: string; isOwner: boolean }) {
  const { data } = useAutomationRules(projectId)
  const create = useCreateAutomationRule(projectId)
  const setActive = useSetAutomationRuleActive(projectId)
  const reorder = useReorderAutomationRules(projectId)
  const del = useDeleteAutomationRule(projectId)
  const statusLabel = useStatusLabels(projectId)
  const typeLabel = useTypeLabels(projectId)
  const members = useMembers(projectId)
  const runs = useAutomationRuleRuns(projectId)

  const memberName = (id: string | null) =>
    members.data?.items.find((m) => m.user_id === id)?.display_name ?? '알 수 없음'

  const triggerOptions = (triggerType: string): readonly (readonly [string, string])[] => {
    if (triggerType === 'type_changed_to') return WP_TYPES.map((t) => [t, typeLabel(t)] as const)
    if (triggerType === 'priority_changed_to') {
      return WP_PRIORITIES.map((p) => [p, PRIORITY_LABELS[p]] as const)
    }
    return WP_STATUSES.map((s) => [s, statusLabel(s)] as const)
  }

  const triggerText = (rule: AutomationRule): string => {
    if (rule.trigger_type === 'type_changed_to') {
      return `타입이 '${typeLabel(rule.trigger_value)}'(으)로 바뀌면`
    }
    if (rule.trigger_type === 'priority_changed_to') {
      const p = PRIORITY_LABELS[rule.trigger_value as WpPriority] ?? rule.trigger_value
      return `우선순위가 '${p}'(으)로 바뀌면`
    }
    return `상태가 '${statusLabel(rule.trigger_value)}'(으)로 바뀌면`
  }

  const conditionValueLabel = (field: string, value: string): string => {
    if (field === 'status') return statusLabel(value)
    if (field === 'type') return typeLabel(value)
    return PRIORITY_LABELS[value as WpPriority] ?? value
  }
  const conditionText = (rule: AutomationRule): string => {
    if (!rule.condition_field || !rule.condition_value) return ''
    const f = CONDITION_FIELD_LABELS[rule.condition_field] ?? rule.condition_field
    return ` (그리고 ${f}이(가) '${conditionValueLabel(rule.condition_field, rule.condition_value)}'일 때)`
  }

  const ruleText = (rule: AutomationRule): string => {
    if (rule.action_type === 'set_assignee') {
      return `${triggerText(rule)}${conditionText(rule)} → 담당자를 '${memberName(rule.action_value)}'(으)로 지정`
    }
    const priority = PRIORITY_LABELS[rule.action_value as WpPriority] ?? rule.action_value
    return `${triggerText(rule)}${conditionText(rule)} → 우선순위를 '${priority}'(으)로 설정`
  }

  const [triggerType, setTriggerType] = useState<TriggerType>('status_changed_to')
  const [triggerValue, setTriggerValue] = useState<string>('in_review')
  const [actionType, setActionType] = useState<'set_priority' | 'set_assignee'>('set_priority')
  const [actionValue, setActionValue] = useState<string>('high')
  // Optional AND secondary condition (Pass 81) — '' = none.
  const [conditionField, setConditionField] = useState<ConditionField>('')
  const [conditionValue, setConditionValue] = useState<string>('')
  const conditionValueOptions =
    conditionField === 'type'
      ? WP_TYPES.map((t) => [t, typeLabel(t)] as const)
      : conditionField === 'priority'
        ? WP_PRIORITIES.map((p) => [p, PRIORITY_LABELS[p]] as const)
        : WP_STATUSES.map((s) => [s, statusLabel(s)] as const)

  // Reorder by swapping a rule with its neighbour and sending the full order
  // (the /order contract rewrites 0..n-1). Topmost rule wins its field.
  const move = (index: number, delta: number) => {
    const items = data?.items ?? []
    const target = index + delta
    if (target < 0 || target >= items.length) return
    const ids = items.map((r) => r.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    reorder.mutate(ids)
  }

  const add = () => {
    if (!actionValue) return
    const target =
      actionType === 'set_priority'
        ? PRIORITY_LABELS[actionValue as WpPriority]
        : memberName(actionValue)
    const triggerLabel =
      triggerType === 'type_changed_to'
        ? typeLabel(triggerValue)
        : triggerType === 'priority_changed_to'
          ? (PRIORITY_LABELS[triggerValue as WpPriority] ?? triggerValue)
          : statusLabel(triggerValue)
    const hasCondition = conditionField !== '' && conditionValue !== ''
    create.mutate(
      {
        name: `${triggerLabel} → ${target}`,
        trigger_type: triggerType,
        trigger_value: triggerValue,
        action_type: actionType,
        action_value: actionValue,
        condition_field: hasCondition ? conditionField : null,
        condition_value: hasCondition ? conditionValue : null,
        is_active: true,
      },
      {
        onSuccess: () => {
          setConditionField('')
          setConditionValue('')
        },
      },
    )
  }

  return (
    <section
      aria-label="자동화 규칙"
      className="space-y-3 rounded-of border border-of-border bg-of-surface p-4"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-of bg-of-accent-soft text-of-accent">
          <Bot size={16} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">자동화 규칙</h3>
            <Badge variant="outline">{data?.total ?? 0}개 규칙</Badge>
            <Badge variant={isOwner ? 'accent' : 'outline'}>
              {isOwner ? '소유자 편집 가능' : '읽기 전용'}
            </Badge>
          </div>
          <p className="mt-1 text-xs leading-5 text-of-muted">
            상태 변경 시 우선순위를 자동으로 설정합니다{isOwner ? '' : ' (소유자만 편집 가능)'}. 위에 있는
            규칙이 먼저 적용됩니다(조건 있는 규칙이 조건 없는 규칙보다 우선).
          </p>
        </div>
      </div>

      {data && data.total > 0 ? (
        <ul className="grid gap-2">
          {data.items.map((rule, index) => (
            <AutomationRuleRow
              key={rule.id}
              rule={rule}
              ruleText={ruleText(rule)}
              members={members.data?.items ?? []}
              triggerOptions={triggerOptions(rule.trigger_type)}
              isOwner={isOwner}
              isFirst={index === 0}
              isLast={index === data.items.length - 1}
              reorderPending={reorder.isPending}
              onUpdate={(patch) => setActive.mutate(patch)}
              onMove={(delta) => move(index, delta)}
              onDelete={() => {
                if (confirmDestructive(`'${rule.name}' 자동화 규칙을 삭제할까요?`)) {
                  del.mutate(rule.id)
                }
              }}
            />
          ))}
        </ul>
      ) : (
        <p className="rounded-of border border-dashed border-of-border bg-of-surface-2 px-3 py-4 text-xs text-of-muted">
          {data ? '규칙이 없습니다.' : '규칙을 불러오는 중입니다.'}
        </p>
      )}

      {isOwner ? (
        <div className="rounded-of border border-of-border bg-of-surface-2 p-3">
          <div className="mb-2 flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-of bg-of-surface text-of-muted">
              <ListOrdered size={14} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold">새 규칙 만들기</p>
              <p className="text-[11px] text-of-muted">
                트리거, 선택 조건, 액션을 한 줄로 조합합니다.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label="트리거 종류"
              className="h-7 w-40 text-xs"
              value={triggerType}
              onChange={(e) => {
                const next = e.target.value as TriggerType
                setTriggerType(next)
                // Reset the value to the new trigger's vocabulary (create-only:
                // editing an existing rule never changes its trigger type).
                setTriggerValue(
                  next === 'type_changed_to'
                    ? 'bug'
                    : next === 'priority_changed_to'
                      ? 'high'
                      : 'in_review',
                )
              }}
            >
              <option value="status_changed_to">상태가 다음으로 변경</option>
              <option value="type_changed_to">타입이 다음으로 변경</option>
              <option value="priority_changed_to">우선순위가 다음으로 변경</option>
            </Select>
            <Select
              aria-label="트리거 값"
              className="h-7 w-28 text-xs"
              value={triggerValue}
              onChange={(e) => setTriggerValue(e.target.value)}
            >
              {triggerOptions(triggerType).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <span className="text-xs text-of-muted">→</span>
            <Select
              aria-label="액션 종류"
              className="h-7 w-28 text-xs"
              value={actionType}
              onChange={(e) => {
                const next = e.target.value as 'set_priority' | 'set_assignee'
                setActionType(next)
                setActionValue(next === 'set_priority' ? 'high' : '')
              }}
            >
              <option value="set_priority">우선순위 설정</option>
              <option value="set_assignee">담당자 지정</option>
            </Select>
            {actionType === 'set_priority' ? (
            <Select
              aria-label="설정 우선순위"
              className="h-7 w-24 text-xs"
              value={actionValue}
              onChange={(e) => setActionValue(e.target.value)}
            >
              {WP_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </Select>
          ) : (
            <Select
              aria-label="지정할 담당자"
              className="h-7 w-32 text-xs"
              value={actionValue}
              onChange={(e) => setActionValue(e.target.value)}
            >
              <option value="">멤버 선택…</option>
              {(members.data?.items ?? []).map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.display_name}
                </option>
              ))}
            </Select>
          )}
          <span className="text-xs text-of-muted">그리고</span>
          <Select
            aria-label="보조 조건 필드"
            className="h-7 w-28 text-xs"
            value={conditionField}
            onChange={(e) => {
              const next = e.target.value as ConditionField
              setConditionField(next)
              // Reset the value to the first option of the new field's vocabulary.
              setConditionValue(
                next === '' ? '' : next === 'type' ? 'bug' : next === 'priority' ? 'high' : 'in_review',
              )
            }}
          >
            <option value="">조건 없음</option>
            <option value="status">상태가</option>
            <option value="type">타입이</option>
            <option value="priority">우선순위가</option>
          </Select>
          {conditionField !== '' ? (
            <Select
              aria-label="보조 조건 값"
              className="h-7 w-28 text-xs"
              value={conditionValue}
              onChange={(e) => setConditionValue(e.target.value)}
            >
              {conditionValueOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          ) : null}
            <Button size="sm" disabled={create.isPending} onClick={add}>
              규칙 추가
            </Button>
          </div>
        </div>
      ) : null}

      <details className="pt-1">
        <summary className="cursor-pointer text-xs font-medium text-of-muted">
          실행 로그{runs.data ? ` (${runs.data.total})` : ''}
        </summary>
        {runs.data && runs.data.total > 0 ? (
          <ul className="mt-1.5 space-y-1">
            {runs.data.items.map((run) => (
              <li
                key={run.id}
                className="rounded-of border border-of-border px-2 py-1.5 text-[11px] text-of-muted"
              >
                <span className="font-medium text-of-fg">{run.rule_name}</span> · '
                {run.work_package_subject}'의 {run.field === 'assignee_id' ? '담당자' : '우선순위'}{' '}
                {run.field === 'assignee_id'
                  ? `${memberName(run.old_value)} → ${memberName(run.new_value)}`
                  : `${run.old_value ?? '없음'} → ${run.new_value ?? '없음'}`}
                <span className="ml-1.5">{formatDateTime(run.created_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-xs text-of-muted">아직 실행된 규칙이 없습니다.</p>
        )}
      </details>
    </section>
  )
}

function AutomationRuleRow({
  rule,
  ruleText,
  members,
  triggerOptions,
  isOwner,
  isFirst,
  isLast,
  reorderPending,
  onUpdate,
  onMove,
  onDelete,
}: {
  rule: AutomationRule
  ruleText: string
  members: Array<{ user_id: string; display_name: string }>
  triggerOptions: readonly (readonly [string, string])[]
  isOwner: boolean
  isFirst: boolean
  isLast: boolean
  reorderPending: boolean
  onUpdate: (patch: RulePatch) => void
  onMove: (delta: -1 | 1) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(rule.name)
  const [triggerValue, setTriggerValue] = useState(rule.trigger_value)
  const [actionValue, setActionValue] = useState(rule.action_value)

  useEffect(() => setName(rule.name), [rule.name])
  useEffect(() => setTriggerValue(rule.trigger_value), [rule.trigger_value])
  useEffect(() => setActionValue(rule.action_value), [rule.action_value])

  const firedText =
    rule.fired_count > 0
      ? `발화 ${rule.fired_count}회 · 마지막 ${formatDateTime(rule.last_fired_at ?? '')}`
      : '아직 발화 없음'

  if (editing) {
    return (
      <li className="rounded-of border border-of-border px-2 py-2 text-xs">
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <Input
              value={name}
              aria-label={`${rule.name} 규칙 이름 편집`}
              onChange={(event) => setName(event.target.value)}
              className="h-7 min-w-0 flex-1 text-xs"
            />
            <Select
              aria-label={`${rule.name} 트리거 값 편집`}
              className="h-7 min-w-0 text-xs lg:w-32"
              value={triggerValue}
              onChange={(event) => setTriggerValue(event.target.value)}
            >
              {triggerOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            {rule.action_type === 'set_priority' ? (
              <Select
                aria-label={`${rule.name} 우선순위 값 편집`}
                className="h-7 min-w-0 text-xs lg:w-28"
                value={actionValue}
                onChange={(event) => setActionValue(event.target.value)}
              >
                {WP_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </Select>
            ) : (
              <Select
                aria-label={`${rule.name} 담당자 값 편집`}
                className="h-7 min-w-0 text-xs lg:w-36"
                value={actionValue}
                onChange={(event) => setActionValue(event.target.value)}
              >
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.display_name}
                  </option>
                ))}
              </Select>
            )}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                disabled={!name.trim() || !actionValue}
                onClick={() => {
                  const trimmed = name.trim()
                  if (trimmed && actionValue) {
                    onUpdate({ id: rule.id, name: trimmed, trigger_value: triggerValue, action_value: actionValue })
                  }
                  setEditing(false)
                }}
              >
                <Save size={14} />
                저장
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setName(rule.name)
                  setTriggerValue(rule.trigger_value)
                  setActionValue(rule.action_value)
                  setEditing(false)
                }}
              >
                취소
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-of-muted">{ruleText}</p>
        </div>
      </li>
    )
  }

  return (
    <li className="rounded-of border border-of-border px-2 py-2 text-xs">
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className={`min-w-0 truncate font-medium ${rule.is_active ? '' : 'text-of-muted line-through'}`}>
              {rule.name}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] ${
                rule.is_active ? 'bg-of-accent-soft text-of-accent' : 'bg-of-surface-2 text-of-muted'
              }`}
            >
              {rule.is_active ? '사용 중' : '중지'}
            </span>
            <span className="rounded-full bg-of-surface-2 px-2 py-0.5 text-[10px] text-of-muted">
              우선순위 {rule.position + 1}
            </span>
          </div>
          <p className={`mt-1 leading-5 ${rule.is_active ? 'text-of-text' : 'text-of-muted line-through'}`}>
            {ruleText}
          </p>
          <p className="mt-1 text-[11px] text-of-muted">{firedText}</p>
        </div>
        <InlineActionMenu
          label={`${rule.name} 자동화 규칙 작업`}
          menuLabel={`${rule.name} 자동화 규칙 작업 메뉴`}
          note={isOwner ? undefined : '읽기 전용'}
          items={
            isOwner
              ? [
                  {
                    label: '편집',
                    ariaLabel: `${rule.name} 규칙 편집`,
                    icon: <Pencil size={14} />,
                    onSelect: () => setEditing(true),
                  },
                  {
                    label: rule.is_active ? '사용 중지' : '사용 시작',
                    ariaLabel: `${rule.name} 규칙 ${rule.is_active ? '사용 중지' : '사용 시작'}`,
                    icon: rule.is_active ? <Archive size={14} /> : <CheckCircle2 size={14} />,
                    onSelect: () => onUpdate({ id: rule.id, is_active: !rule.is_active }),
                  },
                  {
                    label: '위로 이동',
                    ariaLabel: `${rule.name} 위로`,
                    icon: <ChevronUp size={14} />,
                    disabled: isFirst || reorderPending,
                    onSelect: () => onMove(-1),
                  },
                  {
                    label: '아래로 이동',
                    ariaLabel: `${rule.name} 아래로`,
                    icon: <ChevronDown size={14} />,
                    disabled: isLast || reorderPending,
                    onSelect: () => onMove(1),
                  },
                  {
                    label: '삭제',
                    ariaLabel: `${rule.name} 규칙 삭제`,
                    icon: <Trash2 size={14} />,
                    tone: 'danger',
                    onSelect: onDelete,
                  },
                ]
              : []
          }
        />
      </div>
    </li>
  )
}
