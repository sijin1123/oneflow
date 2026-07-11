import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api'

import type { Customer, CustomerInput, CustomerList } from './types'

export type CustomerListOptions = {
  query?: string
  includeArchived?: boolean
  enabled?: boolean
}

const PAGE_SIZE = 500

export function useCustomers({
  query,
  includeArchived = false,
  enabled = true,
}: CustomerListOptions = {}) {
  return useQuery({
    queryKey: ['customers', { query: query?.trim() ?? '', includeArchived }],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (query?.trim()) params.set('query', query.trim())
      if (includeArchived) params.set('include_archived', 'true')
      params.set('limit', String(PAGE_SIZE))
      const items: Customer[] = []
      let total = 0
      for (let page = 0; page < 20; page++) {
        params.set('offset', String(page * PAGE_SIZE))
        const response = await api<CustomerList>(`/api/v1/customers?${params.toString()}`)
        items.push(...response.items)
        total = response.total
        if (items.length >= total || response.items.length < PAGE_SIZE) break
      }
      return { items, total }
    },
    enabled,
  })
}

export function useCustomer(id: string | null) {
  return useQuery({
    queryKey: ['customer', id],
    queryFn: () => api<Customer>(`/api/v1/customers/${id}`),
    enabled: id !== null,
  })
}

function invalidateCustomerData(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({
    predicate: (query) => ['customers', 'customer', 'work-packages', 'work-package'].includes(String(query.queryKey[0])),
  })
}

export function useCreateCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Required<Pick<CustomerInput, 'name'>> & CustomerInput) =>
      api<Customer>('/api/v1/customers', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => invalidateCustomerData(queryClient),
  })
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: CustomerInput & { id: string }) =>
      api<Customer>(`/api/v1/customers/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => invalidateCustomerData(queryClient),
  })
}

export function useArchiveCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<Customer>(`/api/v1/customers/${id}/archive`, { method: 'POST' }),
    onSuccess: () => invalidateCustomerData(queryClient),
  })
}

export function useRestoreCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<Customer>(`/api/v1/customers/${id}/restore`, { method: 'POST' }),
    onSuccess: () => invalidateCustomerData(queryClient),
  })
}
