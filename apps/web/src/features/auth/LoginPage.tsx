import * as Dialog from '@radix-ui/react-dialog'
import {
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  Globe2,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mail,
  MoreHorizontal,
  RefreshCw,
  Rocket,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import loginJourney from '@/assets/generated/oneflow-login-journey.jpg'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api'

import { useAuthConfig, useLogin } from './api'
import './LoginPage.css'

type Locale = 'en' | 'ko'
type NoticeKind = 'forgot' | 'request' | 'google' | 'microsoft' | 'sso' | 'terms' | 'privacy' | 'security'

const LOGIN_LOCALE_KEY = 'oneflow.login.locale'
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

const copy = {
  en: {
    welcome: 'Welcome back',
    subtitle: 'Sign in to continue to your workspace',
    email: 'Email address',
    password: 'Password',
    passwordPlaceholder: 'Enter your password',
    passwordNotRequired: 'Password is not required in this local environment',
    remember: 'Remember me',
    forgot: 'Forgot password?',
    signIn: 'Sign in',
    signingIn: 'Signing in',
    or: 'or',
    google: 'Continue with Google',
    microsoft: 'Continue with Microsoft',
    sso: 'Continue with SSO',
    newTo: 'New to Oneflow?',
    request: 'Request access',
    terms: 'Terms',
    privacy: 'Privacy',
    security: 'Security',
    status: 'Status',
    emailRequired: 'Enter your email address.',
    emailInvalid: 'Enter a valid email address.',
    passwordRequired: 'Enter your password.',
    genericError: 'We could not sign you in. Check your credentials and try again.',
    networkError: 'The sign-in request could not be completed. Try again shortly.',
    devNote: 'Protected local development sign-in',
    devHelp: 'Use an active directory account and the configured local password.',
    oidcUnavailable: 'Local credentials are unavailable in SSO mode. The configured organization sign-in callback is not enabled in this build.',
    providerHelp: 'Provider buttons explain which sign-in methods are available in this deployment.',
    unsupported: 'This authentication configuration is not supported. Contact your administrator.',
    configLoading: 'Checking sign-in options...',
    configError: 'Sign-in options could not be loaded.',
    retry: 'Retry',
    language: 'English',
  },
  ko: {
    welcome: '다시 만나 반가워요',
    subtitle: '워크스페이스에서 이어서 진행하세요',
    email: '이메일 주소',
    password: '비밀번호',
    passwordPlaceholder: '비밀번호를 입력하세요',
    passwordNotRequired: '현재 로컬 환경에서는 비밀번호가 필요하지 않습니다',
    remember: '로그인 상태 유지',
    forgot: '비밀번호를 잊으셨나요?',
    signIn: '로그인',
    signingIn: '로그인 중',
    or: '또는',
    google: 'Google로 계속',
    microsoft: 'Microsoft로 계속',
    sso: '회사 SSO로 계속',
    newTo: 'Oneflow가 처음인가요?',
    request: '접근 요청',
    terms: '이용약관',
    privacy: '개인정보',
    security: '보안',
    status: '상태',
    emailRequired: '이메일 주소를 입력하세요.',
    emailInvalid: '올바른 이메일 주소를 입력하세요.',
    passwordRequired: '비밀번호를 입력하세요.',
    genericError: '로그인할 수 없습니다. 계정 정보를 확인한 뒤 다시 시도하세요.',
    networkError: '로그인 요청을 완료하지 못했습니다. 잠시 후 다시 시도하세요.',
    devNote: '보호된 로컬 개발 로그인',
    devHelp: '활성 사용자 계정과 설정된 로컬 비밀번호를 사용합니다.',
    oidcUnavailable: 'SSO 모드에서는 로컬 계정을 사용할 수 없습니다. 구성된 조직 로그인 콜백은 이 빌드에서 아직 활성화되지 않았습니다.',
    providerHelp: '공급자 버튼에서 이 배포 환경에 사용할 수 있는 로그인 방식을 확인할 수 있습니다.',
    unsupported: '지원되지 않는 인증 구성입니다. 관리자에게 문의하세요.',
    configLoading: '로그인 방법을 확인하고 있어요...',
    configError: '로그인 방법을 불러오지 못했습니다.',
    retry: '다시 시도',
    language: '한국어',
  },
} as const

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

function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className="of-login-brand" data-compact={compact || undefined} aria-label="oneflow">
      <span className="of-login-brand-mark" aria-hidden="true">
        <span />
        <span />
      </span>
      <span>
        <strong>oneflow</strong>
        {!compact ? <small>project management system</small> : null}
      </span>
    </div>
  )
}

const kanbanColumns = [
  { name: 'To do', count: 3, tasks: [['Design new landing page', 'UI/UX', 'SA']] },
  {
    name: 'In Progress',
    count: 2,
    tasks: [
      ['Implement OAuth flow', 'Backend', 'MK'],
      ['Create dashboard charts', 'Data', 'PR'],
    ],
  },
  {
    name: 'Review',
    count: 2,
    tasks: [
      ['Review PR #124', '', 'AL'],
      ['Fix mobile layout issue', 'Bug', 'DU'],
    ],
  },
] as const

function KanbanCard() {
  return (
    <section className="of-login-kanban" aria-label="Kanban Board preview">
      <header>
        <strong>Kanban Board</strong>
        <MoreHorizontal aria-hidden="true" />
      </header>
      <div className="of-login-kanban-grid">
        {kanbanColumns.map((column) => (
          <div className="of-login-kanban-column" key={column.name}>
            <p>
              {column.name} <span>{column.count}</span>
            </p>
            {column.tasks.map(([title, tag, avatar]) => (
              <article key={title}>
                <strong>{title}</strong>
                <footer>
                  <span className="of-login-mini-avatar">{avatar}</span>
                  {tag ? <small data-tag={tag.toLowerCase()}>{tag}</small> : null}
                </footer>
              </article>
            ))}
          </div>
        ))}
      </div>
      <p className="of-login-add-card">+ Add card</p>
    </section>
  )
}

function CalendarCard() {
  const days = [28, 29, 30, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]
  return (
    <section className="of-login-calendar" aria-label="Upcoming calendar preview">
      <header>
        <strong>Upcoming</strong>
        <ChevronDown aria-hidden="true" />
      </header>
      <p>May 2025</p>
      <div className="of-login-weekdays" aria-hidden="true">
        {'MTWTFSS'.split('').map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
      </div>
      <div className="of-login-days" aria-hidden="true">
        {days.map((day, index) => (
          <span className={day === 15 && index > 6 ? 'is-selected' : index < 3 ? 'is-muted' : ''} key={`${day}-${index}`}>
            {day}
          </span>
        ))}
      </div>
    </section>
  )
}

function ActivityCard() {
  return (
    <section className="of-login-activity" aria-label="Team activity preview">
      <strong>Team activity</strong>
      <ul>
        <li><span className="of-login-mini-avatar is-lilac">SA</span><p><b>Sarah updated task</b><small>Design system v2</small></p><time>2m ago</time></li>
        <li><CheckCircle2 aria-hidden="true" /><p><b>Mike completed</b><small>API rate limiting</small></p><time>15m ago</time></li>
        <li><span className="of-login-mini-avatar is-coral">PR</span><p><b>Priya commented on</b><small>Project roadmap</small></p><time>1h ago</time></li>
      </ul>
      <p className="of-login-activity-link">View all activity <span aria-hidden="true">→</span></p>
    </section>
  )
}

function ProgressCard() {
  return (
    <section className="of-login-project-progress" aria-label="Project progress preview">
      <strong>Project progress</strong>
      <div className="of-login-progress-ring"><span>68%</span></div>
      <p><span /> On track</p>
    </section>
  )
}

function StoryPanel() {
  return (
    <section className="of-login-story" aria-labelledby="login-story-title">
      <img className="of-login-story-art" src={loginJourney} alt="Layered hills and a river connecting team milestones" />
      <div className="of-login-story-wash" aria-hidden="true" />
      <div className="of-login-story-copy">
        <BrandLockup />
        <h1 id="login-story-title">Plan. Flow. Deliver.<span>Together.</span></h1>
        <p>Oneflow helps teams plan, collaborate,<br />and ship great work—seamlessly.</p>
      </div>
      <div className="of-login-story-widgets" aria-hidden="true">
        <KanbanCard />
        <CalendarCard />
        <ActivityCard />
        <ProgressCard />
        <div className="of-login-collaboration">
          <span className="is-s">S</span>
          <span className="is-m">M</span>
          <p>Great work! <Rocket aria-hidden="true" /></p>
        </div>
        <blockquote><span className="of-login-quote-mark">∿</span><p>Oneflow keeps our projects<br />organized and our team in sync.</p><cite>— Product Team</cite></blockquote>
      </div>
    </section>
  )
}

function ProviderGlyph({ provider }: { provider: 'google' | 'microsoft' | 'sso' }) {
  if (provider === 'google') return <span className="of-login-google" aria-hidden="true">G</span>
  if (provider === 'microsoft') return <span className="of-login-microsoft" aria-hidden="true"><i /><i /><i /><i /></span>
  return <Building2 aria-hidden="true" />
}

function NoticeDialog({ kind, locale, ssoConfigured, close }: { kind: NoticeKind | null; locale: Locale; ssoConfigured: boolean; close: () => void }) {
  const isKorean = locale === 'ko'
  const details: Record<NoticeKind, { title: string; body: string }> = {
    forgot: {
      title: isKorean ? '비밀번호 복구' : 'Password recovery',
      body: isKorean
        ? '이 배포 환경에는 메일 기반 복구 공급자가 구성되지 않았습니다. 워크스페이스 관리자에게 비밀번호 초기화를 요청하세요.'
        : 'This deployment has no mail recovery provider configured. Ask your workspace administrator to reset your local credential.',
    },
    request: {
      title: isKorean ? '워크스페이스 접근 요청' : 'Request workspace access',
      body: isKorean
        ? '메일 앱을 열어 워크스페이스 관리자에게 접근 목적과 회사 이메일을 전달합니다.'
        : 'Open your mail app and send your workspace administrator your company email and reason for access.',
    },
    google: { title: 'Google sign-in', body: isKorean ? 'Google OAuth 공급자가 아직 구성되지 않았습니다.' : 'Google OAuth is not configured for this deployment.' },
    microsoft: { title: 'Microsoft sign-in', body: isKorean ? 'Microsoft Entra 공급자가 아직 구성되지 않았습니다.' : 'Microsoft Entra is not configured for this deployment.' },
    sso: {
      title: 'Organization SSO',
      body: ssoConfigured
        ? isKorean
          ? 'OIDC 공급자 구성은 확인됐지만 로그인 콜백은 이 빌드에서 아직 활성화되지 않았습니다.'
          : 'An OIDC provider is configured, but its sign-in callback is not enabled in this build.'
        : isKorean
          ? '조직 SSO 공급자가 이 배포 환경에 구성되지 않았습니다.'
          : 'An organization SSO provider is not configured for this deployment.',
    },
    terms: { title: isKorean ? '이용약관' : 'Terms of use', body: isKorean ? 'Oneflow는 승인된 사내 업무와 프로젝트 협업에만 사용합니다.' : 'Use Oneflow only for authorized internal work and project collaboration.' },
    privacy: { title: isKorean ? '개인정보 처리' : 'Privacy', body: isKorean ? '계정·프로젝트 활동 정보는 접근 제어와 감사 정책에 따라 처리됩니다.' : 'Account and project activity data is handled under workspace access and audit policies.' },
    security: { title: isKorean ? '보안' : 'Security', body: isKorean ? '로그인 세션은 HttpOnly 쿠키로 관리되며 구성되지 않은 인증 방식은 실패 폐쇄됩니다.' : 'Sessions use HttpOnly cookies and unconfigured authentication methods fail closed.' },
  }
  const current = kind ? details[kind] : null
  return (
    <Dialog.Root open={Boolean(kind)} onOpenChange={(open) => { if (!open) close() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="of-login-dialog-overlay" />
        {current ? (
          <Dialog.Content className="of-login-dialog-content">
            <Dialog.Title>{current.title}</Dialog.Title>
            <Dialog.Description>{current.body}</Dialog.Description>
            {kind === 'forgot' || kind === 'request' ? (
              <a
                className="of-login-dialog-action"
                href={`mailto:?subject=${encodeURIComponent(kind === 'forgot' ? 'Oneflow password recovery' : 'Oneflow workspace access request')}`}
              >
                <Mail aria-hidden="true" /> {isKorean ? '메일 앱 열기' : 'Open mail app'}
              </a>
            ) : null}
            <Dialog.Close className="of-login-dialog-close" aria-label={isKorean ? '닫기' : 'Close'}><X aria-hidden="true" /></Dialog.Close>
          </Dialog.Content>
        ) : null}
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function LoginPage() {
  const config = useAuthConfig()
  const login = useLogin()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [notice, setNotice] = useState<NoticeKind | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const emailInputRef = useRef<HTMLInputElement>(null)
  const [locale, setLocale] = useState<Locale>(() => {
    const stored = window.localStorage.getItem(LOGIN_LOCALE_KEY)
    return stored === 'ko' ? 'ko' : 'en'
  })
  const text = copy[locale]

  useEffect(() => {
    window.localStorage.setItem(LOGIN_LOCALE_KEY, locale)
  }, [locale])

  const authMode = config.data?.auth_mode
  const devEnabled = authMode === 'dev'
  const passwordRequired = devEnabled && Boolean(config.data?.password_required)
  const formEnabled = devEnabled && !config.isPending && !config.isError

  useEffect(() => {
    if (!formEnabled) return
    if (document.activeElement && document.activeElement !== document.body) return
    emailInputRef.current?.focus({ preventScroll: true })
  }, [formEnabled])

  const submit = () => {
    const value = email.trim().toLowerCase()
    if (!value) { setValidationError(text.emailRequired); return }
    if (!EMAIL_RE.test(value)) { setValidationError(text.emailInvalid); return }
    if (passwordRequired && !password) { setValidationError(text.passwordRequired); return }
    if (!formEnabled || login.isPending) return
    setValidationError(null)
    login.mutate(
      { email: value, password: passwordRequired ? password : undefined, remember_me: rememberMe },
      { onSuccess: () => navigate(safeNextLocation(searchParams.get('next')), { replace: true }) },
    )
  }

  const requestError = login.error instanceof ApiError
    ? login.error.status === 401 ? text.genericError : text.networkError
    : login.isError ? text.networkError : null
  const errorText = validationError ?? requestError

  return (
    <div className="of-login-page" data-locale={locale}>
      <StoryPanel />
      <main className="of-login-auth" aria-labelledby="login-title">
        <section className="of-login-auth-card">
          <div className="of-login-auth-brand"><BrandLockup compact /></div>
          <header className="of-login-heading">
            <h2 id="login-title">{text.welcome} <span role="img" aria-label="wave">👋</span></h2>
            <p>{text.subtitle}</p>
          </header>

          {config.isPending ? <p className="of-login-config-state" role="status"><Loader2 className="of-login-spinner" aria-hidden="true" /> {text.configLoading}</p> : null}
          {config.isError ? (
            <div className="of-login-config-state is-error" role="alert">
              <span>{text.configError}</span>
              <Button type="button" variant="outline" onClick={() => void config.refetch()}><RefreshCw aria-hidden="true" /> {text.retry}</Button>
            </div>
          ) : null}
          {authMode === 'oidc' ? <p className="of-login-mode-note"><ShieldCheck aria-hidden="true" />{text.oidcUnavailable}</p> : null}
          {authMode && authMode !== 'dev' && authMode !== 'oidc' ? <p className="of-login-mode-note is-error" role="alert">{text.unsupported}</p> : null}

          <form className="of-login-form" onSubmit={(event) => { event.preventDefault(); submit() }} noValidate>
            <div className="of-login-field">
              <label htmlFor="login-email">{text.email}</label>
              <span className="of-login-input-wrap">
                <Mail aria-hidden="true" />
                <Input
                  ref={emailInputRef}
                  id="login-email"
                  className="of-login-input"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={(event) => { setEmail(event.target.value); setValidationError(null); login.reset() }}
                  placeholder="you@company.com"
                  disabled={!formEnabled || login.isPending}
                  aria-invalid={Boolean(errorText)}
                  aria-describedby={errorText ? 'login-auth-help login-auth-error' : 'login-auth-help'}
                />
              </span>
            </div>

            <div className="of-login-field">
              <label htmlFor="login-password">{text.password}</label>
              <span className="of-login-input-wrap">
                <LockKeyhole aria-hidden="true" />
                <Input
                  id="login-password"
                  className="of-login-input has-action"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => { setPassword(event.target.value); setValidationError(null); login.reset() }}
                  placeholder={passwordRequired ? text.passwordPlaceholder : text.passwordNotRequired}
                  disabled={!formEnabled || !passwordRequired || login.isPending}
                  aria-invalid={Boolean(errorText && passwordRequired && !password)}
                />
                <button
                  type="button"
                  className="of-login-password-toggle"
                  onClick={() => setShowPassword((current) => !current)}
                  disabled={!formEnabled || !passwordRequired || login.isPending}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </button>
              </span>
            </div>

            <div className="of-login-form-options">
              <label className="of-login-checkbox">
                <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} disabled={!formEnabled || login.isPending} />
                <span><Check aria-hidden="true" /></span>{text.remember}
              </label>
              <button type="button" className="of-login-link" onClick={() => setNotice('forgot')}>{text.forgot}</button>
            </div>

            {errorText ? <p id="login-auth-error" className="of-login-error" role="alert">{errorText}</p> : null}
            <Button type="submit" className="of-login-submit" disabled={!formEnabled || !email.trim() || (passwordRequired && !password) || login.isPending} aria-busy={login.isPending}>
              {login.isPending ? <Loader2 className="of-login-spinner" aria-hidden="true" /> : <KeyRound aria-hidden="true" />}
              {login.isPending ? text.signingIn : text.signIn}
            </Button>

            <div className="of-login-divider"><span />{text.or}<span /></div>
            <div className="of-login-providers">
              {(['google', 'microsoft', 'sso'] as const).map((provider) => (
                <button
                  key={provider}
                  type="button"
                  className="of-login-provider-button"
                  aria-describedby="login-provider-help"
                  data-availability={provider === 'sso' && authMode === 'oidc' ? 'configured-pending' : 'unconfigured'}
                  onClick={() => setNotice(provider)}
                >
                  <ProviderGlyph provider={provider} />
                  {provider === 'google' ? text.google : provider === 'microsoft' ? text.microsoft : text.sso}
                </button>
              ))}
            </div>

            <p className="of-login-create">{text.newTo} <button type="button" onClick={() => setNotice('request')}>{text.request}</button></p>
            <p className="of-login-assistive" id="login-auth-help">
              {authMode === 'oidc'
                ? text.oidcUnavailable
                : authMode && authMode !== 'dev'
                  ? text.unsupported
                  : passwordRequired
                    ? `${text.devNote}. ${text.devHelp}`
                    : text.passwordNotRequired}
            </p>
            <p className="of-login-assistive" id="login-provider-help">{text.providerHelp}</p>
          </form>
        </section>

        <footer className="of-login-footer">
          <nav aria-label="Authentication policies">
            <button type="button" onClick={() => setNotice('terms')}>{text.terms}</button><span>•</span>
            <button type="button" onClick={() => setNotice('privacy')}>{text.privacy}</button><span>•</span>
            <button type="button" onClick={() => setNotice('security')}>{text.security}</button><span>•</span>
            <button type="button" onClick={() => navigate('/status')}>{text.status}</button>
          </nav>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="of-login-language" aria-label="Choose language"><Globe2 aria-hidden="true" />{text.language}<ChevronDown aria-hidden="true" /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="of-login-language-menu">
              <DropdownMenuRadioGroup value={locale} onValueChange={(value) => setLocale(value as Locale)}>
                <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="ko">한국어</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </footer>
      </main>
      <NoticeDialog kind={notice} locale={locale} ssoConfigured={authMode === 'oidc'} close={() => setNotice(null)} />
    </div>
  )
}
