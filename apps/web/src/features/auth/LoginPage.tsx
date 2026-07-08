import { LogIn } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api'

import { useAuthConfig, useLogin } from './api'

/* Login screen (Pass 72). Lives OUTSIDE the AppShell — it must render with
   no session at all. auth/config is the unauthenticated discovery endpoint:
   dev mode shows the passwordless email form; oidc mode (real IdP not wired
   yet — 501 everywhere) shows guidance only. */
export function LoginPage() {
  const config = useAuthConfig()
  const login = useLogin()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')

  const submit = () => {
    const value = email.trim()
    if (!value || login.isPending) return
    login.mutate(value, {
      onSuccess: () => {
        const next = searchParams.get('next')
        navigate(next && next.startsWith('/') ? next : '/projects', { replace: true })
      },
    })
  }

  const failText =
    login.error instanceof ApiError
      ? login.error.status === 401
        ? '로그인할 수 없습니다 — 이메일을 확인해 주세요.'
        : login.error.message
      : null

  return (
    <div className="flex h-screen items-center justify-center bg-of-surface-2/40 p-6">
      <div className="w-full max-w-sm rounded-of border border-of-border bg-of-surface p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-of bg-of-accent text-sm font-bold text-white">
            O
          </div>
          <div>
            <p className="text-sm font-semibold">OneFlow</p>
            <p className="text-[11px] text-of-muted">프로젝트 관리 시스템</p>
          </div>
        </div>

        {config.data?.auth_mode === 'oidc' ? (
          <div className="space-y-2 text-xs">
            <p className="font-medium">SSO(OIDC) 인증 모드입니다.</p>
            <p className="text-of-muted">
              실제 IdP 연동이 아직 구성되지 않아 로그인할 수 없습니다(501). 관리자에게
              문의해 주세요.
            </p>
            {config.data.oidc_issuer ? (
              <p className="text-of-muted">발급자: {config.data.oidc_issuer}</p>
            ) : null}
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <div className="space-y-1.5">
              <label htmlFor="login-email" className="text-xs font-medium text-of-muted">
                이메일
              </label>
              <Input
                id="login-email"
                type="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </div>
            {failText ? (
              <p role="alert" className="text-xs text-of-danger">
                {failText}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={!email.trim() || login.isPending}>
              <LogIn size={14} /> 로그인
            </Button>
            <p className="text-[11px] text-of-muted">
              개발 모드 로그인 — 사용자 디렉터리에 등록된 이메일로 로그인합니다(비밀번호
              없음).
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
