import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Clock3, Loader2, LogIn, RefreshCw, ShieldCheck, UserRoundPlus } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'

import oneflowRibbonMark from '@/assets/brand/oneflow-ribbon-mark.svg'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'

import {
  previewWorkspaceInvitation,
  useAcceptWorkspaceInvitation,
} from '@/features/admin/workspaceInvitationsApi'

function unavailableMessage(error: unknown) {
  if (!(error instanceof ApiError)) return '초대 정보를 불러오지 못했습니다.'
  if (error.status === 404) return '유효하지 않은 초대 링크입니다.'
  if (error.status === 410 && error.message.includes('accepted')) return '이미 사용된 초대 링크입니다.'
  if (error.status === 410 && error.message.includes('expired')) return '만료된 초대 링크입니다.'
  if (error.status === 410 && error.message.includes('revoked')) return '취소된 초대 링크입니다.'
  return '초대 정보를 불러오지 못했습니다.'
}

export function InvitationAcceptPage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const preview = useQuery({
    queryKey: ['workspace-invitation-preview', token],
    queryFn: () => previewWorkspaceInvitation(token),
    enabled: token.length >= 32,
    retry: false,
  })
  const accept = useAcceptWorkspaceInvitation()

  const goToLogin = () => {
    if (!accept.data) return
    const params = new URLSearchParams({ email: accept.data.email, invited: '1' })
    navigate(`${accept.data.login_path}?${params.toString()}`, { replace: true })
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-of-surface-2 px-4 py-8 text-of-text">
      <section className="w-full max-w-md rounded-of-lg border border-of-border bg-of-surface-raised p-5 shadow-[var(--of-shadow-popover)] sm:p-7" aria-labelledby="invitation-title">
        <div className="flex items-center gap-2">
          <img src={oneflowRibbonMark} alt="" className="h-8 w-8" />
          <span className="text-base font-semibold">oneflow</span>
        </div>

        {accept.isSuccess ? (
          <div className="mt-8 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-of-success/10 text-of-success">
              <CheckCircle2 size={24} aria-hidden="true" />
            </span>
            <h1 id="invitation-title" className="mt-4 text-xl font-semibold">워크스페이스에 참여했습니다</h1>
            <p className="mt-2 text-sm leading-6 text-of-muted">
              {accept.data.display_name}님의 계정이 활성화되었습니다. 회사 로그인 방식으로 계속하세요.
            </p>
            <Button className="mt-6 w-full" onClick={goToLogin}>
              <LogIn size={15} /> 로그인으로 이동
            </Button>
          </div>
        ) : preview.isPending && token.length >= 32 ? (
          <div className="mt-10 flex flex-col items-center py-8 text-center" role="status">
            <Loader2 className="animate-spin text-of-accent" aria-hidden="true" />
            <p className="mt-3 text-sm text-of-muted">초대 정보를 확인하는 중...</p>
          </div>
        ) : preview.isError || token.length < 32 ? (
          <div className="mt-8 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-of-danger/10 text-of-danger">
              <ShieldCheck size={23} aria-hidden="true" />
            </span>
            <h1 id="invitation-title" className="mt-4 text-xl font-semibold">초대를 사용할 수 없습니다</h1>
            <p className="mt-2 text-sm text-of-muted">
              {token.length < 32 ? '유효하지 않은 초대 링크입니다.' : unavailableMessage(preview.error)}
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              {token.length >= 32 ? (
                <Button variant="outline" onClick={() => void preview.refetch()}>
                  <RefreshCw size={14} /> 다시 확인
                </Button>
              ) : null}
              <Button variant="ghost" onClick={() => navigate('/login', { replace: true })}>로그인으로 이동</Button>
            </div>
          </div>
        ) : preview.data ? (
          <div className="mt-8">
            <span className="grid size-10 place-items-center rounded-of bg-of-accent-soft text-of-accent">
              <UserRoundPlus size={20} aria-hidden="true" />
            </span>
            <h1 id="invitation-title" className="mt-4 text-xl font-semibold">OneFlow 워크스페이스 초대</h1>
            <p className="mt-2 text-sm leading-6 text-of-muted">
              {preview.data.display_name}님을 <strong className="font-medium text-of-text">{preview.data.masked_email}</strong> 계정으로 초대했습니다.
            </p>
            <div className="mt-5 flex items-center gap-2 rounded-of border border-of-border bg-of-surface-2 px-3 py-2 text-xs text-of-muted">
              <Clock3 size={14} aria-hidden="true" />
              {preview.data.expires_at.slice(0, 10)}까지 사용할 수 있는 일회성 링크입니다.
            </div>
            {accept.isError ? (
              <p className="mt-3 text-xs text-of-danger" role="alert">{unavailableMessage(accept.error)}</p>
            ) : null}
            <Button className="mt-6 w-full" disabled={accept.isPending} aria-busy={accept.isPending} onClick={() => accept.mutate(token)}>
              {accept.isPending ? <Loader2 className="animate-spin" /> : <UserRoundPlus size={15} />}
              {accept.isPending ? '참여하는 중...' : '초대 수락'}
            </Button>
            <p className="mt-3 text-center text-[11px] leading-5 text-of-muted">
              수락하면 일반 사용자 계정이 활성화됩니다. 프로젝트 접근 권한은 각 프로젝트 소유자가 별도로 부여합니다.
            </p>
          </div>
        ) : null}
      </section>
    </main>
  )
}
