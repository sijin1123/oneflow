export type Member = {
  user_id: string
  email: string
  display_name: string
  role: 'owner' | 'member'
}

export type MemberList = {
  items: Member[]
  total: number
}

export type Me = {
  id: string
  email: string
  display_name: string
  is_active: boolean
  is_admin: boolean
}
