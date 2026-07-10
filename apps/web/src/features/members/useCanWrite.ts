import { useProject } from '@/features/projects/api'

import { canWriteFrom } from './canWrite'

import { useMe, useMembers } from './api'

/** Project write gate (Pass 76). True only when my role is owner/member AND
 *  the project is not archived — the same predicate the server enforces with
 *  403 (the UI just avoids dead controls). Fail-closed: while any input query
 *  is loading, on error, or on an unknown role, this returns false so a
 *  viewer never briefly sees an editable surface (v76.1 R1-③). The server
 *  stays the final authority; this only hides/disables entry points. */
export function useCanWrite(projectId: string): boolean {
  const me = useMe()
  const members = useMembers(projectId)
  const project = useProject(projectId)
  const loaded = Boolean(me.data && members.data && project.data)
  const myRole = members.data?.items.find((m) => m.user_id === me.data?.id)?.role
  return canWriteFrom(myRole, project.data?.archived_at, loaded)
}
