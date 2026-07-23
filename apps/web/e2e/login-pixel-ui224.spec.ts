import { expect, test, type Page } from '@playwright/test'

const evidenceRoot = '../../docs/screenshots/redevelopment/login-origin-pixel-parity-ui-224'

async function mockLoginConfig(page: Page) {
  await page.route('**/api/v1/auth/config', (route) => route.fulfill({
    json: {
      auth_mode: 'dev',
      oidc_issuer: null,
      oidc_client_id: null,
      has_client_secret: false,
      command_palette_enabled: false,
      session_management_enabled: true,
      password_required: true,
    },
  }))
}

async function waitForLoginArtwork(page: Page) {
  await page.locator('.of-login-story-art, .of-login-brand-reference img, .of-login-origin-reference-layer img').evaluateAll(
    async (images) => {
      await Promise.all(images.map((image) => (image as HTMLImageElement).decode()))
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      )
    },
  )
}

test('UI-224 로그인 원본 좌표 baseline을 lossless PNG로 고정한다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockLoginConfig(page)

  await page.setViewportSize({ width: 1448, height: 1086 })
  await page.goto('/login')
  await waitForLoginArtwork(page)
  await page.screenshot({ path: `${evidenceRoot}/baseline-desktop-1448x1086.png` })

  const exactGeometry = await page.evaluate(() => {
    const read = (selector: string) => {
      const element = document.querySelector(selector) as HTMLElement | null
      if (!element) throw new Error(`Missing login element: ${selector}`)
      const rect = element.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }
    const style = (selector: string) => {
      const element = document.querySelector(selector) as HTMLElement | null
      if (!element) throw new Error(`Missing login element: ${selector}`)
      const computed = getComputedStyle(element)
      return {
        backgroundColor: computed.backgroundColor,
        borderColor: computed.borderColor,
      }
    }
    return {
      viewport: { width: innerWidth, height: innerHeight },
      page: read('.of-login-page'),
      story: read('.of-login-story-art'),
      auth: read('.of-login-auth'),
      card: read('.of-login-auth-card'),
      logo: read('.of-login-brand-reference img'),
      colors: {
        auth: style('.of-login-auth'),
        card: style('.of-login-auth-card'),
        input: style('.of-login-input'),
      },
      scroll: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      },
    }
  })
  expect(exactGeometry).toEqual({
    viewport: { width: 1448, height: 1086 },
    page: { x: 0, y: 0, width: 1448, height: 1086 },
    story: { x: 0, y: 0, width: 792, height: 1086 },
    auth: { x: 792, y: 0, width: 656, height: 1086 },
    card: { x: 852, y: 70, width: 523, height: 892 },
    logo: { x: 1011, y: 100, width: 205, height: 70 },
    colors: {
      auth: { backgroundColor: 'rgba(0, 0, 0, 0)', borderColor: 'rgb(16, 26, 51)' },
      card: { backgroundColor: 'rgba(0, 0, 0, 0)', borderColor: 'rgba(0, 0, 0, 0)' },
      input: { backgroundColor: 'rgba(0, 0, 0, 0)', borderColor: 'rgba(0, 0, 0, 0)' },
    },
    scroll: { width: 1448, height: 1086 },
  })

  await page.setViewportSize({ width: 1280, height: 720 })
  await page.reload()
  await waitForLoginArtwork(page)
  await page.screenshot({ path: `${evidenceRoot}/baseline-compact-1280x720.png` })
  const compact = await page.locator('.of-login-page').boundingBox()
  expect(compact).toEqual({ x: 160, y: 0, width: 960, height: 720 })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await waitForLoginArtwork(page)
  await page.screenshot({
    path: `${evidenceRoot}/baseline-mobile-390x844.png`,
    fullPage: true,
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
})

test('UI-224 로그인 픽셀 수정은 실제 인증 상호작용을 보존한다', async ({ page }) => {
  await mockLoginConfig(page)
  await page.route('**/api/v1/auth/login', (route) =>
    route.fulfill({ json: { user_id: 'user-1', email: 'user@example.com', display_name: 'User' } }),
  )
  await page.goto('/login')

  const email = page.getByLabel('Email address')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Enter your email address.')
  await expect(email).toBeFocused()

  await email.fill('user@example.com')
  const password = page.locator('#login-password')
  await password.fill('secret')
  await page.getByRole('button', { name: 'Show password' }).click()
  await expect(password).toHaveAttribute('type', 'text')

  await page.getByRole('button', { name: 'Forgot password?' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByRole('button', { name: 'Choose language' }).click()
  await page.getByRole('menuitemradio', { name: '한국어' }).click()
  await expect(page.getByRole('heading', { name: /다시 만나 반가워요/ })).toBeVisible()
})
