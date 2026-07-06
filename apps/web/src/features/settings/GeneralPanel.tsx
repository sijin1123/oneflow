import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useProject, useUpdateProject } from '@/features/projects/api'

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
    </div>
  )
}
