import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Search, X } from 'lucide-react'
import {
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

export function CommandPalette() {
  const auth = useAuthConfig()
  const enabled = auth.data?.command_palette_enabled === true
  const capabilities = useWorkspaceCapabilities()
  const wikiEnabled = capabilities.data?.wiki.enabled === true
  const initiativesEnabled = capabilities.data?.initiatives.enabled === true
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<CommandPaletteTab>('all')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const locationKey = `${location.pathname}?${location.search}`
  const lastLocationKey = useRef(locationKey)
  const queryClient = useQueryClient()
  const debounced = useDebouncedValue(query.trim(), 180)
  const search = useCommandPaletteSearch(debounced, enabled && open)
  const queryReady = query.trim().length >= 2 && debounced === query.trim()
  const data = queryReady ? search.data : undefined
  const allItems = useMemo(
    () => flattenCommandPaletteResults(data, wikiEnabled, initiativesEnabled),
    [data, initiativesEnabled, wikiEnabled],
  )
  const counts = useMemo(() => countCommandPaletteItems(allItems), [allItems])
  const items = useMemo(() => filterCommandPaletteItems(allItems, activeTab), [activeTab, allItems])
  const advancedHref = advancedSearchHref(query)
  const commandCount = query.trim().length >= 2 ? items.length + 1 : items.length

  const close = useCallback(() => {
    setOpen(false)
    setActiveIndex(0)
    void queryClient.removeQueries({ queryKey: commandPaletteSearchKey('') })
    void queryClient.removeQueries({ queryKey: ['command-palette-search'] })
  }, [queryClient])

  const openPalette = useCallback(() => {
    if (enabled) setOpen(true)
  }, [enabled])

  useEffect(() => {
    if (!enabled && open) close()
  }, [close, enabled, open])

  useEffect(() => {
    if (!enabled) return
    const onOpen = () => openPalette()
    window.addEventListener(COMMAND_PALETTE_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(COMMAND_PALETTE_OPEN_EVENT, onOpen)
  }, [enabled, openPalette])

  useEffect(() => {
    if (!open) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const unregister = appOverlayRegistry.register('command-palette')
    window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => {
      document.body.style.overflow = originalOverflow
      unregister()
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      close()
    }
    window.addEventListener('keydown', onEscape, { capture: true })
    return () => window.removeEventListener('keydown', onEscape, { capture: true })
  }, [close, open])

  useEffect(() => {
    if (lastLocationKey.current === locationKey) return
    lastLocationKey.current = locationKey
    if (open) close()
  }, [close, locationKey, open])

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
    }
  }

  if (!enabled) return null

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        aria-label="전체 검색 열기"
        aria-keyshortcuts="/ Meta+K Control+K"
        onClick={openPalette}
        className="hidden w-36 justify-start text-of-muted sm:inline-flex"
      >
        <Search />
        <span className="truncate">전체 검색</span>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="전체 검색 열기"
        aria-keyshortcuts="/ Meta+K Control+K"
        onClick={openPalette}
        className="sm:hidden"
      >
        <Search />
      </Button>
      {open ? (
        <div
          role="presentation"
          className="fixed inset-0 z-50 bg-of-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close()
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="전체 검색"
            className="fixed inset-x-3 top-14 mx-auto flex max-h-[min(78vh,640px)] max-w-2xl flex-col overflow-hidden rounded-of border border-of-border bg-of-surface shadow-[var(--of-shadow-popover)] sm:top-20"
            onKeyDown={onKeyDown}
          >
            <div className="flex items-center gap-2 border-b border-of-border px-3 py-2">
              <Search size={16} className="shrink-0 text-of-muted" />
              <Input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="전체 검색어"
                placeholder="검색어를 입력하세요"
                className="h-9 border-0 bg-transparent px-0 focus-visible:border-0"
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

            <div
              role="tablist"
              aria-label="검색 범위"
              className="flex gap-1 overflow-x-auto border-b border-of-border px-3 py-2"
            >
              {COMMAND_PALETTE_TABS.filter(
                (tab) => tab.key !== 'documents' || wikiEnabled,
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.key}
                  className={cn(
                    'shrink-0 rounded-of px-2 py-1 text-xs text-of-muted transition-colors hover:bg-of-surface-hover',
                    activeTab === tab.key && 'bg-of-accent-soft font-medium text-of-accent',
                  )}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                  {counts[tab.key] > 0 ? (
                    <span className="ml-1 tabular-nums">{counts[tab.key]}</span>
                  ) : null}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {query.trim().length < 2 ? (
                <p className="px-2 py-8 text-center text-xs text-of-muted">2자 이상 입력하세요.</p>
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
                <ul role="listbox" aria-label="검색 결과" className="space-y-1">
                  {items.map((item, index) => (
                    <li key={item.key}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={activeIndex === index}
                        className={cn(
                          'flex w-full min-w-0 items-center gap-2 rounded-of px-2 py-2 text-left hover:bg-of-surface-2',
                          activeIndex === index && 'bg-of-accent-soft',
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
                    activeIndex === items.length && 'bg-of-accent-soft',
                  )}
                  onClick={runAdvancedSearch}
                  onMouseEnter={() => setActiveIndex(items.length)}
                >
                  <Search size={13} />
                  <span className="min-w-0 flex-1 truncate">전체 검색 페이지에서 보기</span>
                </button>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  )
}
