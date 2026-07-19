import { useEffect, useState } from 'react'

import { BASE_URL } from '@/lib/api'
import { cn } from '@/lib/utils'

import type { WorkspaceIdentity } from './api'

const sizeClasses = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-10 w-10 text-xs',
  lg: 'h-16 w-16 text-base',
} as const

function workspaceLogoSrc(profile: WorkspaceIdentity): string | null {
  if (!profile.logo_url) return null
  return `${BASE_URL.replace(/\/$/, '')}${profile.logo_url}`
}

export function WorkspaceLogo({
  profile,
  size = 'sm',
  className,
}: {
  profile: WorkspaceIdentity
  size?: keyof typeof sizeClasses
  className?: string
}) {
  const source = workspaceLogoSrc(profile)
  const [failed, setFailed] = useState(false)

  useEffect(() => setFailed(false), [source])

  const words = profile.name.trim().split(/\s+/).filter(Boolean)
  const fallback =
    (words.length === 1 ? words[0].slice(0, 2) : words.map((part) => part[0]).join(''))
      .slice(0, 2)
      .toUpperCase() || 'OF'

  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-of border border-of-border-subtle bg-of-accent font-bold text-white shadow-[var(--of-shadow-xs)]',
        sizeClasses[size],
        className,
      )}
    >
      {source && !failed ? (
        <img
          src={source}
          alt={`${profile.name} 로고`}
          className="h-full w-full bg-white object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-label={`${profile.name} 로고 기본값`}>{fallback}</span>
      )}
    </span>
  )
}
