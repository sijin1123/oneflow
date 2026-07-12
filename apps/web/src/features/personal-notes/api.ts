import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

export type PersonalNote = {
  id: string
  title: string
  body: string
  color: PersonalNoteColor
  is_pinned: boolean
  position: number
  version: number
  created_at: string
  updated_at: string
}

export type PersonalNoteColor = 'lavender' | 'mint' | 'yellow' | 'rose' | 'blue' | 'gray'

export type PersonalNoteList = {
  items: PersonalNote[]
  total: number
  limit: number
  offset: number
}
export type PersonalNoteInput = {
  title?: string
  body?: string
  color?: PersonalNoteColor
  is_pinned?: boolean
}
export type PersonalNoteUpdate = Partial<PersonalNoteInput> & { expected_version: number }

const key = (q = '', limit = 50, offset = 0) => ['personal-notes', q, limit, offset] as const
const invalidate = (queryClient: ReturnType<typeof useQueryClient>) =>
  queryClient.invalidateQueries({ queryKey: ['personal-notes'] })

export function usePersonalNotes(q = '', limit = 50, offset = 0) {
  return useQuery({
    queryKey: key(q, limit, offset),
    queryFn: () =>
      api<PersonalNoteList>(
        `/api/v1/me/personal-notes?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`,
      ),
  })
}

export function useCreatePersonalNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: PersonalNoteInput) =>
      api<PersonalNote>('/api/v1/me/personal-notes', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => void invalidate(queryClient),
  })
}

export function useUpdatePersonalNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: PersonalNoteUpdate & { id: string }) =>
      api<PersonalNote>(`/api/v1/me/personal-notes/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => void invalidate(queryClient),
  })
}

export function useDeletePersonalNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, expectedVersion }: { id: string; expectedVersion: number }) =>
      api<void>(`/api/v1/me/personal-notes/${id}?expected_version=${expectedVersion}`, {
        method: 'DELETE',
      }),
    onSuccess: () => void invalidate(queryClient),
  })
}

export function useOrderPersonalNotes() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (items: Array<{ id: string; expected_version: number }>) =>
      api<PersonalNoteList>('/api/v1/me/personal-notes/order', {
        method: 'PUT',
        body: JSON.stringify({ items }),
      }),
    onSuccess: () => void invalidate(queryClient),
  })
}
