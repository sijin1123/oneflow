import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Search, X } from 'lucide-react'
import {
  type AnimationEvent,
  type CSSProperties,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthConfig } from '@/features/auth/api'
import { useCommandPaletteSearch } from '@/features/search/api'
import { useWorkspaceCapabilities } from '@/features/workspace-features/api'
import {
  COMMAND_PALETTE_KIND_LABELS,
  COMMAND_PALETTE_TABS,
  advancedSearchHref,
  commandPaletteSearchKey,
  countCommandPaletteItems,
  filterCommandPaletteItems,
  flattenCommandPaletteResults,
  type CommandPaletteItem,
  type CommandPaletteTab,
} from '@/features/search/commandPalette'
import { COMMAND_PALETTE_OPEN_EVENT, appOverlayRegistry } from '@/lib/shortcuts'
import { cn } from '@/lib/utils'

function useDebouncedValue(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [delayMs, value])
  return debounced
}

export function CommandPalette({ prominent = false }: { prominent?: boolean }) {
  const auth = useAuthConfig()
  const shortcutEnabled = auth.data?.command_palette_enabled === true
  const capabilities = useWorkspaceCapabilities()
  const wikiEnabled = capabilities.data?.wiki.enabled === true
  const initiativesEnabled = capabilities.data?.initiatives.enabled === true
  const [phase, setPhase] = useState<'closed' | 'opening' | 'open' | 'closing'>('closed')
  const [anchorStyle, setAnchorStyle] = useState<CSSProperties>({})
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<CommandPaletteTab>('all')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const dialogRef = useRef<HTMLElement | null>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const desktopTriggerRef = useRef<HTMLButtonElement | null>(null)
  const mobileTriggerRef = useRef<HTMLButtonElement | null>(null)
  const activeTriggerRef = useRef<HTMLElement | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const locationKey = `${location.pathname}?${location.search}`
  const lastLocationKey = useRef(locationKey)
  const queryClient = useQueryClient()
  const debounced = useDebouncedValue(query.trim(), 180)
  const present = phase !== 'closed'
  const search = useCommandPaletteSearch(debounced, present)
  const queryReady = query.trim().length >= 2 && debounced === query.trim()
  const data = queryReady ? search.data : undefined
  const allItems = useMemo(
    () => flattenCommandPaletteResults(data, wikiEnabled, initiativesEnabled),
    [data, initiativesEnabled, wikiEnabled],
  )
  const counts = useMemo(() => countCommandPaletteItems(allItems), [allItems])
  const items = useMemo(() => filterCommandPaletteItems(allItems, activeTab), [activeTab, allItems])
  const visibleTabs = COMMAND_PALETTE_TABS.filter(
    (tab) => (tab.key !== 'documents' || wikiEnabled) && (tab.key !== 'initiatives' || initiativesEnabled),
  )
  const advancedHref = advancedSearchHref(query)
  const commandCount = query.trim().length >= 2 ? items.length + 1 : items.length

  const measureAnchor = useCallback((preferred?: HTMLElement | null) => {
    const candidates = [preferred, activeTriggerRef.current, desktopTriggerRef.current, mobileTriggerRef.current]
    const trigger = candidates.find((candidate) => {
      if (!candidate) return false
      const rect = candidate.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    })
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    activeTriggerRef.current = trigger
    const finalWidth = Math.min(576, Math.max(rect.width, window.innerWidth - 16))
    const finalLeft = Math.max(8, (window.innerWidth - finalWidth) / 2)
    setAnchorStyle((current) => ({
      ...current,
      '--of-search-anchor-left': `${rect.left}px`,
      '--of-search-anchor-top': `${rect.top}px`,
      '--of-search-anchor-width': `${rect.width}px`,
      '--of-search-anchor-height': `${rect.height}px`,
      '--of-search-final-left': `${Math.round(finalLeft)}px`,
      '--of-search-final-width': `${Math.round(finalWidth)}px`,
      '--of-search-final-height': `${Math.round(Math.min(680, window.innerHeight * 0.82))}px`,
    } as CSSProperties))
  }, [])

  const captureCurrentGeometry = useCallback(() => {
    if (!dialogRef.current) return
    const style = window.getComputedStyle(dialogRef.current)
    const overlayStyle = dialogRef.current.parentElement
      ? window.getComputedStyle(dialogRef.current.parentElement)
      : null
    const content = dialogRef.current.querySelector<HTMLElement>('.of-search-content')
    const contentStyle = content ? window.getComputedStyle(content) : null
    setAnchorStyle((current) => ({
      ...current,
      '--of-search-current-left': style.left,
      '--of-search-current-top': style.top,
      '--of-search-current-width': style.width,
      '--of-search-current-height': style.maxHeight,
      '--of-search-current-overlay-opacity': overlayStyle?.opacity ?? '1',
      '--of-search-current-content-opacity': contentStyle?.opacity ?? '1',
      '--of-search-current-content-transform': contentStyle?.transform ?? 'none',
    } as CSSProperties))
  }, [])

  const close = useCallback(() => {
    if (phase === 'closed' || phase === 'closing') return
    captureCurrentGeometry()
    setPhase('closing')
    setActiveIndex(0)
    void queryClient.removeQueries({ queryKey: commandPaletteSearchKey('') })
    void queryClient.removeQueries({ queryKey: ['command-palette-search'] })
  }, [captureCurrentGeometry, phase, queryClient])

  const openPalette = useCallback((trigger?: HTMLElement | null) => {
    if (phase !== 'closed') return
    previouslyFocused.current = document.activeElement as HTMLElement | null
    measureAnchor(trigger)
    setPhase('opening')
  }, [measureAnchor, phase])

  useEffect(() => {
    if (!shortcutEnabled) return
    const onOpen = () => openPalette()
    window.addEventListener(COMMAND_PALETTE_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(COMMAND_PALETTE_OPEN_EVENT, onOpen)
  }, [openPalette, shortcutEnabled])

  useEffect(() => {
    if (!present) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const unregister = appOverlayRegistry.register('command-palette')
    return () => {
      document.body.style.overflow = originalOverflow
      unregister()
    }
  }, [present])

  useEffect(() => {
    if (phase === 'opening') {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0)
      const phaseTimer = reducedMotion ? window.setTimeout(() => setPhase('open'), 0) : null
      return () => {
        window.clearTimeout(focusTimer)
        if (phaseTimer !== null) window.clearTimeout(phaseTimer)
      }
    }
    if (phase === 'closing') {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (!reducedMotion) return
      const phaseTimer = window.setTimeout(() => setPhase('closed'), 0)
      return () => window.clearTimeout(phaseTimer)
    }
    if (phase === 'closed') previouslyFocused.current?.focus()
  }, [phase])

  const onSurfaceAnimationEnd = (event: AnimationEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return
    if (phase === 'opening' && event.animationName === 'of-search-surface-opening') {
      setPhase('open')
    }
    if (phase === 'closing' && event.animationName === 'of-search-surface-closing') {
      setPhase('closed')
    }
  }

  useLayoutEffect(() => {
    if (!present) return
    const onResize = () => measureAnchor()
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [measureAnchor, present])

  useLayoutEffect(() => {
    if (!present) return
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      close()
    }
    window.addEventListener('keydown', onEscape, { capture: true })
    return () => window.removeEventListener('keydown', onEscape, { capture: true })
  }, [close, present])

  useEffect(() => {
    if (lastLocationKey.current === locationKey) return
    lastLocationKey.current = locationKey
    if (present) close()
  }, [close, locationKey, present])

  useEffect(() => {
    setActiveIndex(0)
  }, [activeTab, query])

  useEffect(() => {
    if (!wikiEnabled && activeTab === 'documents') setActiveTab('all')
    if (!initiativesEnabled && activeTab === 'initiatives') setActiveTab('all')
  }, [activeTab, initiativesEnabled, wikiEnabled])

  const runItem = (item: CommandPaletteItem) => {
    close()
    navigate(item.href)
  }

  const runAdvancedSearch = () => {
    close()
    navigate(advancedHref)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (event.key === 'ArrowDown' && commandCount > 0) {
      event.preventDefault()
      setActiveIndex((i) => (i + 1) % commandCount)
      return
    }
    if (event.key === 'ArrowUp' && commandCount > 0) {
      event.preventDefault()
      setActiveIndex((i) => (i - 1 + commandCount) % commandCount)
      return
    }
    if (event.key === 'Enter' && commandCount > 0) {
      event.preventDefault()
      const item = items[activeIndex]
      if (item) runItem(item)
      else runAdvancedSearch()
      return
    }
    if (event.key === 'Tab' && dialogRef.current) {
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        ref={desktopTriggerRef}
        data-testid="global-search-trigger"
        aria-label="전체 검색 열기"
        aria-keyshortcuts={shortcutEnabled ? '/ Meta+K Control+K' : undefined}
        onClick={(event) => openPalette(event.currentTarget)}
        className={cn(
          'of-search-trigger hidden justify-start text-of-muted sm:inline-flex',
          prominent ? 'w-full max-w-[30rem]' : 'w-36',
        )}
      >
        <Search />
        <span className="truncate">검색</span>
        {prominent && shortcutEnabled ? (
          <span className="ml-auto hidden text-[10px] text-of-muted lg:inline">⌘ K</span>
        ) : null}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        ref={mobileTriggerRef}
        data-testid="global-search-trigger-mobile"
        aria-label="전체 검색 열기"
        aria-keyshortcuts={shortcutEnabled ? '/ Meta+K Control+K' : undefined}
        onClick={(event) => openPalette(event.currentTarget)}
        className="sm:hidden"
      >
        <Search />
      </Button>
      {present ? (
        <div
          role="presentation"
          data-phase={phase}
          style={anchorStyle}
          className={cn('of-search-overlay fixed inset-0 z-[var(--of-z-modal)] bg-of-overlay', `of-search-overlay-${phase}`)}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close()
          }}
        >
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="전체 검색"
            data-testid="global-search-surface"
            data-phase={phase}
            style={anchorStyle}
            className={cn('of-search-surface flex flex-col overflow-hidden rounded-of-lg border border-of-border bg-of-surface-raised shadow-[var(--of-shadow-popover)]', `of-search-surface-${phase}`)}
            onAnimationEnd={onSurfaceAnimationEnd}
            onKeyDown={onKeyDown}
          >
            <div className="of-search-header flex shrink-0 items-center gap-2 border-b border-of-border px-3">
              <Search size={16} className="shrink-0 text-of-muted" />
              <Input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="전체 검색어"
                role="combobox"
                aria-expanded="true"
                aria-controls={items.length > 0 ? 'command-palette-listbox' : 'command-palette-panel'}
                aria-activedescendant={
                  activeIndex < items.length ? `command-palette-item-${activeIndex}` : undefined
                }
                placeholder="검색어를 입력하세요"
                className="of-search-input h-full rounded-none border-0 bg-transparent px-0 shadow-none"
              />
              <button
                type="button"
                aria-label="전체 검색 닫기"
                className="shrink-0 rounded-of p-1 text-of-muted transition-colors hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
                onClick={close}
              >
                <X size={16} />
              </button>
            </div>

            <div className={cn('of-search-content flex min-h-0 flex-1 flex-col', `of-search-content-${phase}`)}>
            {query.trim().length >= 2 ? (
            <div role="tablist" aria-label="검색 범위" className="flex gap-1 overflow-x-auto border-b border-of-border px-3 py-2">
              {visibleTabs.map((tab, index) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  id={`command-palette-tab-${tab.key}`}
                  aria-controls="command-palette-panel"
                  aria-selected={activeTab === tab.key}
                  tabIndex={activeTab === tab.key ? 0 : -1}
                  className={cn(
                    'shrink-0 rounded-of px-2 py-1 text-xs text-of-muted transition-colors hover:bg-of-surface-hover',
                    activeTab === tab.key && 'bg-of-surface-selected font-medium text-of-accent',
                  )}
                  onClick={() => setActiveTab(tab.key)}
                  onKeyDown={(event) => {
                    const direction =
                      event.key === 'ArrowRight'
                        ? 1
                        : event.key === 'ArrowLeft'
                          ? -1
                          : 0
                    const targetIndex =
                      event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? visibleTabs.length - 1
                          : direction
                            ? (index + direction + visibleTabs.length) % visibleTabs.length
                            : -1
                    if (targetIndex < 0) return
                    event.preventDefault()
                    setActiveTab(visibleTabs[targetIndex].key)
                    event.currentTarget.parentElement
                      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                      [targetIndex]?.focus()
                  }}
                >
                  {tab.label}
                  {counts[tab.key] > 0 ? (
                    <span className="ml-1 tabular-nums">{counts[tab.key]}</span>
                  ) : null}
                </button>
              ))}
            </div>
            ) : null}

            <div
              id="command-palette-panel"
              role={query.trim().length >= 2 ? 'tabpanel' : 'region'}
              aria-label={query.trim().length < 2 ? '검색 시작' : undefined}
              aria-labelledby={query.trim().length >= 2 ? `command-palette-tab-${activeTab}` : undefined}
              className="of-scrollbar min-h-0 flex-1 overflow-y-auto p-2"
            >
              {query.trim().length < 2 ? (
                <div className="flex min-h-56 flex-col items-center justify-center gap-4 px-6 py-8 text-center">
                  <span className="flex h-20 w-20 items-center justify-center rounded-full bg-of-surface-2 text-of-faint" aria-hidden="true">
                    <Search size={40} strokeWidth={1.5} />
                  </span>
                  <h2 className="text-base font-semibold text-of-secondary">워크스페이스 검색</h2>
                </div>
              ) : !queryReady || search.isFetching ? (
                <div className="flex items-center justify-center gap-2 px-2 py-8 text-xs text-of-muted">
                  <Loader2 className="animate-spin" size={14} /> 검색 중
                </div>
              ) : search.isError ? (
                <div className="px-2 py-8 text-center text-xs text-of-danger">
                  검색에 실패했습니다.
                </div>
              ) : items.length === 0 ? (
                <p className="px-2 py-8 text-center text-xs text-of-muted">결과가 없습니다.</p>
              ) : (
                <ul id="command-palette-listbox" role="listbox" aria-label="검색 결과" className="space-y-1">
                  {items.map((item, index) => (
                    <li key={item.key}>
                      <button
                        id={`command-palette-item-${index}`}
                        type="button"
                        role="option"
                        aria-selected={activeIndex === index}
                        className={cn(
                          'flex w-full min-w-0 items-center gap-2 rounded-of px-2 py-2 text-left transition-colors hover:bg-of-surface-hover',
                          activeIndex === index && 'bg-of-surface-selected',
                        )}
                        onClick={() => runItem(item)}
                        onMouseEnter={() => setActiveIndex(index)}
                      >
                        <span className="w-16 shrink-0 truncate rounded-of bg-of-surface-2 px-1.5 py-0.5 text-[10px] text-of-muted">
                          {COMMAND_PALETTE_KIND_LABELS[item.kind]}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{item.label}</span>
                          <span className="block truncate text-xs text-of-muted">
                            {item.projectKey ? `${item.projectKey} · ` : ''}
                            {item.detail}
                            {item.matchedIn === 'content' && item.snippet
                              ? ` · ${item.snippet}`
                              : ''}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {query.trim().length >= 2 ? (
              <div className="border-t border-of-border p-2">
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2 rounded-of px-2 py-2 text-left text-xs hover:bg-of-surface-2',
                    activeIndex === items.length && 'bg-of-surface-selected',
                  )}
                  onClick={runAdvancedSearch}
                  onMouseEnter={() => setActiveIndex(items.length)}
                >
                  <Search size={13} />
                  <span className="min-w-0 flex-1 truncate">전체 검색 페이지에서 보기</span>
                </button>
              </div>
            ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
