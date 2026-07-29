import { expect, test, type Page } from '@playwright/test'

const evidenceRoot = '../../docs/screenshots/redevelopment/login-live-controls-ui-308'

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

async function waitForArtwork(page: Page) {
  await page.locator('.of-login-story-art, .of-login-brand-reference img').evaluateAll(
    async (images) => {
      await Promise.all(images.map((image) => (image as HTMLImageElement).decode()))
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      )
    },
  )
}

test('UI-308 desktop login은 raster overlay 없이 실제 controls를 그린다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockLoginConfig(page)
  await page.setViewportSize({ width: 1448, height: 1086 })
  await page.goto('/login')
  await waitForArtwork(page)

  await expect(page.locator('.of-login-origin-reference-layer')).toHaveCount(0)
  await expect(page.locator('.of-login-story-art')).toBeVisible()
  await expect(page.locator('.of-login-story-art')).toHaveCSS('opacity', '1')
  await expect(page.locator('.of-login-auth-brand')).toHaveCSS('opacity', '1')
  await expect(page.locator('.of-login-heading')).toHaveCSS('opacity', '1')
  await expect(page.locator('.of-login-field > label').first()).toHaveCSS('opacity', '1')

  const email = page.getByLabel('Email address')
  const signIn = page.getByRole('button', { name: 'Sign in', exact: true })
  const google = page.getByRole('button', { name: /Continue with Google/ })
  await expect(email).toHaveCSS('background-color', 'rgb(254, 254, 254)')
  await expect(email).not.toHaveCSS('color', 'rgba(0, 0, 0, 0)')
  await expect(signIn).not.toHaveCSS('color', 'rgba(0, 0, 0, 0)')
  await expect(signIn).not.toHaveCSS('background-image', 'none')
  await expect(google).not.toHaveCSS('border-color', 'rgba(0, 0, 0, 0)')
  await expect(page.getByRole('button', { name: 'Forgot password?' })).toHaveCSS('opacity', '1')
  await expect(page.getByRole('button', { name: 'Choose language' })).toHaveCSS('opacity', '1')

  await email.click()
  await expect(email).toBeFocused()
  await email.fill('user@example.com')
  await expect(email).toHaveValue('user@example.com')
  await expect(email).not.toHaveCSS('color', 'rgba(0, 0, 0, 0)')

  await page.screenshot({ path: `${evidenceRoot}/desktop-1448x1086.png` })
})

test('UI-308 login controls는 typing, toggle, dialog, locale 상태를 가시적으로 처리한다', async ({ page }) => {
  await mockLoginConfig(page)
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/login')
  await waitForArtwork(page)

  const email = page.getByLabel('Email address')
  const password = page.getByLabel('Password', { exact: true })
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Enter your email address.')
  await expect(email).toBeFocused()

  await email.fill('user@example.com')
  await password.fill('secret')
  await page.getByRole('button', { name: 'Show password' }).click()
  await expect(password).toHaveAttribute('type', 'text')
  await expect(password).toHaveValue('secret')
  await page.getByRole('button', { name: 'Hide password' }).click()
  await expect(password).toHaveAttribute('type', 'password')

  const remember = page.getByRole('checkbox', { name: 'Remember me' })
  await remember.uncheck()
  await expect(remember).not.toBeChecked()
  await remember.check()
  await expect(remember).toBeChecked()

  await page.getByRole('button', { name: 'Forgot password?' }).click()
  await expect(page.getByRole('dialog', { name: 'Request sign-in help' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByRole('button', { name: /Continue with Google/ }).click()
  await expect(page.getByRole('dialog', { name: 'Google sign-in' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByRole('button', { name: 'Choose language' }).click()
  await page.getByRole('menuitemradio', { name: '한국어' }).click()
  await expect(page.getByRole('heading', { name: /다시 만나 반가워요/ })).toBeVisible()
  await expect(page.getByLabel('이메일 주소')).toHaveValue('user@example.com')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(page.getByRole('heading', { name: /다시 만나 반가워요/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: `${evidenceRoot}/mobile-390x844.png`, fullPage: true })
})
