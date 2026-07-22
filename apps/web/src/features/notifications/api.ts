import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

export type Notification = {
  id: string
  kind: string
  project_id: string | null
  initiative_id?: string | null
  document_id?: string | null
  work_package_id: string | null
  intake_item_id?: string | null
  work_package_subject: string | null
  initiative_name?: string | null
  document_title?: string | null
  actor_name: string | null
  actor_profile_image_url?: string | null
  read: boolean
  created_at: string
}

export type NotificationList = {
  items: Notification[]
  total: number
  unread: number
  next_cursor_created_at?: string | null
  next_cursor_id?: string | null
}

export type NotificationScope = 'all' | 'unread' | 'read' | 'mentions'

type NotificationCursor = { createdAt: string; id: string }

const INBOX_PAGE_SIZE = 20

export type OverdueReminderDays = 0 | 3 | 7 | 14

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<NotificationList>('/api/v1/me/notifications'),
    // Light polling keeps the bell badge fresh without a websocket (Phase 2).
    refetchInterval: 60_000,
  })
}

export function useInboxNotifications(scope: NotificationScope) {
  return useInfiniteQuery({
    queryKey: ['notifications', 'inbox', scope],
    initialPageParam: null as NotificationCursor | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ scope, limit: String(INBOX_PAGE_SIZE) })
      if (pageParam) {
        params.set('cursor_created_at', pageParam.createdAt)
        params.set('cursor_id', pageParam.id)
      }
      return api<NotificationList>(`/api/v1/me/notifications?${params.toString()}`)
    },
    getNextPageParam: (page) =>
      page.next_cursor_created_at && page.next_cursor_id
        ? { createdAt: page.next_cursor_created_at, id: page.next_cursor_id }
        : undefined,
    retry: false,
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
  overdue_reminder_days: OverdueReminderDays
  intake: boolean
  initiatives: boolean
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
