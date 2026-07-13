import type { Member } from './types'

export function isAssignableMember(member: Member) {
  return member.role === 'owner' || member.role === 'member'
}
