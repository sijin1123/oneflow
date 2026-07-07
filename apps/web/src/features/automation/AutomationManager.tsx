import { Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
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

import { useMembers } from '@/features/members/api'

import {
  type AutomationRule,
  useAutomationRuleRuns,
  useAutomationRules,
  useCreateAutomationRule,
  useDeleteAutomationRule,
  useSetAutomationRuleActive,
} from './api'

/* Automation rules (PLAN §3 Phase 3 자동화): owners define status→priority rules
   the backend applies inside the work-package PATCH transaction. */
export function AutomationManager({ projectId, isOwner }: { projectId: string; isOwner: boolean }) {
  const { data } = useAutomationRules(projectId)
  const create = useCreateAutomationRule(projectId)
  const setActive = useSetAutomationRuleActive(projectId)
  const del = useDeleteAutomationRule(projectId)
  const statusLabel = useStatusLabels(projectId)
  const typeLabel = useTypeLabels(projectId)
  const members = useMembers(projectId)
  const runs = useAutomationRuleRuns(projectId)

  const memberName = (id: string | null) =>
    members.data?.items.find((m) => m.user_id === id)?.display_name ?? '알 수 없음'

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

  const ruleText = (rule: AutomationRule): string => {
    if (rule.action_type === 'set_assignee') {
      return `${triggerText(rule)} → 담당자를 '${memberName(rule.action_value)}'(으)로 지정`
    }
    const priority = PRIORITY_LABELS[rule.action_value as WpPriority] ?? rule.action_value
    return `${triggerText(rule)} → 우선순위를 '${priority}'(으)로 설정`
  }

  type TriggerType = 'status_changed_to' | 'type_changed_to' | 'priority_changed_to'
  const [triggerType, setTriggerType] = useState<TriggerType>('status_changed_to')
  const [triggerValue, setTriggerValue] = useState<string>('in_review')
  const [actionType, setActionType] = useState<'set_priority' | 'set_assignee'>('set_priority')
  const [actionValue, setActionValue] = useState<string>('high')

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
    create.mutate({
      name: `${triggerLabel} → ${target}`,
      trigger_type: triggerType,
      trigger_value: triggerValue,
      action_type: actionType,
      action_value: actionValue,
      is_active: true,
    })
  }

  return (
    <div className="mb-4 space-y-2 rounded-of border border-of-border bg-of-surface p-3">
      <p className="text-xs font-medium">자동화 규칙</p>
      <p className="text-xs text-of-muted">
        상태 변경 시 우선순위를 자동으로 설정합니다{isOwner ? '' : ' (소유자만 편집 가능)'}.
      </p>

      {data && data.total > 0 ? (
        <ul className="space-y-1">
          {data.items.map((rule) => (
            <li
              key={rule.id}
              className="flex items-center gap-2 rounded-of border border-of-border px-2 py-1.5 text-xs"
            >
              <span className={`min-w-0 flex-1 ${rule.is_active ? '' : 'text-of-muted line-through'}`}>
                {ruleText(rule)}
                <span className="ml-1.5 text-[10px] text-of-muted">
                  {rule.fired_count > 0
                    ? `발화 ${rule.fired_count}회 · 마지막 ${formatDateTime(rule.last_fired_at ?? '')}`
                    : '아직 발화 없음'}
                </span>
              </span>
              {isOwner ? (
                <>
                  <Select
                    aria-label={`${rule.name} 트리거 상태`}
                    className="h-6 w-24 shrink-0 text-[11px]"
                    value={rule.trigger_value}
                    onChange={(e) => setActive.mutate({ id: rule.id, trigger_value: e.target.value })}
                  >
                    {WP_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {statusLabel(s)}
                      </option>
                    ))}
                  </Select>
                  {rule.action_type === 'set_priority' ? (
                    <Select
                      aria-label={`${rule.name} 우선순위 값`}
                      className="h-6 w-20 shrink-0 text-[11px]"
                      value={rule.action_value}
                      onChange={(e) =>
                        setActive.mutate({ id: rule.id, action_value: e.target.value })
                      }
                    >
                      {WP_PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {PRIORITY_LABELS[p]}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Select
                      aria-label={`${rule.name} 담당자 값`}
                      className="h-6 w-28 shrink-0 text-[11px]"
                      value={rule.action_value}
                      onChange={(e) =>
                        setActive.mutate({ id: rule.id, action_value: e.target.value })
                      }
                    >
                      {(members.data?.items ?? []).map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.display_name}
                        </option>
                      ))}
                    </Select>
                  )}
                </>
              ) : null}
              {isOwner ? (
                <>
                  <label className="flex shrink-0 items-center gap-1 text-[11px] text-of-muted">
                    <input
                      type="checkbox"
                      checked={rule.is_active}
                      onChange={(e) =>
                        setActive.mutate({ id: rule.id, is_active: e.target.checked })
                      }
                      aria-label={`${ruleText(rule)} 사용`}
                    />
                    사용
                  </label>
                  <button
                    type="button"
                    aria-label="규칙 삭제"
                    className="shrink-0 rounded-of p-1 text-of-muted hover:bg-of-surface-2 hover:text-of-danger"
                    onClick={() => del.mutate(rule.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </>
              ) : (
                <span className="shrink-0 text-[11px] text-of-muted">
                  {rule.is_active ? '사용 중' : '중지'}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-of-muted">규칙이 없습니다.</p>
      )}

      {isOwner ? (
        <div className="flex flex-wrap items-center gap-2 pt-1">
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
                next === 'type_changed_to' ? 'bug' : next === 'priority_changed_to' ? 'high' : 'in_review',
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
            {(triggerType === 'type_changed_to'
              ? WP_TYPES.map((t) => [t, typeLabel(t)] as const)
              : triggerType === 'priority_changed_to'
                ? WP_PRIORITIES.map((p) => [p, PRIORITY_LABELS[p]] as const)
                : WP_STATUSES.map((st) => [st, statusLabel(st)] as const)
            ).map(([value, label]) => (
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
          <Button size="sm" disabled={create.isPending} onClick={add}>
            규칙 추가
          </Button>
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
    </div>
  )
}
