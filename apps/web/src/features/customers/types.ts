export type CustomerProgress = {
  total: number
  open: number
  done: number
  overdue: number
  project_count: number
}

export type Customer = {
  id: string
  name: string
  description: string | null
  email: string | null
  url: string | null
  tags: string[]
  archived_at: string | null
  created_at: string
  updated_at: string
  progress: CustomerProgress
}

export type CustomerList = {
  items: Customer[]
  total: number
}

export type CustomerInput = {
  name?: string
  description?: string | null
  email?: string | null
  url?: string | null
  tags?: string[]
}
