import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Select } from '@/components/ui/select'
import { useCycles } from '@/features/cycles/api'
import { useCustomFields } from '@/features/custom-fields/api'
import { useCustomers } from '@/features/customers/api'
import { useMilestones } from '@/features/milestones/api'
import { useModules } from '@/features/modules/api'
import { useMembers } from '@/features/members/api'
import { useProjectTypeOptions } from '@/features/project-types/useProjectTypeOptions'
import { useWorkspaceCapabilities } from '@/features/workspace-features/api'

import { PRIORITY_LABELS, WP_PRIORITIES, WP_STATUSES } from './types'
import { useStatusLabels } from './useStatusLabels'

/* URL-backed filters (client state lives in search params — PLAN §8). */
export function Filters({ projectId }: { projectId: string }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const statusLabel = useStatusLabels(projectId)
  const projectTypes = useProjectTypeOptions(projectId, { includeInactive: true })
  const members = useMembers(projectId)
  const capabilities = useWorkspaceCapabilities()
  const releasesEnabled = capabilities.data?.releases.enabled === true
  const customersEnabled = capabilities.data?.customers.enabled === true
  const milestones = useMilestones(projectId, releasesEnabled)
  const customers = useCustomers({ includeArchived: true, enabled: customersEnabled })
  const cycles = useCycles(projectId)
  const modules = useModules(projectId)
  const customFields = useCustomFields(projectId)

  useEffect(() => {
    if (!capabilities.isSuccess || releasesEnabled || !searchParams.has('milestone_id')) return
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('milestone_id')
      return next
    }, { replace: true })
  }, [capabilities.isSuccess, releasesEnabled, searchParams, setSearchParams])

  useEffect(() => {
    if (!capabilities.isSuccess || customersEnabled || !searchParams.has('customer_id')) return
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('customer_id')
      return next
    }, { replace: true })
  }, [capabilities.isSuccess, customersEnabled, searchParams, setSearchParams])

  const cfField = searchParams.get('cf_field') ?? ''
  const cfOp = searchParams.get('cf_op') ?? ''
  const cfValue = searchParams.get('cf_value') ?? ''
  const activeField = (customFields.data?.items ?? []).find((f) => f.id === cfField && f.is_active)
  const setCf = (patch: { field?: string; op?: string; value?: string }) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        const field = patch.field !== undefined ? patch.field : cfField
        const op = patch.op !== undefined ? patch.op : cfOp
        const value = patch.value !== undefined ? patch.value : cfValue
        if (!field) {
          next.delete('cf_field')
          next.delete('cf_op')
          next.delete('cf_value')
        } else {
          next.set('cf_field', field)
          next.set('cf_op', op || 'has')
          // 'has' carries no value (v80.1 R1-②).
          if (op === 'eq' && value) next.set('cf_value', value)
          else next.delete('cf_value')
        }
        return next
      },
      { replace: true },
    )
  }

  const set = (key: string, value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs text-of-muted">
        상태
        <Select
          aria-label="상태 필터"
          className="h-7 w-28 text-xs"
          value={searchParams.get('status') ?? ''}
          onChange={(e) => set('status', e.target.value)}
        >
          <option value="">전체</option>
          {WP_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex items-center gap-1.5 text-xs text-of-muted">
        우선순위
        <Select
          aria-label="우선순위 필터"
          className="h-7 w-24 text-xs"
          value={searchParams.get('priority') ?? ''}
          onChange={(e) => set('priority', e.target.value)}
        >
          <option value="">전체</option>
          {WP_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex items-center gap-1.5 text-xs text-of-muted">
        타입
        <Select
          aria-label="타입 필터"
          className="h-7 w-28 text-xs"
          value={searchParams.get('type') ?? ''}
          onChange={(e) => set('type', e.target.value)}
        >
          <option value="">전체</option>
          {projectTypes.options.map((type) => (
            <option key={type.key} value={type.key}>
              {type.label}
              {type.isActive ? '' : ' (비활성)'}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex items-center gap-1.5 text-xs text-of-muted">
        담당자
        <Select
          aria-label="담당자 필터"
          className="h-7 w-28 text-xs"
          value={searchParams.get('assignee_id') ?? ''}
          onChange={(e) => set('assignee_id', e.target.value)}
        >
          <option value="">전체</option>
          {members.data?.items.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.display_name}
            </option>
          ))}
        </Select>
      </label>
      {releasesEnabled ? <label className="flex items-center gap-1.5 text-xs text-of-muted">
        마일스톤
        <Select
          aria-label="마일스톤 필터"
          className="h-7 w-28 text-xs"
          value={searchParams.get('milestone_id') ?? ''}
          onChange={(e) => set('milestone_id', e.target.value)}
        >
          <option value="">전체</option>
          {milestones.data?.items.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </label> : null}
      {customersEnabled ? (
        <label className="flex items-center gap-1.5 text-xs text-of-muted">
          고객
          <Select
            aria-label="고객 필터"
            className="h-7 w-32 text-xs"
            value={searchParams.get('customer_id') ?? ''}
            onChange={(e) => set('customer_id', e.target.value)}
          >
            <option value="">전체</option>
            {customers.data?.items.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}{customer.archived_at ? ' (보관)' : ''}
              </option>
            ))}
          </Select>
        </label>
      ) : null}
      <label className="flex items-center gap-1.5 text-xs text-of-muted">
        사이클
        <Select
          aria-label="사이클 필터"
          className="h-7 w-28 text-xs"
          value={searchParams.get('cycle_id') ?? ''}
          onChange={(e) => set('cycle_id', e.target.value)}
        >
          <option value="">전체</option>
          {cycles.data?.items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex items-center gap-1.5 text-xs text-of-muted">
        모듈
        <Select
          aria-label="모듈 필터"
          className="h-7 w-28 text-xs"
          value={searchParams.get('module_id') ?? ''}
          onChange={(e) => set('module_id', e.target.value)}
        >
          <option value="">전체</option>
          {modules.data?.items.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </label>
      {(customFields.data?.items ?? []).some((f) => f.is_active) ? (
        <div className="flex items-center gap-1.5 text-xs text-of-muted">
          <Select
            aria-label="커스텀 필드 필터"
            className="h-7 w-28 text-xs"
            value={cfField}
            onChange={(e) => setCf({ field: e.target.value, op: 'has', value: '' })}
          >
            <option value="">커스텀 필드</option>
            {(customFields.data?.items ?? [])
              .filter((f) => f.is_active)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
          </Select>
          {activeField ? (
            <>
              <Select
                aria-label="커스텀 필드 연산"
                className="h-7 w-20 text-xs"
                value={cfOp || 'has'}
                onChange={(e) => setCf({ op: e.target.value })}
              >
                <option value="has">값 있음</option>
                <option value="eq">값 일치</option>
              </Select>
              {cfOp === 'eq' ? (
                activeField.field_type === 'boolean' ? (
                  <Select
                    aria-label="커스텀 필드 값"
                    className="h-7 w-20 text-xs"
                    value={cfValue}
                    onChange={(e) => setCf({ value: e.target.value })}
                  >
                    <option value="">—</option>
                    <option value="true">예</option>
                    <option value="false">아니오</option>
                  </Select>
                ) : activeField.field_type === 'member' ? (
                  <Select
                    aria-label="커스텀 필드 값"
                    className="h-7 w-28 text-xs"
                    value={cfValue}
                    onChange={(e) => setCf({ value: e.target.value })}
                  >
                    <option value="">—</option>
                    {(members.data?.items ?? []).map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.display_name}
                      </option>
                    ))}
                  </Select>
                ) : activeField.field_type === 'dropdown' ? (
                  <Select
                    aria-label="커스텀 필드 값"
                    className="h-7 w-28 text-xs"
                    value={cfValue}
                    onChange={(e) => setCf({ value: e.target.value })}
                  >
                    <option value="">—</option>
                    {(activeField.options ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <input
                    aria-label="커스텀 필드 값"
                    type={activeField.field_type === 'date' ? 'date' : activeField.field_type === 'number' ? 'number' : 'text'}
                    className="h-7 w-28 rounded-of border border-of-border bg-of-surface px-2 text-xs"
                    value={cfValue}
                    onChange={(e) => setCf({ value: e.target.value })}
                  />
                )
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
