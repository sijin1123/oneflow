import * as Dialog from '@radix-ui/react-dialog'
import { FolderPlus, LoaderCircle, Plus, RefreshCw, X } from 'lucide-react'
import type { RefObject } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ModalContent, ModalOverlay } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { ApiError } from '@/lib/api'

import { useCreateProject, useProjects } from './api'

const KEY_RE = /^[A-Z][A-Z0-9]{1,9}$/

type ProjectCreateDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  returnFocusRef: RefObject<HTMLButtonElement | null>
}

export function ProjectCreateDialog({
  open,
  onOpenChange,
  returnFocusRef,
}: ProjectCreateDialogProps) {
  const navigate = useNavigate()
  const create = useCreateProject()
  const resetCreate = create.reset
  const existing = useProjects()
  const nameRef = useRef<HTMLInputElement>(null)
  const wasOpenRef = useRef(open)
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [description, setDescription] = useState('')
  const [templateId, setTemplateId] = useState('')

  useEffect(() => {
    if (wasOpenRef.current && !open) {
      setName('')
      setKey('')
      setDescription('')
      setTemplateId('')
      resetCreate()
    }
    wasOpenRef.current = open
  }, [open, resetCreate])

  const keyValid = KEY_RE.test(key)
  const canSubmit = name.trim().length > 0 && keyValid && !create.isPending
  const conflict = create.error instanceof ApiError && create.error.status === 409
  const otherError =
    create.error instanceof ApiError && create.error.status !== 409 ? create.error.message : null

  const submit = () => {
    if (!canSubmit) return
    create.mutate(
      {
        name: name.trim(),
        key,
        description: description.trim() || null,
        template_project_id: templateId || null,
      },
      { onSuccess: (project) => navigate(`/projects/${project.id}/overview`) },
    )
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (create.isPending) return
        onOpenChange(next)
      }}
    >
      <Dialog.Portal>
        <ModalOverlay className="bg-black/35" />
        <ModalContent
          aria-describedby="project-create-description"
          className="flex max-h-[calc(100dvh-1.5rem)] w-[min(35rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-of-lg border border-of-border bg-of-surface-raised shadow-[var(--of-shadow-popover)]"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            nameRef.current?.focus()
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            returnFocusRef.current?.focus()
          }}
        >
          <form
            aria-label="새 프로젝트 생성"
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
          >
            <header className="flex items-start gap-3 border-b border-of-border-subtle px-4 py-3.5 sm:px-5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-of bg-of-accent-soft text-of-accent">
                <FolderPlus size={16} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <Dialog.Title className="text-sm font-semibold text-of-text">새 프로젝트</Dialog.Title>
                <Dialog.Description
                  id="project-create-description"
                  className="mt-0.5 text-xs leading-5 text-of-muted"
                >
                  팀의 작업, 상태와 자동화를 담을 프로젝트 공간을 만듭니다.
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="새 프로젝트 창 닫기"
                  disabled={create.isPending}
                >
                  <X size={14} aria-hidden="true" />
                </Button>
              </Dialog.Close>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
                <div className="space-y-1.5">
                  <label htmlFor="np-name" className="text-xs font-medium text-of-text">
                    이름
                  </label>
                  <Input
                    ref={nameRef}
                    id="np-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="프로젝트 이름"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="np-key" className="text-xs font-medium text-of-text">
                    키
                  </label>
                  <Input
                    id="np-key"
                    aria-label="키 (대문자·숫자 2–10자)"
                    value={key}
                    onChange={(event) => setKey(event.target.value.toUpperCase())}
                    placeholder="ONE"
                    maxLength={10}
                    autoComplete="off"
                    aria-describedby="np-key-hint np-create-error"
                    aria-invalid={key.length > 0 && !keyValid}
                    className="font-mono"
                  />
                </div>
              </div>

              <p id="np-key-hint" className="mt-1.5 text-[11px] leading-4 text-of-muted">
                키는 대문자로 시작하는 대문자·숫자 2–10자로 입력하세요.
              </p>

              <div className="mt-4 space-y-1.5">
                <label htmlFor="np-desc" className="text-xs font-medium text-of-text">
                  설명 <span className="font-normal text-of-muted">(선택)</span>
                </label>
                <Input
                  id="np-desc"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="프로젝트의 목적을 한 줄로 적어주세요"
                />
              </div>

              <div className="mt-4 space-y-1.5">
                <label htmlFor="np-template" className="text-xs font-medium text-of-text">
                  템플릿 프로젝트 <span className="font-normal text-of-muted">(선택)</span>
                </label>
                <Select
                  id="np-template"
                  aria-label="템플릿으로 사용할 프로젝트"
                  value={templateId}
                  onChange={(event) => setTemplateId(event.target.value)}
                  disabled={existing.isPending || existing.isError}
                  aria-describedby="np-template-hint"
                >
                  <option value="">
                    {existing.isPending ? '템플릿 불러오는 중…' : '사용 안 함'}
                  </option>
                  {(existing.data?.items ?? []).map((project) => (
                    <option key={project.id} value={project.id}>
                      [{project.key}] {project.name}
                    </option>
                  ))}
                </Select>
                <div id="np-template-hint" className="flex min-h-5 items-start justify-between gap-3">
                  <p className="text-[11px] leading-5 text-of-muted">
                    선택한 프로젝트의 상태·타입·필드·자동화 설정을 복사합니다.
                  </p>
                  {existing.isError ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-5 shrink-0 px-1.5 text-[11px]"
                      onClick={() => void existing.refetch()}
                    >
                      <RefreshCw size={11} aria-hidden="true" /> 다시 시도
                    </Button>
                  ) : null}
                </div>
              </div>

              <div id="np-create-error" className="mt-2 min-h-5" aria-live="polite">
                {key.length > 0 && !keyValid ? (
                  <p className="text-xs text-of-danger">프로젝트 키 형식을 확인하세요.</p>
                ) : null}
                {conflict ? (
                  <p role="alert" className="text-xs text-of-danger">이미 사용 중인 키입니다.</p>
                ) : null}
                {otherError ? (
                  <p role="alert" className="text-xs text-of-danger">
                    생성하지 못했습니다: {otherError}
                  </p>
                ) : null}
              </div>
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-of-border-subtle bg-of-surface px-4 py-3 sm:px-5">
              <Dialog.Close asChild>
                <Button type="button" size="sm" variant="ghost" disabled={create.isPending}>
                  취소
                </Button>
              </Dialog.Close>
              <Button
                size="sm"
                type="submit"
                disabled={!canSubmit}
                aria-label={create.isPending ? '프로젝트 만드는 중' : '만들기'}
              >
                {create.isPending ? (
                  <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Plus size={13} aria-hidden="true" />
                )}
                {create.isPending ? '만드는 중…' : '프로젝트 만들기'}
              </Button>
            </footer>
          </form>
        </ModalContent>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
