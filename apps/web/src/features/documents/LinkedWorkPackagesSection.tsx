import { Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { useWorkPackages } from '@/features/work-packages/api'

import { useCreateDocLink, useDeleteDocLink, useDocLinks } from './api'

/* '연결된 작업' — page ↔ work-package links on the document editor
   (RelationsSection pattern: list + select-and-add, Pass 9 PR-V). */
export function LinkedWorkPackagesSection({
  docId,
  projectId,
  canWrite,
}: {
  docId: string
  projectId: string
  canWrite: boolean
}) {
  const links = useDocLinks(docId)
  const candidates = useWorkPackages(projectId, {})
  const createLink = useCreateDocLink(docId)
  const deleteLink = useDeleteDocLink(docId)
  const [wpId, setWpId] = useState('')

  const subjectOf = (id: string) =>
    candidates.data?.items.find((w) => w.id === id)?.subject ?? id.slice(0, 8)

  const linkedIds = new Set((links.data?.items ?? []).map((l) => l.work_package_id))
  const options = (candidates.data?.items ?? []).filter((w) => !linkedIds.has(w.id))

  const submit = () => {
    if (!wpId) return
    createLink.mutate(wpId, { onSuccess: () => setWpId('') })
  }

  return (
    <section aria-label="연결된 작업" className="mt-4 space-y-2 border-t border-of-border pt-3">
      <h3 className="text-xs font-semibold text-of-muted">연결된 작업</h3>

      {links.isPending ? (
        <p className="text-xs text-of-muted">불러오는 중…</p>
      ) : links.isError ? (
        <p className="text-xs text-of-danger">연결된 작업을 불러오지 못했습니다.</p>
      ) : links.data.total === 0 ? (
        <p className="text-xs text-of-muted">연결된 작업이 없습니다.</p>
      ) : (
        <ul className="space-y-1">
          {links.data.items.map((l) => (
            <li
              key={l.id}
              className="flex items-center gap-2 rounded-of border border-of-border px-2 py-1.5 text-xs"
            >
              <span className="min-w-0 flex-1 truncate">{subjectOf(l.work_package_id)}</span>
              {canWrite ? (
                <button
                  type="button"
                  aria-label="작업 연결 해제"
                  className="shrink-0 rounded-of p-1 text-of-muted hover:bg-of-surface-2 hover:text-of-danger"
                  onClick={() => deleteLink.mutate(l.id)}
                >
                  <Trash2 size={13} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canWrite ? (
        <>
          <div className="flex items-center gap-1.5">
            <Select
              aria-label="연결할 작업"
              className="h-7 flex-1 text-xs"
              value={wpId}
              onChange={(e) => setWpId(e.target.value)}
            >
              <option value="">작업 선택…</option>
              {options.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.subject}
                </option>
              ))}
            </Select>
            <Button size="sm" onClick={submit} disabled={!wpId || createLink.isPending}>
              연결
            </Button>
          </div>
          {createLink.isError ? (
            <p className="text-xs text-of-danger">
              작업을 연결하지 못했습니다(이미 연결되었거나 보관된 프로젝트).
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
