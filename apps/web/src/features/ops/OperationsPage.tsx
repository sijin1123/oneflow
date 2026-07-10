import {
  Activity,
  ArrowUpRight,
  DatabaseBackup,
  Download,
  FileInput,
  FolderKanban,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useMe } from '@/features/members/api'
import { useCanWrite } from '@/features/members/useCanWrite'
import { useProjects } from '@/features/projects/api'
import type { ProjectListItem } from '@/features/projects/types'
import { SettingsFrame, SettingsSection } from '@/features/settings/SettingsShell'
import { useExportCsv } from '@/features/work-packages/csv'
import { cn } from '@/lib/utils'

function actionLinkClass(disabled = false) {
  return cn(
    'inline-flex h-7 items-center justify-center gap-1.5 rounded-of px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus',
    disabled
      ? 'pointer-events-none bg-of-surface-2 text-of-muted opacity-50'
      : 'border border-of-border bg-of-surface hover:bg-of-surface-hover',
  )
}

function SurfaceLink({
  to,
  icon: Icon,
  label,
  detail,
}: {
  to: string
  icon: LucideIcon
  label: string
  detail: string
}) {
  return (
    <li>
      <Link
        to={to}
        className="flex min-h-12 items-center gap-3 rounded-of px-2 py-2 transition-colors hover:bg-of-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-of bg-of-accent-soft text-of-accent">
          <Icon size={15} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{label}</span>
          <span className="block truncate text-xs text-of-muted">{detail}</span>
        </span>
        <ArrowUpRight size={14} className="shrink-0 text-of-muted" aria-hidden="true" />
      </Link>
    </li>
  )
}

function ProjectDataRow({ project }: { project: ProjectListItem }) {
  const canWrite = useCanWrite(project.id)
  const exportCsv = useExportCsv(project.id)
  const archived = Boolean(project.archived_at)
  const importDisabled = archived || !canWrite

  return (
    <li className="grid gap-3 px-3 py-3 md:grid-cols-[minmax(0,1fr)_5rem_7rem_auto] md:items-center">
      <div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-of bg-of-surface-2 text-[10px] font-semibold text-of-muted">
            {project.key.slice(0, 2)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{project.name}</p>
            <p className="text-[11px] text-of-muted">{project.key}</p>
          </div>
        </div>
      </div>
      <div className="text-xs text-of-muted">
        <span className="md:hidden">작업 </span>
        {project.work_package_count}
      </div>
      <div>
        {archived ? <Badge variant="outline">아카이브</Badge> : <Badge variant="accent">활성</Badge>}
      </div>
      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        <Link to={`/projects/${project.id}/work-packages`} className={actionLinkClass()}>
          <FolderKanban size={13} aria-hidden="true" /> 작업
        </Link>
        <Link
          to={`/projects/${project.id}/work-packages?ops=import`}
          aria-disabled={importDisabled}
          className={actionLinkClass(importDisabled)}
        >
          <FileInput size={13} aria-hidden="true" /> 가져오기
        </Link>
        <Button
          variant="outline"
          size="sm"
          disabled={exportCsv.isPending || archived}
          onClick={() => exportCsv.mutate()}
        >
          <Download size={13} aria-hidden="true" /> 내보내기
        </Button>
      </div>
    </li>
  )
}

export function OperationsPage() {
  const projects = useProjects()
  const me = useMe()

  if (projects.isPending) return <ListSkeleton />
  if (projects.isError) return <ErrorState error={projects.error} onRetry={() => projects.refetch()} />
  const firstProject = projects.data.items[0]

  return (
    <SettingsFrame
      eyebrow="Operations"
      title="운영 허브"
      description="프로젝트 데이터 작업, 시스템 상태, 워크스페이스 관리 표면을 한 곳에서 확인합니다."
      meta={`프로젝트 ${projects.data.total}개`}
      className="max-w-6xl"
    >
      <SettingsSection
        title="데이터 작업"
        description="프로젝트별 작업 CSV 가져오기와 내보내기 진입점입니다."
      >
        <ul aria-label="프로젝트 데이터 작업" className="divide-y divide-of-border rounded-of border border-of-border">
          {projects.data.items.map((project) => (
            <ProjectDataRow key={project.id} project={project} />
          ))}
        </ul>
      </SettingsSection>

      <SettingsSection title="운영 표면" description="워크스페이스 운영자가 자주 확인하는 화면입니다.">
        <ul className="divide-y divide-of-border">
          <SurfaceLink
            to="/status"
            icon={Activity}
            label="시스템 상태"
            detail="배포 버전, 데이터베이스 리비전, 스토리지 한도"
          />
          {me.data?.is_admin ? (
            <SurfaceLink
              to="/admin/users"
              icon={UsersRound}
              label="사용자 관리"
              detail="계정 상태, 관리자 권한, 프로젝트 멤버십"
            />
          ) : null}
          {firstProject ? (
            <SurfaceLink
              to={`/projects/${firstProject.id}/settings?tab=storage`}
              icon={DatabaseBackup}
              label="스토리지"
              detail="프로젝트 파일 사용량과 쿼터"
            />
          ) : null}
        </ul>
      </SettingsSection>
    </SettingsFrame>
  )
}
