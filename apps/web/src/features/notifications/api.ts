import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

export type Notification = {
  id: string
  kind: string
  project_id: string
  work_package_id: string | null
  work_package_subject: string | null
  actor_name: string | null
  read: boolean
  created_at: string
}

export type NotificationList = {
  items: Notification[]
  total: number
  unread: number
}

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<NotificationList>('/api/v1/me/notifications'),
    // Light polling keeps the bell badge fresh without a websocket (Phase 2).
    refetchInterval: 60_000,
  })
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/api/v1/me/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<void>('/api/v1/me/notifications/read-all', { method: 'POST' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export type NotificationSettings = {
  assigned: boolean
  watched: boolean
  commented: boolean
  mention: boolean
  due_alerts: boolean
}

export function useNotificationSettings() {
  return useQuery({
    queryKey: ['notification-settings'],
    queryFn: () => api<NotificationSettings>('/api/v1/me/notification-settings'),
  })
}

export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<NotificationSettings>) =>
      api<NotificationSettings>('/api/v1/me/notification-settings', {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['notification-settings'], data)
    },
  })
}
