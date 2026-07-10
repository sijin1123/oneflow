import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

export const WEBHOOK_EVENTS = ['work_package.created', 'work_package.updated'] as const
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]

export type WebhookEndpoint = {
  id: string
  name: string
  url: string
  event_types: WebhookEvent[]
  is_active: boolean
  secret_version: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type WebhookEndpointList = {
  items: WebhookEndpoint[]
  total: number
  enabled: boolean
}

export type WebhookEndpointCreated = { item: WebhookEndpoint; secret: string }

export type WebhookDelivery = {
  id: string
  endpoint_id: string
  event_type: string
  status: 'pending' | 'sending' | 'succeeded' | 'failed' | 'skipped'
  attempt_count: number
  response_status: number | null
  duration_ms: number | null
  error: string | null
  created_at: string
  attempted_at: string | null
}

export type WebhookDeliveryList = { items: WebhookDelivery[]; total: number }

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['admin-webhooks'] })
  void queryClient.invalidateQueries({ queryKey: ['admin-webhook-deliveries'] })
}

export function useWebhooks() {
  return useQuery({
    queryKey: ['admin-webhooks'],
    queryFn: () => api<WebhookEndpointList>('/api/v1/webhooks'),
  })
}

export function useWebhookDeliveries() {
  return useQuery({
    queryKey: ['admin-webhook-deliveries'],
    queryFn: () => api<WebhookDeliveryList>('/api/v1/webhook-deliveries'),
  })
}

export function useCreateWebhook() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; url: string; event_types: WebhookEvent[] }) =>
      api<WebhookEndpointCreated>('/api/v1/webhooks', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidate(queryClient),
  })
}

export function useUpdateWebhook() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<Omit<WebhookEndpoint, 'id'>> & { id: string }) =>
      api<WebhookEndpoint>(`/api/v1/webhooks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidate(queryClient),
  })
}

export function useDeleteWebhook() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/v1/webhooks/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidate(queryClient),
  })
}

export function useRotateWebhookSecret() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api<WebhookEndpointCreated>(`/api/v1/webhooks/${id}/rotate-secret`, { method: 'POST' }),
    onSuccess: () => invalidate(queryClient),
  })
}

export function useTestWebhook() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api<WebhookDelivery>(`/api/v1/webhooks/${id}/test`, { method: 'POST' }),
    onSuccess: () => invalidate(queryClient),
  })
}

export function useRetryWebhookDelivery() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api<WebhookDelivery>(`/api/v1/webhook-deliveries/${id}/retry`, { method: 'POST' }),
    onSuccess: () => invalidate(queryClient),
  })
}
