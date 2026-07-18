import * as Dialog from '@radix-ui/react-dialog'
import { CalendarDays, Loader2, Plus, RotateCcw, X } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import {
  INITIATIVE_STATE_LABELS,
  type Initiative,
  type InitiativeCreateInput,
  type InitiativeState,
  useCreateInitiative,
} from './api'

const STATE_ORDER: InitiativeState[] = [
  'planned',
  'in_progress',
  'paused',
  'completed',
  'cancelled',
]

type FormState = {
  name: string
  description: string
  state: InitiativeState
  startDate: string
  targetDate: string
}

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  state: 'planned',
  startDate: '',
  targetDate: '',
}

export function InitiativeCreateDialog({
  onCreated,
}: {
  onCreated: (initiative: Initiative) => void
}) {
  const create = useCreateInitiative()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [validationError, setValidationError] = useState('')

  const busy = create.isPending
  const mutationError = create.error
    ? create.error instanceof Error && create.error.message
      ? create.error.message
      : '이니셔티브를 만들지 못했습니다.'
    : ''

  const reset = () => {
    setForm(EMPTY_FORM)
    setValidationError('')
    create.reset()
  }

  const change = <Key extends keyof FormState>(key: Key, value: FormState[Key]) => {
    setForm((current) => ({ ...current, [key]: value }))
    setValidationError('')
  }

  const payload = (): InitiativeCreateInput | null => {
    const name = form.name.trim()
    if (!name) {
      setValidationError('이니셔티브 이름을 입력하세요.')
      return null
    }
    if (form.startDate && form.targetDate && form.startDate > form.targetDate) {
      setValidationError('시작일은 목표일보다 늦을 수 없습니다.')
      return null
    }
    return {
      name,
      description: form.description.trim() || null,
      state: form.state,
      start_date: form.startDate || null,
      target_date: form.targetDate || null,
    }
  }

  const submit = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    const input = payload()
    if (!input) return
    create.reset()
    create.mutate(input, {
      onSuccess: (initiative) => {
        onCreated(initiative)
        setOpen(false)
        reset()
      },
    })
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (busy) return
        setOpen(next)
        if (next) create.reset()
        else reset()
      }}
    >
      <Dialog.Trigger asChild>
        <Button className="w-full sm:w-auto" size="sm">
          <Plus size={13} /> 새 이니셔티브
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[var(--of-z-modal)] bg-black/30 of-overlay-enter motion-reduce:animate-none" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[calc(var(--of-z-modal)+1)] flex max-h-[min(42rem,calc(100dvh-1.5rem))] w-[min(34rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-of-lg border border-of-border bg-of-surface-raised shadow-[var(--of-shadow-popover)] focus:outline-none"
          onEscapeKeyDown={(event) => { if (busy) event.preventDefault() }}
          onInteractOutside={(event) => { if (busy) event.preventDefault() }}
        >
          <div className="flex items-start gap-3 border-b border-of-border-subtle px-4 py-3.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-of bg-of-accent-soft text-of-accent">
              <CalendarDays size={16} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-sm font-semibold">이니셔티브 만들기</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-5 text-of-muted">
                전략 범위와 실행 기간을 먼저 정하고, 생성 후 상세에서 프로젝트와 작업을 연결합니다.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="이니셔티브 만들기 창 닫기"
                disabled={busy}
              >
                <X size={14} />
              </Button>
            </Dialog.Close>
          </div>

          <form className="min-h-0 overflow-y-auto" noValidate onSubmit={submit}>
            <div className="space-y-4 px-4 py-4">
              <label className="block text-xs font-medium">
                이름 <span className="text-of-danger">*</span>
                <Input
                  autoFocus
                  aria-label="새 이니셔티브 이름"
                  className="mt-1"
                  value={form.name}
                  maxLength={120}
                  disabled={busy}
                  placeholder="예: 2027 플랫폼 전략"
                  onChange={(event) => change('name', event.target.value)}
                />
                <span className="mt-1 block text-[11px] text-of-faint">{form.name.length}/120</span>
              </label>

              <label className="block text-xs font-medium">
                설명
                <Textarea
                  aria-label="새 이니셔티브 설명"
                  className="mt-1 min-h-24 resize-y"
                  value={form.description}
                  disabled={busy}
                  placeholder="이 전략이 달성하려는 결과와 성공 기준을 적으세요."
                  onChange={(event) => change('description', event.target.value)}
                />
              </label>

              <label className="block text-xs font-medium">
                실행 상태
                <Select
                  aria-label="새 이니셔티브 실행 상태"
                  className="mt-1"
                  value={form.state}
                  disabled={busy}
                  onChange={(event) => change('state', event.target.value as InitiativeState)}
                >
                  {STATE_ORDER.map((state) => (
                    <option key={state} value={state}>{INITIATIVE_STATE_LABELS[state]}</option>
                  ))}
                </Select>
              </label>

              <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="min-w-0 text-xs font-medium">
                  시작일
                  <Input
                    type="date"
                    aria-label="새 이니셔티브 시작일"
                    className="mt-1 min-w-0"
                    value={form.startDate}
                    max={form.targetDate || undefined}
                    disabled={busy}
                    onChange={(event) => change('startDate', event.target.value)}
                  />
                </label>
                <label className="min-w-0 text-xs font-medium">
                  목표일
                  <Input
                    type="date"
                    aria-label="새 이니셔티브 목표일"
                    className="mt-1 min-w-0"
                    value={form.targetDate}
                    min={form.startDate || undefined}
                    disabled={busy}
                    onChange={(event) => change('targetDate', event.target.value)}
                  />
                </label>
              </div>

              {validationError || mutationError ? (
                <div
                  role="alert"
                  className="rounded-of border border-of-danger/20 bg-of-danger-soft px-3 py-2 text-xs leading-5 text-of-danger"
                >
                  {validationError || mutationError}
                </div>
              ) : null}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-of-border-subtle bg-of-surface-2/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-end">
              <Dialog.Close asChild>
                <Button type="button" variant="outline" disabled={busy}>취소</Button>
              </Dialog.Close>
              <Button
                type="submit"
                disabled={busy || !form.name.trim()}
                aria-busy={busy}
              >
                {busy ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : mutationError ? <RotateCcw /> : <Plus />}
                {busy ? '만드는 중…' : mutationError ? '재시도' : '만들기'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
