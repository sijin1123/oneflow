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
  width: number
  projectNavigation: 'accordion' | 'tabs'
  limitProjects: boolean
  projectLimit: number
  workspaceExpanded: boolean
  projectsExpanded: boolean
  expandedProjectIds: string[]
  projectDisclosureInitialized: boolean
  pinned: SidebarNavKey[]
  favoriteProjectIds: string[]
}

export const DEFAULT_SIDEBAR_WIDTH = 248
export const MIN_SIDEBAR_WIDTH = 220
export const MAX_SIDEBAR_WIDTH = 420
export const DEFAULT_PROJECT_LIMIT = 10

export function clampSidebarWidth(value: number) {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(value)))
}

function clampProjectLimit(value: number) {
  return Math.min(50, Math.max(1, Math.round(value)))
}

export const DEFAULT_SIDEBAR_PREFERENCES: SidebarPreferences = {
  collapsed: false,
  hidden: [],
  order: [...SIDEBAR_NAV_KEYS],
  width: DEFAULT_SIDEBAR_WIDTH,
  projectNavigation: 'accordion',
  limitProjects: false,
  projectLimit: DEFAULT_PROJECT_LIMIT,
  workspaceExpanded: true,
  projectsExpanded: true,
  expandedProjectIds: [],
  projectDisclosureInitialized: false,
  pinned: ['/work-items'],
  favoriteProjectIds: [],
}

const validKeys = new Set<string>(SIDEBAR_NAV_KEYS)
const sameTabSubscribers = new Set<(preferences: SidebarPreferences) => void>()

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
      width: typeof value.width === 'number' && Number.isFinite(value.width)
        ? clampSidebarWidth(value.width)
        : DEFAULT_SIDEBAR_WIDTH,
      projectNavigation: value.projectNavigation === 'tabs' ? 'tabs' : 'accordion',
      limitProjects: typeof value.limitProjects === 'boolean' ? value.limitProjects : false,
      projectLimit: typeof value.projectLimit === 'number' && Number.isFinite(value.projectLimit)
        ? clampProjectLimit(value.projectLimit)
        : DEFAULT_PROJECT_LIMIT,
      workspaceExpanded: typeof value.workspaceExpanded === 'boolean' ? value.workspaceExpanded : true,
      projectsExpanded: typeof value.projectsExpanded === 'boolean' ? value.projectsExpanded : true,
      expandedProjectIds: Array.isArray(value.expandedProjectIds)
        ? value.expandedProjectIds.filter((id, index): id is string =>
          typeof id === 'string' && id.length > 0 && value.expandedProjectIds?.indexOf(id) === index,
        )
        : [],
      projectDisclosureInitialized: typeof value.projectDisclosureInitialized === 'boolean'
        ? value.projectDisclosureInitialized
        : false,
      pinned: Array.isArray(value.pinned)
        ? validStoredKeys(value.pinned).filter((key) => key !== '/projects')
        : [...DEFAULT_SIDEBAR_PREFERENCES.pinned],
      favoriteProjectIds: Array.isArray(value.favoriteProjectIds)
        ? value.favoriteProjectIds.filter((id, index): id is string =>
          typeof id === 'string' && id.length > 0 && value.favoriteProjectIds?.indexOf(id) === index,
        )
        : [],
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
    left.width === right.width &&
    left.projectNavigation === right.projectNavigation &&
    left.limitProjects === right.limitProjects &&
    left.projectLimit === right.projectLimit &&
    left.workspaceExpanded === right.workspaceExpanded &&
    left.projectsExpanded === right.projectsExpanded &&
    left.projectDisclosureInitialized === right.projectDisclosureInitialized &&
    left.hidden.join('|') === right.hidden.join('|') &&
    left.order.join('|') === right.order.join('|') &&
    left.expandedProjectIds.join('|') === right.expandedProjectIds.join('|') &&
    left.pinned.join('|') === right.pinned.join('|') &&
    left.favoriteProjectIds.join('|') === right.favoriteProjectIds.join('|')
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
    for (const subscriber of sameTabSubscribers) subscriber(preferences)
  }, [preferences])

  useEffect(() => {
    const syncSameTab = (next: SidebarPreferences) => {
      setPreferences((current) => (samePreferences(current, next) ? current : next))
    }
    sameTabSubscribers.add(syncSameTab)
    const syncPreferences = (event: StorageEvent) => {
      if (event.key !== null && event.key !== SIDEBAR_PREFERENCES_STORAGE_KEY) return
      const next = parseSidebarPreferences(event.newValue)
      setPreferences((current) => (samePreferences(current, next) ? current : next))
    }
    window.addEventListener('storage', syncPreferences)
    return () => {
      sameTabSubscribers.delete(syncSameTab)
      window.removeEventListener('storage', syncPreferences)
    }
  }, [])

  const setCollapsed = useCallback((collapsed: boolean) => {
    setPreferences((current) => ({ ...current, collapsed }))
  }, [])

  const setWidth = useCallback((width: number) => {
    setPreferences((current) => ({ ...current, width: clampSidebarWidth(width) }))
  }, [])

  const setProjectNavigation = useCallback((projectNavigation: 'accordion' | 'tabs') => {
    setPreferences((current) => ({ ...current, projectNavigation }))
  }, [])

  const setLimitProjects = useCallback((limitProjects: boolean) => {
    setPreferences((current) => ({ ...current, limitProjects }))
  }, [])

  const setProjectLimit = useCallback((projectLimit: number) => {
    setPreferences((current) => ({ ...current, projectLimit: clampProjectLimit(projectLimit) }))
  }, [])

  const setWorkspaceExpanded = useCallback((workspaceExpanded: boolean) => {
    setPreferences((current) => ({ ...current, workspaceExpanded }))
  }, [])

  const setProjectsExpanded = useCallback((projectsExpanded: boolean) => {
    setPreferences((current) => ({ ...current, projectsExpanded }))
  }, [])

  const setProjectExpanded = useCallback((
    projectId: string,
    expanded: boolean,
    preserveProjectId?: string,
  ) => {
    setPreferences((current) => {
      const next = new Set(current.expandedProjectIds)
      if (!current.projectDisclosureInitialized && preserveProjectId) next.add(preserveProjectId)
      if (expanded) next.add(projectId)
      else next.delete(projectId)
      return {
        ...current,
        projectDisclosureInitialized: true,
        expandedProjectIds: [...next],
      }
    })
  }, [])

  const setPinned = useCallback((key: SidebarNavKey, pinned: boolean) => {
    if (key === '/projects') return
    setPreferences((current) => ({
      ...current,
      pinned: pinned
        ? [...current.pinned.filter((item) => item !== key), key]
        : current.pinned.filter((item) => item !== key),
    }))
  }, [])

  const setFavoriteProject = useCallback((projectId: string, favorite: boolean) => {
    setPreferences((current) => ({
      ...current,
      favoriteProjectIds: favorite
        ? [...current.favoriteProjectIds.filter((id) => id !== projectId), projectId]
        : current.favoriteProjectIds.filter((id) => id !== projectId),
    }))
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

  const moveNavTo = useCallback((
    key: SidebarNavKey,
    targetKey: SidebarNavKey,
    groupKeys: SidebarNavKey[],
  ) => {
    setPreferences((current) => {
      if (key === targetKey || !groupKeys.includes(key) || !groupKeys.includes(targetKey)) return current
      const order = [...current.order]
      const fromIndex = order.indexOf(key)
      const targetIndex = order.indexOf(targetKey)
      if (fromIndex < 0 || targetIndex < 0) return current
      order.splice(fromIndex, 1)
      order.splice(order.indexOf(targetKey), 0, key)
      return { ...current, order }
    })
  }, [])

  const resetNavigation = useCallback(() => {
    setPreferences((current) => ({
      ...DEFAULT_SIDEBAR_PREFERENCES,
      collapsed: current.collapsed,
      width: current.width,
    }))
  }, [])

  return {
    preferences,
    setCollapsed,
    setWidth,
    setProjectNavigation,
    setLimitProjects,
    setProjectLimit,
    setWorkspaceExpanded,
    setProjectsExpanded,
    setProjectExpanded,
    setPinned,
    setFavoriteProject,
    setNavVisible,
    moveNav,
    moveNavTo,
    resetNavigation,
  }
}
