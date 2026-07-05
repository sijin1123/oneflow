import { Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'

import {
  useCreateRelation,
  useDeleteRelation,
  useRelations,
  useWorkPackages,
} from './api'
import type { Relation } from './types'

const RELATION_TYPES = ['blocks', 'precedes', 'follows', 'relates'] as const
const RELATION_LABELS: Record<string, string> = {
  blocks: '차단함',
  precedes: '선행',
  follows: '후행',
  relates: '연관',
}

function relationPhrase(r: Relation, subjectOf: (id: string) => string): string {
  const label = RELATION_LABELS[r.relation_type] ?? r.relation_type
  const other = r.direction === 'outgoing' ? r.target_id : r.source_id
  const arrow = r.direction === 'outgoing' ? '→' : '←'
  return `${label} ${arrow} ${subjectOf(other)}`
}

export function RelationsSection({ wpId, projectId }: { wpId: string; projectId: string }) {
  const relations = useRelations(wpId)
  const candidates = useWorkPackages(projectId, {})
  const createRelation = useCreateRelation(wpId)
  const deleteRelation = useDeleteRelation(wpId)

  const [relType, setRelType] = useState<string>('relates')
  const [targetId, setTargetId] = useState<string>('')

  const subjectOf = (id: string) =>
    candidates.data?.items.find((w) => w.id === id)?.subject ?? id.slice(0, 8)

  const otherWps = (candidates.data?.items ?? []).filter((w) => w.id !== wpId)

  const submit = () => {
    if (!targetId) return
    createRelation.mutate(
      { target_id: targetId, relation_type: relType },
      { onSuccess: () => setTargetId('') },
    )
  }

  return (
    <section aria-label="관계" className="space-y-2 border-t border-of-border pt-3">
      <h3 className="text-xs font-semibold text-of-muted">관계</h3>

      {relations.isPending ? (
        <p className="text-xs text-of-muted">불러오는 중…</p>
      ) : relations.isError ? (
        <p className="text-xs text-of-danger">관계를 불러오지 못했습니다.</p>
      ) : relations.data.total === 0 ? (
        <p className="text-xs text-of-muted">연결된 관계가 없습니다.</p>
      ) : (
        <ul className="space-y-1">
          {relations.data.items.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-2 rounded-of border border-of-border px-2 py-1.5 text-xs"
            >
              <span className="min-w-0 flex-1 truncate">{relationPhrase(r, subjectOf)}</span>
              <button
                type="button"
                aria-label="관계 삭제"
                className="shrink-0 rounded-of p-1 text-of-muted hover:bg-of-surface-2 hover:text-of-danger"
                onClick={() => deleteRelation.mutate(r.id)}
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-1.5">
        <Select
          aria-label="관계 유형"
          className="h-7 w-20 text-xs"
          value={relType}
          onChange={(e) => setRelType(e.target.value)}
        >
          {RELATION_TYPES.map((t) => (
            <option key={t} value={t}>
              {RELATION_LABELS[t]}
            </option>
          ))}
        </Select>
        <Select
          aria-label="대상 작업"
          className="h-7 flex-1 text-xs"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
        >
          <option value="">대상 선택…</option>
          {otherWps.map((w) => (
            <option key={w.id} value={w.id}>
              {w.subject}
            </option>
          ))}
        </Select>
        <Button size="sm" onClick={submit} disabled={!targetId || createRelation.isPending}>
          추가
        </Button>
      </div>
      {createRelation.isError ? (
        <p className="text-xs text-of-danger">
          관계를 추가하지 못했습니다(이미 존재하거나 대상이 올바르지 않음).
        </p>
      ) : null}
    </section>
  )
}
