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
  created_at: string
}

export type AutomationRuleList = { items: AutomationRule[]; total: number }

export type AutomationRuleInput = {
  name: string
  trigger_type: 'status_changed_to'
  trigger_value: string
  action_type: 'set_priority'
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
    mutationFn: (input: { id: string; is_active: boolean }) =>
      api<AutomationRule>(`/api/v1/projects/${projectId}/automation-rules/${input.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: input.is_active }),
      }),
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
