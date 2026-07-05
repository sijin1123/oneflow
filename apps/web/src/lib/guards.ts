import { useEffect } from 'react'
import { useBlocker } from 'react-router-dom'

/** Prompt before navigating away while `dirty` unsaved edits exist, and before a
 *  full page unload. Prevents the save-on-close editors from silently discarding a
 *  draft when the user clicks a sidebar link or closes the tab (fable5 audit). */
export function useUnsavedChangesPrompt(dirty: boolean, message: string) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    return dirty && currentLocation.pathname !== nextLocation.pathname
  })

  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (window.confirm(message)) blocker.proceed()
      else blocker.reset()
    }
  }, [blocker, message])

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

/** Native confirm for destructive actions — browser-native so it's keyboard- and
 *  screen-reader-accessible, and it can't be dismissed by an accidental click. */
export function confirmDestructive(message: string): boolean {
  return window.confirm(message)
}
