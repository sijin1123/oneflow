import { Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import {
  PRIORITY_LABELS,
  WP_PRIORITIES,
  WP_STATUSES,
  type WpPriority,
  type WpStatus,
} from '@/features/work-packages/types'
import { useStatusLabels } from '@/features/work-packages/useStatusLabels'
import { formatDateTime } from '@/lib/datetime'

import {
  type AutomationRule,
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

  const ruleText = (rule: AutomationRule): string => {
    const status = statusLabel(rule.trigger_value)
    const priority = PRIORITY_LABELS[rule.action_value as WpPriority] ?? rule.action_value
    return `상태가 '${status}'(으)로 바뀌면 → 우선순위를 '${priority}'(으)로 설정`
  }

  const [triggerValue, setTriggerValue] = useState<WpStatus>('in_review')
  const [actionValue, setActionValue] = useState<WpPriority>('high')

  const add = () => {
    create.mutate({
      name: `${statusLabel(triggerValue)} → ${PRIORITY_LABELS[actionValue]}`,
      trigger_type: 'status_changed_to',
      trigger_value: triggerValue,
      action_type: 'set_priority',
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
                  <Select
                    aria-label={`${rule.name} 우선순위 값`}
                    className="h-6 w-20 shrink-0 text-[11px]"
                    value={rule.action_value}
                    onChange={(e) => setActive.mutate({ id: rule.id, action_value: e.target.value })}
                  >
                    {WP_PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {PRIORITY_LABELS[p]}
                      </option>
                    ))}
                  </Select>
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
          <span className="text-xs text-of-muted">상태</span>
          <Select
            aria-label="트리거 상태"
            className="h-7 w-28 text-xs"
            value={triggerValue}
            onChange={(e) => setTriggerValue(e.target.value as WpStatus)}
          >
            {WP_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </Select>
          <span className="text-xs text-of-muted">→ 우선순위</span>
          <Select
            aria-label="설정 우선순위"
            className="h-7 w-24 text-xs"
            value={actionValue}
            onChange={(e) => setActionValue(e.target.value as WpPriority)}
          >
            {WP_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </Select>
          <Button size="sm" disabled={create.isPending} onClick={add}>
            규칙 추가
          </Button>
        </div>
      ) : null}
    </div>
  )
}
