import { useEffect } from 'react'

import { useAuthConfig } from '@/features/auth/api'
import {
  COMMAND_PALETTE_OPEN_EVENT,
  appOverlayRegistry,
  isCommandPaletteOpenShortcut,
} from '@/lib/shortcuts'

export function GlobalShortcutLayer() {
  const auth = useAuthConfig()
  const enabled = auth.data?.command_palette_enabled === true

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isCommandPaletteOpenShortcut(event, appOverlayRegistry.openCount)) return
      event.preventDefault()
      window.dispatchEvent(
        new CustomEvent(COMMAND_PALETTE_OPEN_EVENT, { detail: { source: 'keyboard' } }),
      )
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])

  return null
}
