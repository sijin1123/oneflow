import {
  ArrowDownLeft,
  ArrowUpRight,
  Link2,
  Network,
  Plus,
  RotateCcw,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
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
const RELATION_LABELS: Record<Relation['relation_type'], string> = {
  blocks: '차단함',
  precedes: '선행',
  follows: '후행',
  relates: '연관',
}
const RELATION_META: Record<
  Relation['relation_type'],
  { icon: LucideIcon; tone: 'accent' | 'neutral' | 'outline'; description: string }
> = {
  blocks: { icon: Network, tone: 'accent', description: '이 작업이 상대 작업을 막고 있습니다.' },
  precedes: { icon: ArrowUpRight, tone: 'neutral', description: '이 작업이 상대 작업보다 먼저 끝나야 합니다.' },
  follows: { icon: ArrowDownLeft, tone: 'neutral', description: '상대 작업 뒤에 이어집니다.' },
  relates: { icon: Link2, tone: 'outline', description: '참고해야 하는 관련 작업입니다.' },
}

function otherId(r: Relation): string {
  return r.direction === 'outgoing' ? r.target_id : r.source_id
}

function RelationTypeBadge({ type }: { type: Relation['relation_type'] }) {
  const meta = RELATION_META[type]
  const Icon = meta.icon
  return (
    <Badge variant={meta.tone}>
      <Icon size={12} aria-hidden="true" /> {RELATION_LABELS[type]}
    </Badge>
  )
}

function directionLabel(direction: Relation['direction']) {
  return direction === 'outgoing' ? '내보내는 관계' : '들어오는 관계'
}

function dependencyCount(items: Relation[]) {
  return items.filter((r) => r.relation_type !== 'relates').length
}

export function RelationsSection({
  wpId,
  projectId,
  canWrite,
}: {
  wpId: string
  projectId: string
  canWrite: boolean
}) {
  const relations = useRelations(wpId)
  const candidates = useWorkPackages(projectId, {})
  const createRelation = useCreateRelation(wpId)
  const deleteRelation = useDeleteRelation(wpId)

  const [relType, setRelType] = useState<Relation['relation_type']>('relates')
  const [targetId, setTargetId] = useState<string>('')
  const [composerOpen, setComposerOpen] = useState(false)

  const subjectOf = (id: string) =>
    candidates.data?.items.find((w) => w.id === id)?.subject ?? id.slice(0, 8)

  const otherWps = (candidates.data?.items ?? []).filter((w) => w.id !== wpId)

  const submit = () => {
    if (!targetId) return
    createRelation.mutate(
      { target_id: targetId, relation_type: relType },
      {
        onSuccess: () => {
          setTargetId('')
          setComposerOpen(false)
        },
      },
    )
  }

  return (
    <section aria-label="관계" className="border-y border-of-border-subtle bg-of-surface">
      <div className="flex min-h-11 min-w-0 items-center justify-between gap-3 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Network size={14} className="shrink-0 text-of-muted" aria-hidden="true" />
          <h3 className="text-xs font-semibold text-of-fg">관계</h3>
          {relations.data ? (
            <span className="truncate text-[11px] text-of-muted">
              {relations.data.total}개 · 의존 {dependencyCount(relations.data.items)}개
            </span>
          ) : null}
        </div>
        {canWrite ? (
          <button
            type="button"
            aria-label={composerOpen ? '관계 추가 닫기' : '관계 추가'}
            aria-expanded={composerOpen}
            className="flex size-7 shrink-0 items-center justify-center rounded-of text-of-muted transition-colors hover:bg-of-surface-hover hover:text-of-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
            onClick={() => setComposerOpen((open) => !open)}
          >
            {composerOpen ? <X size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
          </button>
        ) : null}
      </div>

      {relations.isPending ? (
        <p role="status" className="border-t border-of-border-subtle px-3 py-3 text-xs text-of-muted">
          불러오는 중...
        </p>
      ) : relations.isError ? (
        <div className="flex items-center justify-between gap-3 border-t border-of-border-subtle px-3 py-3 text-xs">
          <p role="alert" className="text-of-danger">관계를 불러오지 못했습니다.</p>
          <Button variant="ghost" size="sm" onClick={() => { void relations.refetch() }}>
            <RotateCcw size={13} aria-hidden="true" /> 다시 시도
          </Button>
        </div>
      ) : (
        relations.data.total === 0 ? (
          <p className="border-t border-of-border-subtle px-3 py-3 text-xs text-of-muted">
            연결된 관계가 없습니다.
          </p>
        ) : (
          <ul className="divide-y divide-of-border-subtle border-t border-of-border-subtle">
            {relations.data.items.map((r) => {
              const other = otherId(r)
              const meta = RELATION_META[r.relation_type]
              return (
                <li key={r.id} className="flex min-w-0 items-start gap-3 px-3 py-2.5 hover:bg-of-surface-hover/60">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <RelationTypeBadge type={r.relation_type} />
                      <p className="min-w-0 flex-1 truncate text-xs font-medium">{subjectOf(other)}</p>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-of-muted">
                      {directionLabel(r.direction)} · {meta.description}
                    </p>
                  </div>
                  {canWrite ? (
                    <button
                      type="button"
                      aria-label={`${subjectOf(other)} 관계 삭제`}
                      className="flex size-7 shrink-0 items-center justify-center rounded-of text-of-muted transition-colors hover:bg-of-surface-hover hover:text-of-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                      onClick={() => deleteRelation.mutate(r.id)}
                    >
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )
      )}

      {canWrite && composerOpen ? (
        <div className="border-t border-of-border-subtle bg-of-surface-2/30 p-3">
          <div className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-center">
            <Select
              aria-label="관계 유형"
              autoFocus
              value={relType}
              onChange={(e) => setRelType(e.target.value as Relation['relation_type'])}
            >
              {RELATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {RELATION_LABELS[t]}
                </option>
              ))}
            </Select>
            <Select
              aria-label="대상 작업"
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
            <Button
              size="sm"
              onClick={submit}
              disabled={!targetId || createRelation.isPending}
              className="w-full sm:w-auto"
            >
              추가
            </Button>
          </div>
          {createRelation.isError ? (
            <p role="alert" className="mt-2 text-xs text-of-danger">
              관계를 추가하지 못했습니다(이미 존재하거나 대상이 올바르지 않음).
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
