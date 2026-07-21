import { Archive, Link as LinkIcon, MoreHorizontal, RotateCcw, Settings, Share2, Star } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { confirmDestructive } from '@/lib/guards'
import { cn } from '@/lib/utils'

import { useArchiveProject } from './api'
import { ProjectPublicationDialog } from './ProjectPublicationDialog'
import type { ProjectListItem } from './types'

type ProjectActionsMenuProps = {
  project: ProjectListItem
  favorite: boolean
  onFavoriteChange: (projectId: string, favorite: boolean) => void
  onNavigate?: () => void
  onMessage: (message: string) => void
  triggerLabel?: string
  triggerClassName?: string
  placement?: 'sidebar' | 'directory'
}

export function ProjectActionsMenu({
  project,
  favorite,
  onFavoriteChange,
  onNavigate,
  onMessage,
  triggerLabel = `${project.name} 프로젝트 작업`,
  triggerClassName,
  placement = 'sidebar',
}: ProjectActionsMenuProps) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [publicationOpen, setPublicationOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuId = `project-actions-${placement}-${project.id}`
  const archive = useArchiveProject(project.id)
  const archived = Boolean(project.archived_at)
  const isOwner = project.current_user_role === 'owner'

  const copyLink = async () => {
    const href = `${window.location.origin}/projects/${project.id}/overview`
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(href)
      onMessage(`'${project.name}' 링크를 복사했습니다.`)
    } catch {
      onMessage(`복사할 링크: ${href}`)
    }
  }

  const changeArchiveState = () => {
    const verb = archived ? '복원' : '보관'
    const detail = archived
      ? '프로젝트를 다시 편집할 수 있습니다.'
      : '보관 중에는 모든 변경이 차단됩니다(복원 가능).'
    if (!confirmDestructive(`'${project.name}' 프로젝트를 ${verb}할까요?\n${detail}`)) return
    archive.mutate(!archived, {
      onSuccess: () => onMessage(`'${project.name}' 프로젝트를 ${verb}했습니다.`),
      onError: () => onMessage(`'${project.name}' 프로젝트를 ${verb}하지 못했습니다.`),
    })
  }

  return (
    <>
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label={triggerLabel}
          aria-controls={menuId}
          aria-expanded={open}
          className={cn(
            'flex h-8 w-7 shrink-0 items-center justify-center rounded-of text-of-muted transition-[opacity,color,background-color] hover:bg-of-surface-hover hover:text-of-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus',
            placement === 'sidebar' && 'opacity-100 sm:opacity-0 sm:group-hover/project:opacity-100 sm:group-focus-within/project:opacity-100',
            triggerClassName,
          )}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal size={14} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        id={menuId}
        align={placement === 'sidebar' ? 'start' : 'end'}
        side={placement === 'sidebar' ? 'right' : 'bottom'}
        className="w-52"
      >
        <DropdownMenuLabel>{project.name}</DropdownMenuLabel>
        <DropdownMenuItem
          className="flex items-center gap-2 text-xs"
          onSelect={() => onFavoriteChange(project.id, !favorite)}
        >
          <Star size={13} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true" />
          {favorite ? '즐겨찾기 해제' : '즐겨찾기에 추가'}
        </DropdownMenuItem>
        <DropdownMenuItem className="flex items-center gap-2 text-xs" onSelect={() => void copyLink()}>
          <LinkIcon size={13} aria-hidden="true" /> 링크 복사
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex items-center gap-2 text-xs"
          onSelect={() => {
            navigate(`/projects/${project.id}/settings`)
            onNavigate?.()
          }}
        >
          <Settings size={13} aria-hidden="true" /> 설정
        </DropdownMenuItem>
        {isOwner ? (
          <>
            {!archived ? (
              <DropdownMenuItem
                className="flex items-center gap-2 text-xs"
                onSelect={() => setPublicationOpen(true)}
              >
                <Share2 size={13} aria-hidden="true" /> 프로젝트 공개
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className={cn('flex items-center gap-2 text-xs', !archived && 'text-of-danger')}
              disabled={archive.isPending}
              onSelect={changeArchiveState}
            >
              {archived ? <RotateCcw size={13} aria-hidden="true" /> : <Archive size={13} aria-hidden="true" />}
              {archive.isPending
                ? archived ? '복원 중…' : '보관 중…'
                : archived ? '프로젝트 복원' : '프로젝트 보관'}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
    {isOwner ? (
      <ProjectPublicationDialog
        project={project}
        open={publicationOpen}
        onOpenChange={setPublicationOpen}
        onMessage={onMessage}
        returnFocusRef={triggerRef}
      />
    ) : null}
    </>
  )
}
