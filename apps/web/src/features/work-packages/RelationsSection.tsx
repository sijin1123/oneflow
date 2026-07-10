import {
  ArrowDownLeft,
  ArrowUpRight,
  GitBranch,
  Link2,
  Network,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'

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

function RelationMetric({
  icon: Icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: LucideIcon
  label: string
  value: string
  tone?: 'neutral' | 'accent'
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-of border border-of-border bg-of-surface px-3 py-3">
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-of',
          tone === 'accent' ? 'bg-of-accent-soft text-of-accent' : 'bg-of-surface-2 text-of-muted',
        )}
      >
        <Icon size={15} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] text-of-muted">{label}</span>
        <span className="block text-sm font-semibold tabular-nums">{value}</span>
      </span>
    </div>
  )
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
    <section aria-label="관계" className="rounded-of border border-of-border bg-of-surface p-4">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">관계</h3>
          <p className="mt-1 text-xs leading-5 text-of-muted">
            차단, 선후행, 연관 작업을 한 곳에서 확인하고 의존 흐름을 정리합니다.
          </p>
        </div>
        <Badge variant={canWrite ? 'accent' : 'outline'} className="self-start">
          {canWrite ? '편집 가능' : '읽기 전용'}
        </Badge>
      </div>

      {relations.isPending ? (
        <div className="mt-3 rounded-of border border-dashed border-of-border bg-of-surface-2/35 px-3 py-4 text-xs text-of-muted">
          불러오는 중...
        </div>
      ) : relations.isError ? (
        <div className="mt-3 rounded-of border border-of-border bg-of-surface px-3 py-4 text-xs text-of-danger">
          관계를 불러오지 못했습니다.
        </div>
      ) : (
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <RelationMetric
              icon={GitBranch}
              label="관계"
              value={`${relations.data.total}건`}
              tone="accent"
            />
            <RelationMetric
              icon={Network}
              label="의존"
              value={`${dependencyCount(relations.data.items)}건`}
            />
            <RelationMetric icon={Link2} label="연결 후보" value={`${otherWps.length}건`} />
          </div>

          {relations.data.total === 0 ? (
            <div className="mt-3 rounded-of border border-dashed border-of-border bg-of-surface-2/35 px-3 py-4 text-xs text-of-muted">
              연결된 관계가 없습니다.
            </div>
          ) : (
            <ul className="mt-3 grid gap-2">
              {relations.data.items.map((r) => {
                const other = otherId(r)
                const meta = RELATION_META[r.relation_type]
                return (
                  <li key={r.id} className="rounded-of border border-of-border bg-of-surface-2/35 p-3">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <RelationTypeBadge type={r.relation_type} />
                        <p className="mt-2 truncate text-sm font-medium">{subjectOf(other)}</p>
                        <p className="mt-1 text-xs leading-5 text-of-muted">
                          {directionLabel(r.direction)} · {meta.description}
                        </p>
                      </div>
                      {canWrite ? (
                        <button
                          type="button"
                          aria-label="관계 삭제"
                          className="shrink-0 rounded-of p-1.5 text-of-muted hover:bg-of-surface hover:text-of-danger"
                          onClick={() => deleteRelation.mutate(r.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      {canWrite ? (
        <>
          <div className="mt-4 grid gap-2 rounded-of border border-of-border bg-of-surface-2/35 p-3 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-end">
            <Select
              aria-label="관계 유형"
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
            <p className="text-xs text-of-danger">
              관계를 추가하지 못했습니다(이미 존재하거나 대상이 올바르지 않음).
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
