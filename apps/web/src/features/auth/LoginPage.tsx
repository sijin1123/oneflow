import * as Dialog from '@radix-ui/react-dialog'
import {
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  Globe2,
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

import oneflowRibbonMark from '@/assets/brand/oneflow-ribbon-mark.svg'
import loginJourney from '@/assets/generated/oneflow-login-watercolor-compact-v3.jpg'
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

import {
  oidcStartUrl,
  useAuthAssistance,
  useAuthConfig,
  useLogin,
  type OidcProvider,
} from './api'
import { oidcErrorKey } from './oidc'
import './LoginPage.css'

type Locale = 'en' | 'ko'
type AssistanceNoticeKind = 'forgot' | 'request'
type InformationNoticeKind = 'google' | 'microsoft' | 'sso' | 'terms' | 'privacy' | 'security'
type NoticeKind = AssistanceNoticeKind | InformationNoticeKind

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
    passwordProvider: 'Use the identity provider below',
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
    oidcUnavailable: 'Local credentials are unavailable in SSO mode. No usable identity provider is configured.',
    oidcAvailable: 'Local credentials are unavailable. Continue with the configured identity provider below.',
    providerHelp: 'Each sign-in option announces whether it is configured for this deployment.',
    providerConfigured: 'configured',
    providerUnavailable: 'not configured',
    oauthInvalidState: 'Your sign-in session expired or was already used. Start again.',
    oauthCancelled: 'Sign-in was cancelled at the identity provider.',
    oauthProviderError: 'The identity provider could not complete sign-in. Try again or contact your administrator.',
    oauthInvalidResponse: 'The identity provider returned an incomplete response. Start again.',
    oauthAccountUnavailable: 'This account is not active or provisioned in Oneflow. Request workspace access.',
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
    passwordProvider: '아래 인증 공급자를 사용하세요',
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
    oidcUnavailable: 'SSO 모드에서는 로컬 계정을 사용할 수 없습니다. 사용 가능한 인증 공급자가 구성되지 않았습니다.',
    oidcAvailable: '로컬 계정은 사용할 수 없습니다. 아래에 구성된 인증 공급자로 계속하세요.',
    providerHelp: '각 로그인 옵션은 이 배포 환경의 구성 여부를 안내합니다.',
    providerConfigured: '구성됨',
    providerUnavailable: '구성되지 않음',
    oauthInvalidState: '로그인 세션이 만료됐거나 이미 사용되었습니다. 다시 시작하세요.',
    oauthCancelled: '인증 공급자에서 로그인이 취소되었습니다.',
    oauthProviderError: '인증 공급자가 로그인을 완료하지 못했습니다. 다시 시도하거나 관리자에게 문의하세요.',
    oauthInvalidResponse: '인증 공급자가 불완전한 응답을 반환했습니다. 다시 시작하세요.',
    oauthAccountUnavailable: '이 계정은 Oneflow에 등록되지 않았거나 비활성 상태입니다. 접근을 요청하세요.',
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
      <img className="of-login-brand-mark" src={oneflowRibbonMark} alt="" aria-hidden="true" />
      <span>
        <strong>oneflow</strong>
        {!compact ? <small>project management system</small> : null}
      </span>
    </div>
  )
}

const kanbanColumns = [
  { name: 'To do', count: 3, tasks: [['Design new landing page', 'UI/UX', '1']] },
  {
    name: 'In Progress',
    count: 2,
    tasks: [
      ['Implement OAuth flow', 'Backend', '2'],
      ['Create dashboard charts', 'Data', '3'],
    ],
  },
  {
    name: 'Review',
    count: 2,
    tasks: [
      ['Review PR #124', '', '4'],
      ['Fix mobile layout issue', 'Bug', '5'],
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
                  <span className="of-login-mini-avatar" data-avatar={avatar} />
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
        <li><span className="of-login-mini-avatar" data-avatar="1" /><p><b>Sarah updated task</b><small>Design system v2</small></p><time>2m ago</time></li>
        <li><CheckCircle2 aria-hidden="true" /><p><b>Mike completed</b><small>API rate limiting</small></p><time>15m ago</time></li>
        <li><span className="of-login-mini-avatar" data-avatar="5" /><p><b>Priya commented on</b><small>Project roadmap</small></p><time>1h ago</time></li>
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
        <h1 id="login-story-title">
          <span className="of-login-story-line">Plan. Flow. Deliver.</span>
          <span>Together.</span>
        </h1>
        <p>Oneflow helps teams plan, collaborate,<br />and ship great work—seamlessly.</p>
      </div>
      <div className="of-login-story-widgets" aria-hidden="true">
        <KanbanCard />
        <CalendarCard />
        <ActivityCard />
        <ProgressCard />
        <div className="of-login-collaboration">
          <svg className="of-login-collaboration-route" viewBox="0 0 184 171" aria-hidden="true">
            <path className="of-login-collaboration-route-base" d="M151 18C177 34 181 61 162 82C145 101 116 103 91 116C66 129 57 148 28 153" />
            <path className="of-login-collaboration-route-flow" d="M151 18C177 34 181 61 162 82C145 101 116 103 91 116C66 129 57 148 28 153" />
          </svg>
          <span className="is-s">S</span>
          <span className="is-m">M</span>
          <p>Great work! <Rocket aria-hidden="true" /></p>
        </div>
        <blockquote><span className="of-login-quote-mark">∿</span><p>Oneflow keeps our projects<br />organized and our team in sync.</p><cite>— Product Team</cite></blockquote>
      </div>
    </section>
  )
}

function ProviderGlyph({ provider }: { provider: OidcProvider }) {
  if (provider === 'google') return <span className="of-login-google" aria-hidden="true">G</span>
  if (provider === 'microsoft') return <span className="of-login-microsoft" aria-hidden="true"><i /><i /><i /><i /></span>
  return <Building2 aria-hidden="true" />
}

function NoticeDialog({ kind, locale, close }: { kind: InformationNoticeKind | null; locale: Locale; close: () => void }) {
  const isKorean = locale === 'ko'
  const details: Record<InformationNoticeKind, { title: string; body: string }> = {
    google: { title: 'Google sign-in', body: isKorean ? 'Google OAuth 공급자가 아직 구성되지 않았습니다.' : 'Google OAuth is not configured for this deployment.' },
    microsoft: { title: 'Microsoft sign-in', body: isKorean ? 'Microsoft Entra 공급자가 아직 구성되지 않았습니다.' : 'Microsoft Entra is not configured for this deployment.' },
    sso: {
      title: 'Organization SSO',
      body: isKorean
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
            <Dialog.Close className="of-login-dialog-close" aria-label={isKorean ? '닫기' : 'Close'}><X aria-hidden="true" /></Dialog.Close>
          </Dialog.Content>
        ) : null}
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function AssistanceDialog({
  kind,
  locale,
  initialEmail,
  close,
}: {
  kind: AssistanceNoticeKind
  locale: Locale
  initialEmail: string
  close: () => void
}) {
  const assistance = useAuthAssistance()
  const [contactEmail, setContactEmail] = useState(() => initialEmail.trim().toLowerCase())
  const [reason, setReason] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const isKorean = locale === 'ko'
  const isAccess = kind === 'request'
  const labels = isKorean
    ? {
        title: isAccess ? '워크스페이스 접근 요청' : '로그인 도움 요청',
        body: isAccess
          ? '회사 이메일과 필요한 접근 내용을 보내면 워크스페이스 관리자가 검토합니다.'
          : 'OneFlow는 인증 공급자가 관리하는 비밀번호를 직접 초기화하지 않습니다. 계정 접근에 도움이 필요하면 관리자 검토를 요청하세요.',
        email: '회사 이메일',
        reason: '도움이 필요한 내용 (선택)',
        reasonPlaceholder: isAccess ? '소속 팀과 접근 목적을 알려주세요' : '로그인 방식이나 발생한 문제를 알려주세요',
        submit: '요청 보내기',
        submitting: '요청 보내는 중',
        successTitle: '요청을 접수했습니다',
        successBody: '지원 가능한 요청이면 워크스페이스 관리자가 확인합니다.',
        invalidEmail: '올바른 이메일 주소를 입력하세요.',
        error: '요청을 보내지 못했습니다. 잠시 후 다시 시도하세요.',
        done: '완료',
        close: '닫기',
      }
    : {
        title: isAccess ? 'Request workspace access' : 'Request sign-in help',
        body: isAccess
          ? 'Send your company email and access context for a workspace administrator to review.'
          : 'OneFlow cannot reset passwords owned by your identity provider. Request an administrator review if you need help accessing your account.',
        email: 'Company email',
        reason: 'What do you need help with? (optional)',
        reasonPlaceholder: isAccess ? 'Tell us your team and why you need access' : 'Describe the sign-in method or problem',
        submit: 'Send request',
        submitting: 'Sending request',
        successTitle: 'Request received',
        successBody: 'If assistance is available, a workspace administrator will review your request.',
        invalidEmail: 'Enter a valid email address.',
        error: 'We could not submit the request. Try again shortly.',
        done: 'Done',
        close: 'Close',
      }

  const submit = () => {
    const normalizedEmail = contactEmail.trim().toLowerCase()
    if (!EMAIL_RE.test(normalizedEmail)) {
      setValidationError(labels.invalidEmail)
      return
    }
    setValidationError(null)
    assistance.mutate({
      kind: isAccess ? 'workspace_access' : 'sign_in_help',
      email: normalizedEmail,
      reason: reason.trim() || undefined,
    })
  }

  const requestError = assistance.isError
    ? assistance.error instanceof ApiError && assistance.error.status === 422
      ? labels.invalidEmail
      : labels.error
    : null

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) close() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="of-login-dialog-overlay" />
        <Dialog.Content className="of-login-dialog-content of-login-assistance-dialog">
          {assistance.isSuccess ? (
            <div className="of-login-assistance-success" role="status">
              <CheckCircle2 aria-hidden="true" />
              <Dialog.Title>{labels.successTitle}</Dialog.Title>
              <Dialog.Description>{labels.successBody}</Dialog.Description>
              <button type="button" className="of-login-dialog-primary" onClick={close}>{labels.done}</button>
            </div>
          ) : (
            <>
              <Dialog.Title>{labels.title}</Dialog.Title>
              <Dialog.Description>{labels.body}</Dialog.Description>
              <form className="of-login-assistance-form" onSubmit={(event) => { event.preventDefault(); submit() }} noValidate>
                <label className="of-login-dialog-field" htmlFor="assistance-email">
                  <span>{labels.email}</span>
                  <span className="of-login-dialog-input-wrap">
                    <Mail aria-hidden="true" />
                    <input
                      id="assistance-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      maxLength={255}
                      required
                      autoFocus
                      value={contactEmail}
                      disabled={assistance.isPending}
                      aria-invalid={Boolean(validationError || requestError)}
                      aria-describedby={validationError || requestError ? 'assistance-help assistance-error' : 'assistance-help'}
                      onChange={(event) => { setContactEmail(event.target.value); setValidationError(null); assistance.reset() }}
                    />
                  </span>
                </label>
                <label className="of-login-dialog-field" htmlFor="assistance-reason">
                  <span>{labels.reason}</span>
                  <textarea
                    id="assistance-reason"
                    maxLength={1000}
                    rows={3}
                    value={reason}
                    placeholder={labels.reasonPlaceholder}
                    disabled={assistance.isPending}
                    onChange={(event) => { setReason(event.target.value); assistance.reset() }}
                  />
                </label>
                <p id="assistance-help" className="of-login-dialog-help">{labels.successBody}</p>
                {validationError || requestError ? <p id="assistance-error" className="of-login-dialog-error" role="alert">{validationError ?? requestError}</p> : null}
                <button type="submit" className="of-login-dialog-primary" disabled={assistance.isPending || !contactEmail.trim()} aria-busy={assistance.isPending}>
                  {assistance.isPending ? <Loader2 className="of-login-spinner" aria-hidden="true" /> : <Mail aria-hidden="true" />}
                  {assistance.isPending ? labels.submitting : labels.submit}
                </button>
              </form>
            </>
          )}
          <Dialog.Close className="of-login-dialog-close" aria-label={labels.close}><X aria-hidden="true" /></Dialog.Close>
        </Dialog.Content>
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
  const [redirectingProvider, setRedirectingProvider] = useState<OidcProvider | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const emailInputRef = useRef<HTMLInputElement>(null)
  const forgotButtonRef = useRef<HTMLButtonElement>(null)
  const requestAccessButtonRef = useRef<HTMLButtonElement>(null)
  const redirectingRef = useRef(false)
  const [locale, setLocale] = useState<Locale>(() => {
    const stored = window.localStorage.getItem(LOGIN_LOCALE_KEY)
    return stored === 'ko' ? 'ko' : 'en'
  })
  const text = copy[locale]

  useEffect(() => {
    window.localStorage.setItem(LOGIN_LOCALE_KEY, locale)
  }, [locale])

  const authMode = config.data?.auth_mode
  const oidcProvider = config.data?.oidc_provider
  const oidcProviders = config.data?.oidc_providers ?? (oidcProvider ? [oidcProvider] : [])
  const oidcReady = authMode === 'oidc' && config.data?.oidc_login_enabled === true && oidcProviders.length > 0
  const isOidcProviderConfigured = (provider: OidcProvider) =>
    authMode === 'oidc' && config.data?.oidc_login_enabled === true && oidcProviders.includes(provider)
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
  const oauthErrorCode = oidcErrorKey(searchParams.get('auth_error'))
  const oauthError = oauthErrorCode ? text[oauthErrorCode] : null
  const assistanceNotice = notice === 'forgot' || notice === 'request' ? notice : null
  const informationNotice = notice && notice !== 'forgot' && notice !== 'request' ? notice : null

  const closeAssistance = (kind: AssistanceNoticeKind) => {
    const trigger = kind === 'forgot' ? forgotButtonRef.current : requestAccessButtonRef.current
    setNotice(null)
    window.requestAnimationFrame(() => trigger?.focus({ preventScroll: true }))
  }

  const startProvider = (provider: OidcProvider) => {
    if (!isOidcProviderConfigured(provider)) {
      setNotice(provider)
      return
    }
    if (redirectingRef.current) return
    redirectingRef.current = true
    setRedirectingProvider(provider)
    const destination = oidcStartUrl(provider, safeNextLocation(searchParams.get('next')))
    window.requestAnimationFrame(() => window.location.assign(destination))
  }

  return (
    <div className="of-login-canvas">
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
          {authMode === 'oidc' ? <p className="of-login-mode-note"><ShieldCheck aria-hidden="true" />{oidcReady ? text.oidcAvailable : text.oidcUnavailable}</p> : null}
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
                  placeholder={authMode === 'oidc' ? text.passwordProvider : passwordRequired ? text.passwordPlaceholder : text.passwordNotRequired}
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
              <button ref={forgotButtonRef} type="button" className="of-login-link" onClick={() => setNotice('forgot')}>{text.forgot}</button>
            </div>

            {oauthError ? <p className="of-login-oauth-error" role="alert"><ShieldCheck aria-hidden="true" />{oauthError}</p> : null}
            {errorText ? <p id="login-auth-error" className="of-login-error" role="alert">{errorText}</p> : null}
            <Button type="submit" className="of-login-submit" disabled={!formEnabled || !email.trim() || (passwordRequired && !password) || login.isPending} aria-busy={login.isPending}>
              {login.isPending ? <Loader2 className="of-login-spinner" aria-hidden="true" /> : null}
              {login.isPending ? text.signingIn : text.signIn}
            </Button>

            <div className="of-login-divider"><span />{text.or}<span /></div>
            <div className="of-login-providers">
              {(['google', 'microsoft', 'sso'] as const).map((provider) => {
                const available = isOidcProviderConfigured(provider)
                const redirecting = redirectingProvider === provider
                return (
                  <button
                    key={provider}
                    type="button"
                    className="of-login-provider-button"
                    aria-describedby="login-provider-help"
                    aria-label={`${provider === 'google' ? text.google : provider === 'microsoft' ? text.microsoft : text.sso}, ${available ? text.providerConfigured : text.providerUnavailable}`}
                    data-availability={available ? 'configured' : 'unconfigured'}
                    data-redirecting={redirecting || undefined}
                    disabled={Boolean(redirectingProvider)}
                    aria-busy={redirecting}
                    onClick={() => startProvider(provider)}
                  >
                    <ProviderGlyph provider={provider} />
                    {provider === 'google' ? text.google : provider === 'microsoft' ? text.microsoft : text.sso}
                  </button>
                )
              })}
            </div>

            <p className="of-login-create">{text.newTo} <button ref={requestAccessButtonRef} type="button" onClick={() => setNotice('request')}>{text.request}</button></p>
            <p className="of-login-assistive" id="login-auth-help">
              {authMode === 'oidc'
                ? oidcReady ? text.oidcAvailable : text.oidcUnavailable
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
      </div>
      {assistanceNotice ? (
        <AssistanceDialog
          key={assistanceNotice}
          kind={assistanceNotice}
          locale={locale}
          initialEmail={email}
          close={() => closeAssistance(assistanceNotice)}
        />
      ) : null}
      <NoticeDialog kind={informationNotice} locale={locale} close={() => setNotice(null)} />
    </div>
  )
}
