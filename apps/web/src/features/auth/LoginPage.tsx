import {
  Building2,
  CheckCircle2,
  Loader2,
  LogIn,
  Mail,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import loginJourney from '@/assets/generated/oneflow-login-journey.jpg'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api'

import { useAuthConfig, useLogin } from './api'
import './LoginPage.css'

function safeNextLocation(next: string | null) {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/projects'
  try {
    const target = new URL(next, window.location.origin)
    if (target.origin !== window.location.origin) return '/projects'
    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return '/projects'
  }
}

function issuerHost(value: string | null) {
  if (!value) return null
  try {
    return new URL(value).host
  } catch {
    return value
  }
}

function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className="of-login-brand" data-compact={compact || undefined}>
      <span className="of-login-brand-mark" aria-hidden="true">
        <span>OF</span>
      </span>
      <span>
        <strong>OneFlow</strong>
        {!compact ? <small>project management system</small> : null}
      </span>
    </div>
  )
}

function StoryPanel() {
  return (
    <section className="of-login-story" aria-labelledby="login-story-title">
      <img className="of-login-story-art" src={loginJourney} alt="" />
      <div className="of-login-story-scrim" aria-hidden="true" />
      <div className="of-login-story-copy">
        <BrandLockup />
        <h1 id="login-story-title">
          계획을 흐름으로,
          <span>성과를 함께.</span>
        </h1>
        <p>팀의 우선순위와 실행을 한곳에서 연결하세요.</p>
      </div>

      <div className="of-login-flow-card" aria-label="이번 주 업무 흐름 예시">
        <div className="of-login-card-heading">
          <span>이번 주 흐름</span>
          <strong>18 / 24</strong>
        </div>
        <div className="of-login-progress-track" aria-hidden="true">
          <span />
        </div>
        <ul>
          <li>
            <span className="of-login-status-dot is-coral" />
            디자인 검토
            <small>오늘</small>
          </li>
          <li>
            <span className="of-login-status-dot is-blue" />
            API 통합
            <small>진행 중</small>
          </li>
          <li>
            <CheckCircle2 aria-hidden="true" />
            릴리스 준비
            <small>완료</small>
          </li>
        </ul>
      </div>

      <div className="of-login-team-note" aria-hidden="true">
        <span className="of-login-team-avatar">DU</span>
        <span>
          <strong>다음 단계가 선명해졌어요</strong>
          <small>프로젝트 업데이트 · 방금 전</small>
        </span>
      </div>
    </section>
  )
}

function LoadingState() {
  return (
    <div className="of-login-state" role="status" aria-live="polite">
      <Loader2 className="of-login-spinner" aria-hidden="true" />
      <strong>로그인 방법을 확인하고 있습니다</strong>
      <p>잠시만 기다려 주세요.</p>
    </div>
  )
}

function ConfigErrorState({ retry }: { retry: () => void }) {
  return (
    <div className="of-login-state" role="alert">
      <span className="of-login-state-icon is-error">
        <RefreshCw aria-hidden="true" />
      </span>
      <strong>로그인 정보를 불러오지 못했습니다</strong>
      <p>네트워크 상태를 확인한 뒤 다시 시도해 주세요.</p>
      <Button type="button" variant="outline" className="of-login-retry" onClick={retry}>
        <RefreshCw aria-hidden="true" /> 다시 시도
      </Button>
    </div>
  )
}

function OidcUnavailableState({ issuer }: { issuer: string | null }) {
  return (
    <div className="of-login-state" role="status">
      <span className="of-login-state-icon">
        <Building2 aria-hidden="true" />
      </span>
      <strong>조직 로그인이 준비 중입니다</strong>
      <p>현재 SSO 공급자 연결이 완료되지 않아 로그인할 수 없습니다.</p>
      {issuer ? (
        <dl className="of-login-provider">
          <div>
            <dt>인증 공급자</dt>
            <dd>{issuerHost(issuer)}</dd>
          </div>
        </dl>
      ) : null}
      <p className="of-login-admin-note">워크스페이스 관리자에게 연결 상태를 문의해 주세요.</p>
    </div>
  )
}

function UnsupportedAuthModeState() {
  return (
    <div className="of-login-state" role="alert">
      <span className="of-login-state-icon is-error">
        <ShieldCheck aria-hidden="true" />
      </span>
      <strong>지원되지 않는 로그인 구성입니다</strong>
      <p>보안을 위해 로그인을 중단했습니다. 워크스페이스 관리자에게 문의해 주세요.</p>
    </div>
  )
}

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
        navigate(safeNextLocation(searchParams.get('next')), { replace: true })
      },
    })
  }

  const failText =
    login.error instanceof ApiError
      ? login.error.status === 401
        ? '로그인할 수 없습니다. 이메일 주소를 확인해 주세요.'
        : '로그인 요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.'
      : login.isError
        ? '로그인 요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.'
        : null

  return (
    <div className="of-login-page">
      <StoryPanel />

      <main className="of-login-auth" aria-labelledby="login-title">
        <div className="of-login-auth-card">
          <div className="of-login-auth-brand">
            <BrandLockup compact />
          </div>
          <div className="of-login-heading">
            <p className="of-login-eyebrow">ONE WORKSPACE, ONE FLOW</p>
            <h2 id="login-title">다시 만나 반갑습니다</h2>
            <p>워크스페이스에서 이어서 진행하세요.</p>
          </div>

          <div className="of-login-auth-body">
            {config.isPending ? (
              <LoadingState />
            ) : config.isError ? (
              <ConfigErrorState retry={() => void config.refetch()} />
            ) : config.data?.auth_mode === 'oidc' ? (
              <OidcUnavailableState issuer={config.data.oidc_issuer} />
            ) : config.data?.auth_mode === 'dev' ? (
              <form
                className="of-login-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  submit()
                }}
              >
                <div className="of-login-field">
                  <label htmlFor="login-email">이메일 주소</label>
                  <div className="of-login-input-wrap">
                    <Mail aria-hidden="true" />
                    <Input
                      id="login-email"
                      className="of-login-input"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      autoFocus
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@company.com"
                      aria-describedby={
                        failText ? 'login-email-help login-email-error' : 'login-email-help'
                      }
                      aria-invalid={Boolean(failText)}
                    />
                  </div>
                </div>

                {failText ? (
                  <p id="login-email-error" role="alert" className="of-login-error">
                    {failText}
                  </p>
                ) : null}

                <Button
                  type="submit"
                  className="of-login-submit"
                  disabled={!email.trim() || login.isPending}
                  aria-busy={login.isPending}
                >
                  {login.isPending ? (
                    <Loader2 className="of-login-spinner" aria-hidden="true" />
                  ) : (
                    <LogIn aria-hidden="true" />
                  )}
                  {login.isPending ? '로그인 중' : '로그인'}
                </Button>

                <div className="of-login-dev-note" id="login-email-help">
                  <ShieldCheck aria-hidden="true" />
                  <span>
                    <strong>안전한 사내 개발 로그인</strong>
                    <small>사용자 디렉터리에 등록된 이메일로 비밀번호 없이 로그인합니다.</small>
                  </span>
                </div>
              </form>
            ) : (
              <UnsupportedAuthModeState />
            )}
          </div>
        </div>

        <p className="of-login-footnote">
          <ShieldCheck aria-hidden="true" /> 로그인 세션은 HttpOnly 쿠키로 관리됩니다.
        </p>
      </main>
    </div>
  )
}
