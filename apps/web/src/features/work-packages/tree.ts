/* Pure hierarchy assembly from a flat work-package list (Phase 2 계층 트리).
   The backend already enforces same-project parents, self-parent bans, and cycle
   guards (§6.2); this only shapes the flat list into a forest for rendering. A
   node whose parent is absent from the current set (filtered out or beyond the
   page) surfaces as a root, so nothing is ever hidden. */

import type { WorkPackage } from './types'

export type TreeNode = {
  wp: WorkPackage
  depth: number
  children: TreeNode[]
}

export function buildTree(items: WorkPackage[]): TreeNode[] {
  const byId = new Map<string, WorkPackage>()
  for (const wp of items) byId.set(wp.id, wp)

  const childrenOf = new Map<string, WorkPackage[]>()
  const roots: WorkPackage[] = []
  for (const wp of items) {
    if (wp.parent_id && byId.has(wp.parent_id)) {
      const arr = childrenOf.get(wp.parent_id) ?? []
      arr.push(wp)
      childrenOf.set(wp.parent_id, arr)
    } else {
      roots.push(wp)
    }
  }

  // `seen` breaks any residual cycle defensively (a node is reachable from one
  // parent only, so it also guarantees each WP renders exactly once).
  const seen = new Set<string>()
  const build = (wp: WorkPackage, depth: number): TreeNode => {
    seen.add(wp.id)
    const kids = (childrenOf.get(wp.id) ?? []).filter((c) => !seen.has(c.id))
    return { wp, depth, children: kids.map((c) => build(c, depth + 1)) }
  }
  return roots.map((r) => build(r, 0))
}

/** Total node count in a forest — used to detect a fully-flat list (no nesting). */
export function countNodes(nodes: TreeNode[]): number {
  return nodes.reduce((n, node) => n + 1 + countNodes(node.children), 0)
}

/** All ids that have at least one child — the set that expand/collapse toggles. */
export function branchIds(nodes: TreeNode[]): string[] {
  const out: string[] = []
  const walk = (node: TreeNode) => {
    if (node.children.length > 0) out.push(node.wp.id)
    node.children.forEach(walk)
  }
  nodes.forEach(walk)
  return out
}
