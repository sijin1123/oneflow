export const WORK_PACKAGE_SORTS = ['created', 'subject'] as const

export type WorkPackageSort = (typeof WORK_PACKAGE_SORTS)[number]

export const WORK_PACKAGE_SORT_LABELS: Record<WorkPackageSort, string> = {
  created: '생성순',
  subject: '제목순 (가나다)',
}

export function parseWorkPackageSort(raw: string | null): WorkPackageSort {
  return raw === 'subject' ? 'subject' : 'created'
}

export function serializeWorkPackageSort(sort: WorkPackageSort): string | null {
  return sort === 'created' ? null : sort
}
