import { useCallback, useEffect, useState } from 'react'

export const SIDEBAR_PREFERENCES_STORAGE_KEY = 'oneflow.sidebar.preferences.v1'

export const SIDEBAR_NAV_KEYS = [
  '/my',
  '/drafts',
  '/my?tab=assigned',
  '/notes',
  '/projects',
  '/work-items',
  '/inbox',
  '/customers',
  '/templates',
  '/initiatives',
  '/search',
  '/reports',
  '/operations',
  '/status',
] as const

export type SidebarNavKey = (typeof SIDEBAR_NAV_KEYS)[number]

export type SidebarPreferences = {
  collapsed: boolean
  hidden: SidebarNavKey[]
  order: SidebarNavKey[]
}

export const DEFAULT_SIDEBAR_PREFERENCES: SidebarPreferences = {
  collapsed: false,
  hidden: [],
  order: [...SIDEBAR_NAV_KEYS],
}

const validKeys = new Set<string>(SIDEBAR_NAV_KEYS)

function validStoredKeys(value: unknown): SidebarNavKey[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (key, index): key is SidebarNavKey =>
      typeof key === 'string' && validKeys.has(key) && value.indexOf(key) === index,
  )
}

export function parseSidebarPreferences(raw: string | null): SidebarPreferences {
  try {
    const stored: unknown = JSON.parse(raw ?? '')
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
      return DEFAULT_SIDEBAR_PREFERENCES
    }
    const value = stored as Partial<SidebarPreferences>
    const storedOrder = validStoredKeys(value.order)
    return {
      collapsed: typeof value.collapsed === 'boolean' ? value.collapsed : false,
      hidden: validStoredKeys(value.hidden),
      order: [...storedOrder, ...SIDEBAR_NAV_KEYS.filter((key) => !storedOrder.includes(key))],
    }
  } catch {
    return DEFAULT_SIDEBAR_PREFERENCES
  }
}

function readSidebarPreferences() {
  if (typeof window === 'undefined') return DEFAULT_SIDEBAR_PREFERENCES
  try {
    return parseSidebarPreferences(window.localStorage.getItem(SIDEBAR_PREFERENCES_STORAGE_KEY))
  } catch {
    return DEFAULT_SIDEBAR_PREFERENCES
  }
}

function samePreferences(left: SidebarPreferences, right: SidebarPreferences) {
  return (
    left.collapsed === right.collapsed &&
    left.hidden.join('|') === right.hidden.join('|') &&
    left.order.join('|') === right.order.join('|')
  )
}

export function useSidebarPreferences() {
  const [preferences, setPreferences] = useState(readSidebarPreferences)

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences))
    } catch {
      // Storage can be unavailable in hardened browser contexts.
    }
  }, [preferences])

  useEffect(() => {
    const syncPreferences = (event: StorageEvent) => {
      if (event.key !== null && event.key !== SIDEBAR_PREFERENCES_STORAGE_KEY) return
      const next = parseSidebarPreferences(event.newValue)
      setPreferences((current) => (samePreferences(current, next) ? current : next))
    }
    window.addEventListener('storage', syncPreferences)
    return () => window.removeEventListener('storage', syncPreferences)
  }, [])

  const setCollapsed = useCallback((collapsed: boolean) => {
    setPreferences((current) => ({ ...current, collapsed }))
  }, [])

  const setNavVisible = useCallback((key: SidebarNavKey, visible: boolean) => {
    setPreferences((current) => ({
      ...current,
      hidden: visible
        ? current.hidden.filter((item) => item !== key)
        : [...current.hidden.filter((item) => item !== key), key],
    }))
  }, [])

  const moveNav = useCallback((
    key: SidebarNavKey,
    direction: -1 | 1,
    groupKeys: SidebarNavKey[],
  ) => {
    setPreferences((current) => {
      const orderedGroup = current.order.filter((item) => groupKeys.includes(item))
      const groupIndex = orderedGroup.indexOf(key)
      const targetKey = orderedGroup[groupIndex + direction]
      if (groupIndex < 0 || !targetKey) return current
      const index = current.order.indexOf(key)
      const target = current.order.indexOf(targetKey)
      const order = [...current.order]
      const currentKey = order[index]
      order[index] = order[target]
      order[target] = currentKey
      return { ...current, order }
    })
  }, [])

  const resetNavigation = useCallback(() => {
    setPreferences((current) => ({
      ...DEFAULT_SIDEBAR_PREFERENCES,
      collapsed: current.collapsed,
    }))
  }, [])

  return { preferences, setCollapsed, setNavVisible, moveNav, resetNavigation }
}
