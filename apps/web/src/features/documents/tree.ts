/* Pure page-hierarchy assembly from the flat document list (Pass 9 PR-U).
   The backend enforces same-project parents, self/cycle bans, and the depth cap
   (PLAN v9.1); this only shapes the list into a forest for rendering. A node
   whose parent is absent from the current set surfaces as a root, so nothing is
   ever hidden. Siblings sort by title (stable client-side contract, R1-⑤). */

import type { DocumentListItem } from './api'

export type DocTreeNode = {
  doc: DocumentListItem
  depth: number
  children: DocTreeNode[]
}

export function buildDocTree(items: DocumentListItem[]): DocTreeNode[] {
  const byId = new Map<string, DocumentListItem>()
  for (const doc of items) byId.set(doc.id, doc)

  const childrenOf = new Map<string, DocumentListItem[]>()
  const roots: DocumentListItem[] = []
  for (const doc of items) {
    if (doc.parent_id && byId.has(doc.parent_id)) {
      const arr = childrenOf.get(doc.parent_id) ?? []
      arr.push(doc)
      childrenOf.set(doc.parent_id, arr)
    } else {
      roots.push(doc)
    }
  }

  const byTitle = (a: DocumentListItem, b: DocumentListItem) =>
    a.title.localeCompare(b.title, 'ko') || a.id.localeCompare(b.id)

  // `seen` breaks any residual cycle defensively (each doc renders exactly once).
  const seen = new Set<string>()
  const build = (doc: DocumentListItem, depth: number): DocTreeNode => {
    seen.add(doc.id)
    const kids = (childrenOf.get(doc.id) ?? []).filter((c) => !seen.has(c.id)).sort(byTitle)
    return { doc, depth, children: kids.map((c) => build(c, depth + 1)) }
  }
  const forest = roots.sort(byTitle).map((r) => build(r, 0))
  // A residual full cycle (no reachable root) must still render — promote any
  // unvisited node to a root instead of silently dropping the whole loop.
  for (const doc of items) {
    if (!seen.has(doc.id)) forest.push(build(doc, 0))
  }
  return forest
}

/** ids of a document's whole subtree (itself included) — the set a page cannot
    choose as its parent in the editor. */
export function subtreeIds(items: DocumentListItem[], rootId: string): Set<string> {
  const childrenOf = new Map<string, string[]>()
  for (const doc of items) {
    if (doc.parent_id) {
      const arr = childrenOf.get(doc.parent_id) ?? []
      arr.push(doc.id)
      childrenOf.set(doc.parent_id, arr)
    }
  }
  const out = new Set<string>([rootId])
  const stack = [rootId]
  while (stack.length > 0) {
    const id = stack.pop() as string
    for (const child of childrenOf.get(id) ?? []) {
      if (!out.has(child)) {
        out.add(child)
        stack.push(child)
      }
    }
  }
  return out
}
