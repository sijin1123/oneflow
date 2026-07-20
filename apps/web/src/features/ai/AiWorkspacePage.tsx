import * as Dialog from '@radix-ui/react-dialog'
import {
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ListChecks,
  LoaderCircle,
  Plus,
  Send,
  Settings,
  Sparkles,
  WandSparkles,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { ErrorState, ListSkeleton } from '@/components/shell/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ModalContent, ModalOverlay } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useMe } from '@/features/members/api'
import { type MyWorkPackage, useMyWork } from '@/features/my-work/api'
import { useProjects } from '@/features/projects/api'
import { useCreateWorkPackage } from '@/features/work-packages/api'
import { PRIORITY_LABELS, type WorkPackage, type WpPriority } from '@/features/work-packages/types'

import { useCapabilities, useSummarize } from './api'

type AiMode = 'ask' | 'build'

type AskTurn = {
  id: number
  question: string
  answer: string
  source: MyWorkPackage
}

function uniqueCandidates(items: MyWorkPackage[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values())
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '요청을 처리하지 못했습니다.'
}

export function AiWorkspacePage() {
  const capabilities = useCapabilities()
  const myWork = useMyWork()
  const projects = useProjects()
  const me = useMe()
  const [searchParams, setSearchParams] = useSearchParams()
  const [mode, setMode] = useState<AiMode>('ask')
  const [askWpId, setAskWpId] = useState('')
  const [askQuestion, setAskQuestion] = useState('이 작업의 핵심 내용을 요약해 주세요.')
  const [turns, setTurns] = useState<AskTurn[]>([])
  const [buildProjectId, setBuildProjectId] = useState('')
  const [buildSubject, setBuildSubject] = useState('')
  const [buildPriority, setBuildPriority] = useState<WpPriority>('none')
  const [buildDueDate, setBuildDueDate] = useState('')
  const [reviewOpen, setReviewOpen] = useState(false)
  const [created, setCreated] = useState<WorkPackage | null>(null)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const reviewButtonRef = useRef<HTMLButtonElement>(null)

  const candidates = useMemo(
    () => myWork.data
      ? uniqueCandidates([
          ...myWork.data.due_soon,
          ...myWork.data.assigned_to_me,
          ...myWork.data.created_by_me,
        ])
      : [],
    [myWork.data],
  )
  const writableProjects = useMemo(
    () => (projects.data?.items ?? []).filter(
      (project) => !project.archived_at && project.current_user_role !== 'viewer',
    ),
    [projects.data?.items],
  )
  const selectedCandidate = candidates.find((item) => item.id === askWpId) ?? null
  const selectedProject = writableProjects.find((project) => project.id === buildProjectId) ?? null
  const summary = useSummarize(askWpId)
  const create = useCreateWorkPackage(buildProjectId)
  const enabled = capabilities.data?.ai_summary_enabled === true

  useEffect(() => {
    if (searchParams.get('new') !== '1') return
    setMode('ask')
    setTurns([])
    setAskQuestion('이 작업의 핵심 내용을 요약해 주세요.')
    setBuildSubject('')
    setBuildPriority('none')
    setBuildDueDate('')
    setReviewOpen(false)
    setCreated(null)
    summary.reset()
    create.reset()
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.delete('new')
      return next
    }, { replace: true })
  }, [create, searchParams, setSearchParams, summary])

  useEffect(() => {
    if (candidates.length === 0) {
      setAskWpId('')
      return
    }
    if (!candidates.some((item) => item.id === askWpId)) setAskWpId(candidates[0].id)
  }, [askWpId, candidates])

  useEffect(() => {
    if (writableProjects.length === 0) {
      setBuildProjectId('')
      return
    }
    if (!writableProjects.some((project) => project.id === buildProjectId)) {
      setBuildProjectId(writableProjects[0].id)
    }
  }, [buildProjectId, writableProjects])

  const resetConversation = () => {
    setMode('ask')
    setTurns([])
    setAskQuestion('이 작업의 핵심 내용을 요약해 주세요.')
    setBuildSubject('')
    setBuildPriority('none')
    setBuildDueDate('')
    setReviewOpen(false)
    setCreated(null)
    summary.reset()
    create.reset()
    window.requestAnimationFrame(() => promptRef.current?.focus())
  }

  const ask = () => {
    const question = askQuestion.trim()
    if (!enabled || !selectedCandidate || !question) return
    summary.mutate(question, {
      onSuccess: (result) => {
        setTurns((current) => [
          ...current,
          {
            id: Date.now(),
            question,
            answer: result.summary,
            source: selectedCandidate,
          },
        ])
        setAskQuestion('')
      },
    })
  }

  const confirmBuild = () => {
    const subject = buildSubject.trim()
    if (!enabled || !selectedProject || !subject) return
    create.mutate(
      {
        subject,
        type: 'task',
        status: 'backlog',
        priority: buildPriority,
        due_date: buildDueDate || null,
      },
      {
        onSuccess: (result) => {
          setCreated(result)
          setReviewOpen(false)
          setBuildSubject('')
          setBuildPriority('none')
          setBuildDueDate('')
        },
      },
    )
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-5.5rem)] w-full max-w-5xl min-w-0 flex-col px-4 py-4 sm:px-6">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-of-border pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-of bg-of-accent-soft text-of-accent">
              <Sparkles size={15} aria-hidden="true" />
            </span>
            <div>
              <p className="text-[11px] text-of-muted">AI workspace</p>
              <h1 className="text-sm font-semibold">OneFlow AI</h1>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {capabilities.isPending ? <Badge variant="outline">기능 확인 중</Badge> : enabled ? <Badge variant="accent">사용 가능</Badge> : <Badge variant="outline">꺼짐</Badge>}
          <Button variant="outline" size="sm" onClick={resetConversation}>
            <Plus size={13} aria-hidden="true" /> 새 대화
          </Button>
          {me.data?.is_admin ? (
            <Link to="/admin/ai" className="inline-flex h-7 items-center gap-1.5 rounded-of border border-of-border bg-of-surface px-2 text-xs font-medium hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus">
              <Settings size={13} aria-hidden="true" /> 설정
            </Link>
          ) : null}
        </div>
      </header>

      <div className="flex justify-center border-b border-of-border py-3">
        <div role="tablist" aria-label="AI 모드" className="inline-flex h-8 items-center rounded-of bg-of-surface-2 p-0.5">
          {([
            ['ask', 'Ask', Bot],
            ['build', 'Build', WandSparkles],
          ] as const).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              className={`inline-flex h-7 items-center gap-1.5 rounded-of px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus ${mode === value ? 'bg-of-surface text-of-text shadow-[var(--of-shadow-xs)]' : 'text-of-muted hover:text-of-text'}`}
              onClick={() => setMode(value)}
            >
              <Icon size={13} aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
      </div>

      {capabilities.isError ? (
        <section aria-label="AI 기능 오류" className="border-b border-of-border py-4">
          <ErrorState error={capabilities.error} onRetry={() => capabilities.refetch()} />
        </section>
      ) : !capabilities.isPending && !enabled ? (
        <section aria-label="AI 기능 비활성" className="flex min-w-0 flex-col gap-3 border-b border-of-border py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">OneFlow AI가 비활성화되어 있습니다</h2>
            <p className="mt-1 text-xs leading-5 text-of-muted">기능이 켜질 때까지 요약 요청과 작업 생성 action은 실행되지 않습니다.</p>
          </div>
          <Link to={me.data?.is_admin ? '/admin/ai' : '/status'} className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-of border border-of-border bg-of-surface px-3 text-xs font-medium hover:bg-of-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-of-focus">
            {me.data?.is_admin ? 'AI 설정 확인' : '시스템 상태'} <ArrowUpRight size={13} aria-hidden="true" />
          </Link>
        </section>
      ) : null}

      {mode === 'ask' ? (
        <section role="tabpanel" aria-label="Ask" className="flex min-h-0 flex-1 flex-col">
          <div className="of-scrollbar flex min-h-64 flex-1 flex-col overflow-y-auto py-5" aria-label="AI 대화">
            {myWork.isPending ? (
              <div className="mx-auto w-full max-w-3xl"><ListSkeleton rows={5} /></div>
            ) : myWork.isError ? (
              <div className="mx-auto w-full max-w-3xl"><ErrorState error={myWork.error} onRetry={() => myWork.refetch()} /></div>
            ) : turns.length === 0 ? (
              <div className="m-auto flex max-w-md flex-col items-center px-4 py-10 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-of-surface-2 text-of-muted">
                  <Bot size={22} aria-hidden="true" />
                </span>
                <h2 className="mt-4 text-base font-semibold">작업에서 바로 답을 찾으세요</h2>
                <p className="mt-2 text-xs leading-5 text-of-muted">접근 가능한 작업을 선택하면 현재 상태, 일정, 설명과 활동을 실제 요약 요청으로 정리합니다.</p>
              </div>
            ) : (
              <ol className="mx-auto w-full max-w-3xl space-y-5">
                {turns.map((turn) => (
                  <li key={turn.id} className="space-y-3">
                    <div className="ml-auto max-w-[85%] rounded-of bg-of-surface-2 px-3 py-2 text-sm">{turn.question}</div>
                    <div className="max-w-[92%] border-l-2 border-of-accent pl-3">
                      <p className="text-sm leading-6">{turn.answer}</p>
                      <Link to={`/projects/${turn.source.project_id}/work-packages?wp=${turn.source.id}`} className="mt-2 inline-flex max-w-full items-center gap-1 text-xs text-of-accent hover:underline">
                        <ListChecks size={12} aria-hidden="true" />
                        <span className="truncate">출처: {turn.source.project_name} · {turn.source.subject}</span>
                      </Link>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <form
            aria-label="Ask 입력"
            className="mx-auto w-full max-w-3xl border-t border-of-border py-3"
            onSubmit={(event) => {
              event.preventDefault()
              ask()
            }}
          >
            <label htmlFor="ai-ask-scope" className="text-[11px] font-medium text-of-muted">작업 범위</label>
            <Select id="ai-ask-scope" value={askWpId} disabled={!enabled || candidates.length === 0 || summary.isPending} onChange={(event) => { setAskWpId(event.target.value); summary.reset() }} className="mt-1">
              {candidates.length === 0 ? <option value="">요약할 열린 작업 없음</option> : candidates.map((item) => (
                <option key={item.id} value={item.id}>{item.project_name} · {item.subject}</option>
              ))}
            </Select>
            <div className="mt-2 flex min-w-0 items-end gap-2 rounded-of border border-of-border bg-of-surface p-2 pr-14 focus-within:border-of-focus focus-within:ring-1 focus-within:ring-of-focus/20 sm:pr-2">
              <Textarea
                ref={promptRef}
                value={askQuestion}
                rows={2}
                maxLength={500}
                disabled={!enabled || candidates.length === 0 || summary.isPending}
                className="min-h-14 flex-1 resize-none border-0 bg-transparent p-1 shadow-none focus-visible:border-0 focus-visible:ring-0"
                placeholder="선택한 작업에서 확인할 내용을 입력하세요"
                onChange={(event) => { setAskQuestion(event.target.value); if (summary.isError) summary.reset() }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    ask()
                  }
                }}
              />
              <Button type="submit" size="icon" aria-label="질문 보내기" disabled={!enabled || !selectedCandidate || !askQuestion.trim() || summary.isPending}>
                {summary.isPending ? <LoaderCircle className="animate-spin motion-reduce:animate-none" /> : <Send />}
              </Button>
            </div>
            {summary.error ? <p role="alert" className="mt-2 text-xs text-of-danger">{errorMessage(summary.error)}</p> : null}
            <p className="mt-2 pr-14 text-[11px] text-of-muted sm:pr-0">상태·일정·우선순위·활동·예상시간 질문에 작업 데이터로 답하며 결과에 출처를 표시합니다.</p>
          </form>
        </section>
      ) : (
        <section role="tabpanel" aria-label="Build" className="flex min-h-0 flex-1 flex-col py-5">
          <div className="mx-auto w-full max-w-3xl">
            <div className="border-b border-of-border pb-4">
              <h2 className="text-sm font-semibold">작업 만들기</h2>
              <p className="mt-1 text-xs leading-5 text-of-muted">작성 가능한 프로젝트에 새 작업을 준비하고, 실행 전에 최종 내용을 확인합니다.</p>
            </div>

            {projects.isPending ? (
              <div className="py-4"><ListSkeleton rows={5} /></div>
            ) : projects.isError ? (
              <div className="py-4"><ErrorState error={projects.error} onRetry={() => projects.refetch()} /></div>
            ) : writableProjects.length === 0 ? (
              <div className="py-8">
                <p className="text-sm font-medium">작업을 만들 수 있는 프로젝트가 없습니다</p>
                <p className="mt-1 text-xs text-of-muted">프로젝트 owner 또는 member 권한이 필요합니다.</p>
              </div>
            ) : (
              <form
                aria-label="Build 작업 초안"
                className="grid gap-4 py-4 sm:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (buildSubject.trim()) setReviewOpen(true)
                }}
              >
                <label className="block text-xs font-medium sm:col-span-2" htmlFor="ai-build-project">
                  프로젝트
                  <Select id="ai-build-project" value={buildProjectId} disabled={!enabled || create.isPending} onChange={(event) => { setBuildProjectId(event.target.value); setCreated(null); create.reset() }} className="mt-1">
                    {writableProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </Select>
                </label>
                <label className="block text-xs font-medium sm:col-span-2" htmlFor="ai-build-subject">
                  작업 제목
                  <Input id="ai-build-subject" value={buildSubject} maxLength={255} disabled={!enabled || create.isPending} onChange={(event) => { setBuildSubject(event.target.value); setCreated(null); create.reset() }} className="mt-1" placeholder="예: 결제 실패 재시도 흐름 정리" />
                </label>
                <label className="block text-xs font-medium" htmlFor="ai-build-priority">
                  우선순위
                  <Select id="ai-build-priority" value={buildPriority} disabled={!enabled || create.isPending} onChange={(event) => { setBuildPriority(event.target.value as WpPriority); setCreated(null); create.reset() }} className="mt-1">
                    {(Object.keys(PRIORITY_LABELS) as WpPriority[]).map((priority) => <option key={priority} value={priority}>{PRIORITY_LABELS[priority]}</option>)}
                  </Select>
                </label>
                <label className="block text-xs font-medium" htmlFor="ai-build-due-date">
                  기한
                  <Input id="ai-build-due-date" type="date" value={buildDueDate} disabled={!enabled || create.isPending} onChange={(event) => { setBuildDueDate(event.target.value); setCreated(null); create.reset() }} className="mt-1" />
                </label>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-of-border pt-4 sm:col-span-2">
                  <p className="text-[11px] leading-5 text-of-muted">확인 후 실제 작업 생성 API를 호출하며 프로젝트 활동과 webhook audit 계약을 그대로 사용합니다.</p>
                  <Button ref={reviewButtonRef} type="submit" disabled={!enabled || !selectedProject || !buildSubject.trim() || create.isPending}>
                    <WandSparkles size={14} aria-hidden="true" /> 작업 확인
                  </Button>
                </div>
              </form>
            )}

            {created && selectedProject ? (
              <div role="status" className="flex min-w-0 flex-col gap-2 border-y border-of-border py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-medium"><CheckCircle2 size={15} className="text-of-success" aria-hidden="true" /> 작업을 만들었습니다</p>
                  <p className="mt-1 truncate text-xs text-of-muted">{selectedProject.name} · {created.subject}</p>
                </div>
                <Link to={`/projects/${created.project_id}/work-packages?wp=${created.id}`} className="inline-flex h-8 shrink-0 items-center gap-1 text-xs font-medium text-of-accent hover:underline">작업 열기 <ArrowUpRight size={13} aria-hidden="true" /></Link>
              </div>
            ) : null}
          </div>
        </section>
      )}

      <Dialog.Root open={reviewOpen} onOpenChange={(open) => { if (!create.isPending) setReviewOpen(open) }}>
        <Dialog.Portal>
          <ModalOverlay className="bg-black/40" />
          <ModalContent
            aria-label="AI 작업 생성 확인"
            className="w-[min(28rem,calc(100vw-2rem))] rounded-of border border-of-border bg-of-surface p-4 shadow-[var(--of-shadow-popover)]"
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              reviewButtonRef.current?.focus()
            }}
          >
            <Dialog.Title className="text-sm font-semibold">이 작업을 만들까요?</Dialog.Title>
            <Dialog.Description className="mt-1 text-xs leading-5 text-of-muted">실행 전에 프로젝트와 핵심 속성을 확인하세요.</Dialog.Description>
            <dl className="mt-4 divide-y divide-of-border border-y border-of-border text-xs">
              <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3 py-2"><dt className="text-of-muted">프로젝트</dt><dd className="truncate font-medium">{selectedProject?.name}</dd></div>
              <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3 py-2"><dt className="text-of-muted">제목</dt><dd className="break-words font-medium">{buildSubject.trim()}</dd></div>
              <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3 py-2"><dt className="text-of-muted">우선순위</dt><dd>{PRIORITY_LABELS[buildPriority]}</dd></div>
              <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3 py-2"><dt className="text-of-muted">기한</dt><dd>{buildDueDate || '없음'}</dd></div>
            </dl>
            {create.error ? <p role="alert" className="mt-3 text-xs text-of-danger">{errorMessage(create.error)}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close asChild><Button variant="outline" size="sm" disabled={create.isPending}>취소</Button></Dialog.Close>
              <Button size="sm" disabled={create.isPending} onClick={confirmBuild}>
                {create.isPending ? <LoaderCircle className="animate-spin motion-reduce:animate-none" /> : <WandSparkles />}
                {create.isPending ? '만드는 중' : '작업 만들기'}
              </Button>
            </div>
          </ModalContent>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
