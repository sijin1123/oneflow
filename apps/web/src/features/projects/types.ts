/* API contract types — manually mirrored from the FastAPI OpenAPI schema until
   the OpenAPI type-generation follow-up PR lands (packages/shared). Cross-checked
   in the Broad verification checklist (PLAN §13). */

export type Project = {
  id: string
  key: string
  name: string
  description: string | null
  budget: number | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

export type ProjectListItem = Project & {
  work_package_count: number
  open_work_package_count: number
  overdue_count: number
  member_count: number
}

export type ProjectList = {
  items: ProjectListItem[]
  total: number
}
