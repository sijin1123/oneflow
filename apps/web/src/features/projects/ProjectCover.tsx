import { useEffect, useState, type ReactNode } from 'react'

import { downloadUrl } from '@/features/attachments/api'
import { cn } from '@/lib/utils'

const FALLBACK_COVERS = [
  'linear-gradient(125deg, #0f766e 0%, #155e75 42%, #be4458 100%)',
  'linear-gradient(125deg, #1d4ed8 0%, #0f766e 48%, #f59e0b 100%)',
  'linear-gradient(125deg, #9f3d5b 0%, #7c3aed 42%, #0891b2 100%)',
  'linear-gradient(125deg, #374151 0%, #0f766e 44%, #e4572e 100%)',
]

function coverFor(key: string) {
  const hash = [...key].reduce((value, character) => value + character.charCodeAt(0), 0)
  return FALLBACK_COVERS[hash % FALLBACK_COVERS.length]
}

export function ProjectCover({
  projectKey,
  projectName,
  attachmentId,
  className,
  children,
}: {
  projectKey: string
  projectName: string
  attachmentId: string | null | undefined
  className?: string
  children?: ReactNode
}) {
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => setImageFailed(false), [attachmentId])

  return (
    <div
      data-project-cover={projectKey}
      className={cn('relative isolate overflow-hidden bg-of-surface-3', className)}
      style={{ backgroundImage: coverFor(projectKey) }}
    >
      {attachmentId && !imageFailed ? (
        <img
          src={downloadUrl(attachmentId)}
          alt={`${projectName} 표지`}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : null}
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,16,24,0.02)_15%,rgba(9,16,24,0.58)_100%)]"
      />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  )
}
