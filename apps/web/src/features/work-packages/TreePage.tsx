import { ChevronDown, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/shell/states'
import { Button } from '@/components/ui/button'

import { DetailDrawer } from './DetailDrawer'
import { PriorityChip, StatusChip, TypeChip } from './chips'
import { useWorkPackages } from './api'
import { branchIds, buildTree, type TreeNode } from './tree'
import { useStatusLabels } from './useStatusLabels'

export function TreePage() {
  const { projectId } = useParams() as { projectId: string }
  const [, setSearchParams] = useSearchParams()
  const statusLabel = useStatusLabels(projectId)
  // Reuses the standard list (capped at the API default); deep hierarchies beyond
  // that page fall back to root rows — recursive-CTE fetching is a later step.
  const { data, isPending, isError, error, refetch } = useWorkPackages(projectId, {})

  const tree = useMemo(() => (data ? buildTree(data.items) : []), [data])
  const allBranches = useMemo(() => branchIds(tree), [tree])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const openDrawer = (id: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('wp', id)
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
      <div className="flex items-center justify-between gap-2 border-b border-of-border px-4 py-2">
        <span className="text-sm font-medium">계층 구조</span>
        <div className="flex items-center gap-2">
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
              statusLabel={statusLabel}
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
  statusLabel,
}: {
  node: TreeNode
  collapsed: Set<string>
  onToggle: (id: string) => void
  onOpen: (id: string) => void
  statusLabel: (key: string) => string
}) {
  const hasChildren = node.children.length > 0
  const isCollapsed = collapsed.has(node.wp.id)

  return (
    <div role="treeitem" aria-expanded={hasChildren ? !isCollapsed : undefined}>
      <div
        className="flex items-center gap-2 rounded-of py-1.5 pr-2 hover:bg-of-surface-2"
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
        <TypeChip type={node.wp.type} />
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:text-of-accent"
          onClick={() => onOpen(node.wp.id)}
        >
          {node.wp.subject}
        </button>
        <StatusChip status={node.wp.status} label={statusLabel(node.wp.status)} />
        <PriorityChip priority={node.wp.priority} />
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
              statusLabel={statusLabel}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
