import { useEffect } from 'react'
import { useBlocker } from 'react-router-dom'

function useNavigationPrompt(
  dirty: boolean,
  message: string,
  shouldBlock: (current: { pathname: string; search: string }, next: { pathname: string; search: string }) => boolean,
) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    return dirty && shouldBlock(currentLocation, nextLocation)
  })

  // Depend on the state string, not the blocker object: useBlocker returns a
  // fresh object every render, so an object dep re-fires this effect on any
  // re-render while blocked and stacks duplicate confirm() dialogs.
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm(message)) blocker.proceed()
    else blocker.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker.state, message])

  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])
}

/** Prompt before navigating away while `dirty` unsaved edits exist, and before a
 *  full page unload. Prevents the save-on-close editors from silently discarding a
 *  draft when the user clicks a sidebar link or closes the tab (fable5 audit). */
export function useUnsavedChangesPrompt(dirty: boolean, message: string) {
  useNavigationPrompt(dirty, message, (current, next) => current.pathname !== next.pathname)
}

/** Same as useUnsavedChangesPrompt, but also guards same-path query-string moves
 *  (e.g. `?tab=` switches on the settings page) so tab clicks and browser
 *  back/forward can't silently discard a dirty section. */
export function useUnsavedLocationPrompt(dirty: boolean, message: string) {
  useNavigationPrompt(
    dirty,
    message,
    (current, next) => current.pathname !== next.pathname || current.search !== next.search,
  )
}

/** Native confirm for destructive actions — browser-native so it's keyboard- and
 *  screen-reader-accessible, and it can't be dismissed by an accidental click. */
export function confirmDestructive(message: string): boolean {
  return window.confirm(message)
}
