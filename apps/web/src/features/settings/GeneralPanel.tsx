import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useMemberNames, useMembers } from '@/features/members/api'
import { useProject, useUpdateProject } from '@/features/projects/api'
import { HEALTH_LABELS, type ProjectHealth } from '@/features/projects/types'

export function GeneralPanel({
  projectId,
  isOwner,
  onDirtyChange,
}: {
  projectId: string
  isOwner: boolean
  onDirtyChange: (dirty: boolean) => void
}) {
  const project = useProject(projectId)
  const updateProject = useUpdateProject(projectId)

  const [budget, setBudget] = useState('')
  const [pName, setPName] = useState('')
  const [pDesc, setPDesc] = useState('')
  // Seed/resync the editable project fields from the loaded (or refetched) project.
  useEffect(() => {
    if (project.data) {
      setPName(project.data.name)
      setPDesc(project.data.description ?? '')
    }
  }, [project.data])

  const dirty =
    isOwner &&
    (budget.trim() !== '' ||
      (project.data != null &&
        (pName !== project.data.name || pDesc !== (project.data.description ?? ''))))
  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  if (!project.data) return null

  if (!isOwner) {
    return (
      <div className="space-y-2 rounded-of border border-of-border bg-of-surface p-3 text-xs">
        <p className="font-medium">프로젝트 정보</p>
        <p>
          <span className="text-of-muted">이름: </span>
          {project.data.name}
        </p>
        <p>
          <span className="text-of-muted">설명: </span>
          {project.data.description ?? '—'}
        </p>
        <p>
          <span className="text-of-muted">예산: </span>
          {project.data.budget !== null ? `₩${project.data.budget.toLocaleString('ko-KR')}` : '미설정'}
        </p>
        <p>
          <span className="text-of-muted">상태: </span>
          {project.data.health ? HEALTH_LABELS[project.data.health] : '미설정'}
          {project.data.health_note ? ` — ${project.data.health_note}` : ''}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-of border border-of-border bg-of-surface p-3">
        <p className="text-xs font-medium">프로젝트 정보</p>
        <div className="space-y-1">
          <label htmlFor="p-name" className="text-xs text-of-muted">
            이름
          </label>
          <Input
            id="p-name"
            value={pName}
            onChange={(e) => setPName(e.target.value)}
            aria-label="프로젝트 이름"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="p-desc" className="text-xs text-of-muted">
            설명
          </label>
          <Input
            id="p-desc"
            value={pDesc}
            onChange={(e) => setPDesc(e.target.value)}
            aria-label="프로젝트 설명"
          />
        </div>
        <Button
          size="sm"
          disabled={updateProject.isPending || pName.trim() === ''}
          onClick={() =>
            updateProject.mutate({
              name: pName.trim(),
              description: pDesc.trim() === '' ? null : pDesc.trim(),
            })
          }
        >
          저장
        </Button>
        {updateProject.isError ? (
          <p role="alert" className="text-xs text-of-danger">
            저장하지 못했습니다.
          </p>
        ) : null}
      </div>

      <div className="space-y-2 rounded-of border border-of-border bg-of-surface p-3">
        <p className="text-xs font-medium">예산 (₩)</p>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min="0"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder={
              project.data.budget !== null ? project.data.budget.toLocaleString('ko-KR') : '미설정'
            }
            aria-label="프로젝트 예산"
            className="flex-1"
          />
          <Button
            size="sm"
            disabled={updateProject.isPending}
            onClick={() =>
              updateProject.mutate(
                { budget: budget.trim() === '' ? null : Number(budget) },
                { onSuccess: () => setBudget('') },
              )
            }
          >
            저장
          </Button>
        </div>
        {project.data.budget !== null ? (
          <p className="text-xs text-of-muted">
            현재 예산: ₩{project.data.budget.toLocaleString('ko-KR')}
          </p>
        ) : null}
      </div>

      <HealthSection projectId={projectId} />
    </div>
  )
}

/* Health report (Pass 37): an INDEPENDENT save from name/desc (v37.1 R1-⑤) —
   the note travels with the status and is always replaced on save. */
function HealthSection({ projectId }: { projectId: string }) {
  const project = useProject(projectId)
  const updateProject = useUpdateProject(projectId)
  const memberName = useMemberNames(projectId)
  const members = useMembers(projectId)
  const [health, setHealth] = useState<'' | ProjectHealth>('')
  const [note, setNote] = useState('')
  useEffect(() => {
    if (project.data) {
      setHealth(project.data.health ?? '')
      setNote(project.data.health_note ?? '')
    }
  }, [project.data])
  if (!project.data) return null

  const updatedBy = project.data.health_updated_by
  // Current member → name; past member → fallback; deleted user (SET NULL)
  // → the line is simply omitted (v37.1 R1-④).
  const reporterName = updatedBy
    ? members.data?.items.some((m) => m.user_id === updatedBy)
      ? memberName(updatedBy)
      : '이전 구성원'
    : null

  return (
    <div className="space-y-2 rounded-of border border-of-border bg-of-surface p-3">
      <p className="text-xs font-medium">프로젝트 상태 보고</p>
      <div className="flex items-center gap-2">
        <Select
          aria-label="프로젝트 상태"
          className="h-8 w-28 text-xs"
          value={health}
          onChange={(e) => setHealth(e.target.value as '' | ProjectHealth)}
        >
          <option value="">미설정</option>
          {(Object.keys(HEALTH_LABELS) as ProjectHealth[]).map((h) => (
            <option key={h} value={h}>
              {HEALTH_LABELS[h]}
            </option>
          ))}
        </Select>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="사유 (선택)"
          aria-label="상태 사유"
          disabled={health === ''}
          className="h-8 flex-1 text-xs"
          maxLength={2000}
        />
        <Button
          size="sm"
          disabled={updateProject.isPending}
          onClick={() =>
            updateProject.mutate(
              health === ''
                ? { health: null }
                : { health, health_note: note.trim() === '' ? null : note.trim() },
            )
          }
        >
          상태 저장
        </Button>
      </div>
      {project.data.health_updated_at ? (
        <p className="text-xs text-of-muted">
          마지막 보고: {project.data.health_updated_at.slice(0, 10)}
          {reporterName ? ` · ${reporterName}` : ''}
        </p>
      ) : null}
      {updateProject.isError ? (
        <p role="alert" className="text-xs text-of-danger">
          상태를 저장하지 못했습니다.
        </p>
      ) : null}
    </div>
  )
}
