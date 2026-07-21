import type { components } from '@shared/api-types'

export type BuiltInProjectRole = 'owner' | 'member' | 'viewer'
export type Member = Omit<components['schemas']['MemberRead'], 'role'> & {
  role: BuiltInProjectRole
}
export type MemberList = Omit<components['schemas']['MemberList'], 'items'> & {
  items: Member[]
}
export type MemberCreate = Omit<components['schemas']['MemberCreate'], 'role'> & {
  role: BuiltInProjectRole
}
export type MemberRoleUpdate = Omit<components['schemas']['MemberRoleUpdate'], 'role'> & {
  role: BuiltInProjectRole
}

export type Me = components['schemas']['MeRead']

export type PermissionAllow = components['schemas']['PermissionVerb']['effective']
export type PermissionVerb = components['schemas']['PermissionVerb']
export type PermissionReport = Omit<components['schemas']['PermissionReportRead'], 'my_role'> & {
  my_role: BuiltInProjectRole
}
