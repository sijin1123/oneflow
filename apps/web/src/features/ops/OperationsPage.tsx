import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  DatabaseBackup,
  Download,
  FileInput,
  FolderKanban,
  History,
  TriangleAlert,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { useMe } from '@/features/members/api'
import { useCanWrite } from '@/features/members/useCanWrite'
import { useProjects } from '@/features/projects/api'
import type { ProjectListItem } from '@/features/projects/types'
import { SettingsFrame, SettingsSection } from '@/features/settings/SettingsShell'
import { useExportCsv } from '@/features/work-packages/csv'
import { formatDateTime } from '@/lib/datetime'
import { cn } from '@/lib/utils'

import {
  type DataTransferJob,
  ExportDownloadError,
  useDataTransferJobs,
  useDownloadTransferArtifact,
} from './dataTransfersApi'

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
          disabled={exportCsv.isPending}
          onClick={() => exportCsv.mutate()}
        >
          <Download size={13} aria-hidden="true" /> 내보내기
        </Button>
      </div>
      {exportCsv.isSuccess ? (
        <p className="text-[11px] text-of-muted md:col-span-4 md:text-right" role="status">
          {exportCsv.data.row_count}개 행 · 체크섬 {exportCsv.data.checksum.slice(0, 10)}
        </p>
      ) : null}
      {exportCsv.isError ? (
        <p className="text-[11px] text-of-danger md:col-span-4 md:text-right" role="alert">
          {exportCsv.error instanceof ExportDownloadError
            ? '파일은 생성됐지만 자동 다운로드에 실패했습니다. 최근 데이터 이전에서 다시 받아 주세요.'
            : '내보내기를 완료하지 못했습니다.'}
        </p>
      ) : null}
    </li>
  )
}

const sourceLabel = { oneflow: 'OneFlow', jira: 'Jira', linear: 'Linear' } as const

function TransferRow({ job }: { job: DataTransferJob }) {
  const download = useDownloadTransferArtifact()
  const hasErrors = job.status === 'completed_with_errors'
  const direction = job.direction === 'export' ? '내보내기' : job.dry_run ? '가져오기 미리보기' : '가져오기'

  return (
    <li className="grid gap-3 px-3 py-3 md:grid-cols-[minmax(0,1.2fr)_7rem_10rem_minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          {hasErrors ? (
            <TriangleAlert size={14} className="shrink-0 text-of-danger" aria-hidden="true" />
          ) : (
            <CheckCircle2 size={14} className="shrink-0 text-of-accent" aria-hidden="true" />
          )}
          <p className="truncate text-sm font-medium">{job.project_name}</p>
          <Badge variant="outline">{job.project_key}</Badge>
        </div>
        <p className="mt-1 truncate text-[11px] text-of-muted">
          {job.actor_name} · {formatDateTime(job.created_at)}
        </p>
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <Badge variant={job.direction === 'export' ? 'accent' : 'neutral'}>{direction}</Badge>
      </div>
      <div className="text-xs text-of-muted">
        {sourceLabel[job.source]} · 전체 {job.total_rows.toLocaleString('ko-KR')}
      </div>
      <div className="min-w-0 text-xs text-of-muted">
        <p>
          유효 {job.valid_rows.toLocaleString('ko-KR')}
          {job.invalid_rows > 0 ? ` · 오류 ${job.invalid_rows.toLocaleString('ko-KR')}` : ''}
          {job.inserted_rows > 0 ? ` · 반영 ${job.inserted_rows.toLocaleString('ko-KR')}` : ''}
        </p>
        <p className="mt-1 truncate font-mono text-[10px]" title={job.checksum}>
          {job.checksum.slice(0, 16)}
        </p>
      </div>
      <div className="flex items-center md:justify-end">
        {job.artifact_available && job.artifact_filename ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={download.isPending}
            onClick={() =>
              download.mutate({ jobId: job.id, filename: job.artifact_filename ?? 'export.csv' })
            }
          >
            <Download size={13} aria-hidden="true" /> 다시 받기
          </Button>
        ) : (
          <span className="text-[11px] text-of-muted">파일 없음</span>
        )}
      </div>
      {download.isError ? (
        <p className="text-[11px] text-of-danger md:col-span-5 md:text-right" role="alert">
          저장된 파일을 내려받지 못했습니다.
        </p>
      ) : null}
    </li>
  )
}

export function OperationsPage() {
  const projects = useProjects()
  const me = useMe()
  const [projectFilter, setProjectFilter] = useState('')
  const transfers = useDataTransferJobs(projectFilter || undefined)

  if (projects.isPending) return <ListSkeleton />
  if (projects.isError) return <ErrorState error={projects.error} onRetry={() => projects.refetch()} />
  const firstProject = projects.data.items[0]

  return (
    <SettingsFrame
      eyebrow="Operations"
      title="운영 허브"
      description="프로젝트 데이터 작업, 시스템 상태, 워크스페이스 관리 표면을 한 곳에서 확인합니다."
      meta={`프로젝트 ${projects.data.total}개 · 최근 작업 ${transfers.data?.total ?? 0}건`}
      className="max-w-6xl"
    >
      <SettingsSection
        title="데이터 작업"
        description="프로젝트별 작업 CSV 가져오기와 내보내기 진입점입니다."
      >
        <ul aria-label="프로젝트 데이터 작업" className="divide-y divide-of-border">
          {projects.data.items.map((project) => (
            <ProjectDataRow key={project.id} project={project} />
          ))}
        </ul>
      </SettingsSection>

      <SettingsSection
        title="최근 데이터 이전"
        description="가져오기 미리보기와 적용 결과, 시점이 고정된 내보내기 파일을 확인합니다."
        actions={
          <label className="flex items-center gap-2 text-xs text-of-muted">
            <span>프로젝트</span>
            <Select
              aria-label="데이터 이전 프로젝트 필터"
              className="w-44"
              value={projectFilter}
              onChange={(event) => setProjectFilter(event.target.value)}
            >
              <option value="">전체 프로젝트</option>
              {projects.data.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </label>
        }
      >
        {transfers.isPending ? <ListSkeleton rows={3} /> : null}
        {transfers.isError ? (
          <ErrorState error={transfers.error} onRetry={() => transfers.refetch()} />
        ) : null}
        {transfers.data?.items.length === 0 ? (
          <div className="flex min-h-28 flex-col items-center justify-center gap-2 text-center text-of-muted">
            <History size={20} aria-hidden="true" />
            <p className="text-xs">기록된 데이터 이전 작업이 없습니다.</p>
          </div>
        ) : null}
        {transfers.data?.items.length ? (
          <ul aria-label="데이터 이전 이력" className="divide-y divide-of-border">
            {transfers.data.items.map((job) => (
              <TransferRow key={job.id} job={job} />
            ))}
          </ul>
        ) : null}
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
