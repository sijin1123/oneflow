import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

export type AutomationRule = {
  id: string
  project_id: string
  name: string
  trigger_type: string
  trigger_value: string
  action_type: string
  action_value: string
  is_active: boolean
  last_fired_at: string | null
  fired_count: number
  created_at: string
}

export type AutomationRuleList = { items: AutomationRule[]; total: number }

export type AutomationRuleInput = {
  name: string
  trigger_type: 'status_changed_to'
  trigger_value: string
  action_type: 'set_priority' | 'set_assignee'
  action_value: string
  is_active: boolean
}

export function useAutomationRules(projectId: string) {
  return useQuery({
    queryKey: ['automation-rules', projectId],
    queryFn: () => api<AutomationRuleList>(`/api/v1/projects/${projectId}/automation-rules`),
  })
}

export function useCreateAutomationRule(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: AutomationRuleInput) =>
      api<AutomationRule>(`/api/v1/projects/${projectId}/automation-rules`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['automation-rules', projectId] })
    },
  })
}

export function useSetAutomationRuleActive(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      id: string
      is_active?: boolean
      trigger_value?: string
      action_value?: string
      name?: string
    }) => {
      const { id, ...patch } = input
      return api<AutomationRule>(`/api/v1/projects/${projectId}/automation-rules/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['automation-rules', projectId] })
    },
  })
}

export function useDeleteAutomationRule(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/api/v1/projects/${projectId}/automation-rules/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['automation-rules', projectId] })
    },
  })
}

export type AutomationRuleRun = {
  id: string
  rule_id: string | null
  rule_name: string
  work_package_id: string | null
  work_package_subject: string
  field: string
  old_value: string | null
  new_value: string | null
  actor_id: string | null
  created_at: string
}

export function useAutomationRuleRuns(projectId: string) {
  return useQuery({
    queryKey: ['automation-rule-runs', projectId],
    queryFn: () =>
      api<{ items: AutomationRuleRun[]; total: number }>(
        `/api/v1/projects/${projectId}/automation-rules/runs`,
      ),
  })
}
