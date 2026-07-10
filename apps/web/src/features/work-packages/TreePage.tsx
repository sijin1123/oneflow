import { ChevronDown, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import { useCanWrite } from '@/features/members/useCanWrite'

import { DetailDrawer } from './DetailDrawer'
import { TreeItemActions } from './TreeItemActions'
import { PriorityChip, StatusChip, TypeChip } from './chips'
import { useWorkPackages } from './api'
import { branchIds, buildTree, type TreeNode } from './tree'
import { useStatusLabels } from './useStatusLabels'
import { useTypeLabels } from './useTypeLabels'

export function TreePage() {
  const { projectId } = useParams() as { projectId: string }
  const [, setSearchParams] = useSearchParams()
  const statusLabel = useStatusLabels(projectId)
  const typeLabel = useTypeLabels(projectId)
  const canWrite = useCanWrite(projectId)
  // useWorkPackages now pages through the full set, so the tree no longer orphans
  // children whose parents fell past the first page.
  const { data, isPending, isError, error, refetch } = useWorkPackages(projectId, {})

  const tree = useMemo(() => (data ? buildTree(data.items) : []), [data])
  const allBranches = useMemo(() => branchIds(tree), [tree])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [itemActionMessage, setItemActionMessage] = useState<{
    text: string
    tone: 'info' | 'success' | 'error'
  } | null>(null)

  const openDrawer = (id: string, opts: { move?: boolean } = {}) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('wp', id)
      if (opts.move) next.set('move', '1')
      else next.delete('move')
      return next
    })
  }

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-of-border px-4 py-2">
        <div className="min-w-0">
          <span className="text-sm font-medium">계층 구조</span>
          {itemActionMessage ? (
            <p
              role={itemActionMessage.tone === 'error' ? 'alert' : 'status'}
              aria-live="polite"
              className={
                itemActionMessage.tone === 'error'
                  ? 'mt-0.5 text-xs text-of-danger'
                  : 'mt-0.5 text-xs text-of-muted'
              }
            >
              {itemActionMessage.text}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCollapsed(new Set())}>
            모두 펼치기
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCollapsed(new Set(allBranches))}
          >
            모두 접기
          </Button>
        </div>
      </div>

      {isPending ? (
        <ListSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : tree.length === 0 ? (
        <EmptyState title="작업이 없습니다" hint="작업을 만들면 상/하위 관계가 여기에 표시됩니다." />
      ) : (
        <div className="min-w-0 flex-1 overflow-auto p-2" role="tree" aria-label="작업 계층">
          {tree.map((node) => (
            <TreeRow
              key={node.wp.id}
              node={node}
              collapsed={collapsed}
              onToggle={toggle}
              onOpen={openDrawer}
              onOpenMove={(id) => openDrawer(id, { move: true })}
              onMessage={(text, tone = 'info') => setItemActionMessage({ text, tone })}
              statusLabel={statusLabel}
              typeLabel={typeLabel}
              projectId={projectId}
              canWrite={canWrite}
            />
          ))}
        </div>
      )}

      <DetailDrawer projectId={projectId} />
    </div>
  )
}

function TreeRow({
  node,
  collapsed,
  onToggle,
  onOpen,
  onOpenMove,
  onMessage,
  statusLabel,
  typeLabel,
  projectId,
  canWrite,
}: {
  node: TreeNode
  collapsed: Set<string>
  onToggle: (id: string) => void
  onOpen: (id: string, opts?: { move?: boolean }) => void
  onOpenMove: (id: string) => void
  onMessage: (message: string, tone?: 'info' | 'success' | 'error') => void
  statusLabel: (key: string) => string
  typeLabel: (key: string) => string
  projectId: string
  canWrite: boolean
}) {
  const hasChildren = node.children.length > 0
  const isCollapsed = collapsed.has(node.wp.id)

  return (
    <div role="treeitem" aria-expanded={hasChildren ? !isCollapsed : undefined}>
      <div
        className="group flex items-center gap-2 rounded-of py-1.5 pr-2 hover:bg-of-surface-2 focus-within:bg-of-surface-2"
        style={{ paddingLeft: `${node.depth * 20 + 4}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={isCollapsed ? '펼치기' : '접기'}
            className="shrink-0 rounded p-0.5 text-of-muted hover:bg-of-surface"
            onClick={() => onToggle(node.wp.id)}
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
        ) : (
          <span className="inline-block w-[22px] shrink-0" aria-hidden />
        )}
        <TypeChip type={node.wp.type} label={typeLabel(node.wp.type)} />
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:text-of-accent"
          onClick={() => onOpen(node.wp.id)}
        >
          {node.wp.subject}
        </button>
        <StatusChip status={node.wp.status} label={statusLabel(node.wp.status)} />
        <PriorityChip priority={node.wp.priority} />
        <TreeItemActions
          wp={node.wp}
          projectId={projectId}
          canWrite={canWrite}
          onOpen={onOpen}
          onOpenMove={onOpenMove}
          onMessage={onMessage}
        />
      </div>

      {hasChildren && !isCollapsed ? (
        <div role="group">
          {node.children.map((child) => (
            <TreeRow
              key={child.wp.id}
              node={child}
              collapsed={collapsed}
              onToggle={onToggle}
              onOpen={onOpen}
              onOpenMove={onOpenMove}
              onMessage={onMessage}
              statusLabel={statusLabel}
              typeLabel={typeLabel}
              projectId={projectId}
              canWrite={canWrite}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
