import { expect, test, type Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

const evidenceRoot = '../../docs/screenshots/redevelopment/login-approved-origin-ui-227'

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

async function waitForReference(page: Page) {
  await page.locator('.of-login-origin-reference-layer img').evaluate(
    async (image) => {
      await (image as HTMLImageElement).decode()
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    },
  )
}

async function captureReferenceAt(page: Page, width: number, height: number) {
  const source = await page.locator('.of-login-origin-reference-layer img').evaluate(
    (image) => (image as HTMLImageElement).currentSrc,
  )
  const referencePage = await page.context().newPage()
  await referencePage.setViewportSize({ width, height })
  await referencePage.setContent(`
    <style>html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden}img{display:block;width:${width}px;height:${height}px}</style>
    <img src="${source}" width="${width}" height="${height}" alt="">
  `)
  const reference = referencePage.locator('img')
  await reference.evaluate(async (image) => (image as HTMLImageElement).decode())
  const screenshot = await reference.screenshot()
  await referencePage.close()
  return screenshot
}

async function compareScreenshots(page: Page, actualScreenshot: Buffer, approvedScreenshot: Buffer, width: number, height: number) {
  return page.evaluate(async ({ actualBase64, approvedBase64, width: targetWidth, height: targetHeight }) => {
    const load = async (source: string) => {
      const image = new Image()
      image.src = source
      await image.decode()
      return image
    }
    const runtime = await load(`data:image/png;base64,${actualBase64}`)
    const reference = await load(`data:image/png;base64,${approvedBase64}`)

    const read = (image: CanvasImageSource) => {
      const canvas = document.createElement('canvas')
      canvas.width = targetWidth
      canvas.height = targetHeight
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('Canvas 2D context is unavailable')
      context.drawImage(image, 0, 0, targetWidth, targetHeight)
      return context.getImageData(0, 0, targetWidth, targetHeight).data
    }

    const actual = read(runtime)
    const approved = read(reference)
    let absolute = 0
    let squared = 0
    let changedOverTwo = 0
    let maxChannel = 0
    for (let index = 0; index < actual.length; index += 4) {
      let pixelMax = 0
      for (let channel = 0; channel < 3; channel += 1) {
        const delta = Math.abs(actual[index + channel] - approved[index + channel])
        absolute += delta
        squared += delta * delta
        pixelMax = Math.max(pixelMax, delta)
        maxChannel = Math.max(maxChannel, delta)
      }
      if (pixelMax > 2) changedOverTwo += 1
    }
    const channelCount = targetWidth * targetHeight * 3
    const pixelCount = targetWidth * targetHeight
    return {
      width: targetWidth,
      height: targetHeight,
      mae: Number((absolute / channelCount).toFixed(4)),
      rms: Number(Math.sqrt(squared / channelCount).toFixed(4)),
      changed_over_2_pct: Number(((changedOverTwo / pixelCount) * 100).toFixed(4)),
      max_channel_delta: maxChannel,
    }
  }, {
    actualBase64: actualScreenshot.toString('base64'),
    approvedBase64: approvedScreenshot.toString('base64'),
    width,
    height,
  })
}

test('UI-227 승인 원본 layer는 native와 compact idle frame을 같은 픽셀 경로로 그린다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockLoginConfig(page)

  await page.setViewportSize({ width: 1448, height: 1086 })
  await page.goto('/login')
  await waitForReference(page)
  const referenceLayer = page.locator('.of-login-origin-reference-layer')
  await expect(referenceLayer).toBeVisible()
  await expect(referenceLayer).toHaveCSS('pointer-events', 'none')
  await expect(page.getByLabel('Email address')).toBeEnabled()
  const native = await page.locator('.of-login-page').screenshot({
    path: `${evidenceRoot}/desktop-1448x1086.png`,
  })
  const nativeReference = await captureReferenceAt(page, 1448, 1086)
  await writeFile(
    new URL('../../../docs/screenshots/redevelopment/login-approved-origin-ui-227/approved-native.png', import.meta.url),
    nativeReference,
  )
  const nativeMetrics = await compareScreenshots(page, native, nativeReference, 1448, 1086)
  expect(nativeMetrics.mae).toBeLessThanOrEqual(0.02)
  expect(nativeMetrics.changed_over_2_pct).toBeLessThanOrEqual(0.02)

  await page.setViewportSize({ width: 1280, height: 720 })
  await page.reload()
  await waitForReference(page)
  await expect(page.locator('.of-login-page')).toHaveCSS('width', '960px')
  const compact = await page.locator('.of-login-page').screenshot({
    path: `${evidenceRoot}/compact-1280x720.png`,
  })
  const compactReference = await captureReferenceAt(page, 960, 720)
  await writeFile(
    new URL('../../../docs/screenshots/redevelopment/login-approved-origin-ui-227/approved-compact.png', import.meta.url),
    compactReference,
  )
  const compactMetrics = await compareScreenshots(page, compact, compactReference, 960, 720)
  expect(compactMetrics.mae).toBeLessThanOrEqual(0.02)
  expect(compactMetrics.changed_over_2_pct).toBeLessThanOrEqual(0.1)

  await writeFile(
    new URL('../../../docs/screenshots/redevelopment/login-approved-origin-ui-227/pixel-metrics.json', import.meta.url),
    `${JSON.stringify({ native: nativeMetrics, compact: compactMetrics }, null, 2)}\n`,
  )
})

test('UI-227 visual layer 위의 인증 controls는 입력·검증·provider·locale을 실제 처리한다', async ({ page }) => {
  await mockLoginConfig(page)
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/login')
  await waitForReference(page)

  const email = page.getByLabel('Email address')
  const password = page.locator('#login-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Enter your email address.')
  await expect(email).toBeFocused()

  await email.fill('user@example.com')
  await password.fill('secret')
  await expect(email).toHaveAttribute('data-has-value', 'true')
  await expect(password).toHaveAttribute('data-has-value', 'true')
  await page.getByRole('button', { name: 'Show password' }).click()
  await expect(password).toHaveAttribute('type', 'text')

  await page.getByRole('button', { name: /Continue with Google/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByRole('button', { name: 'Choose language' }).click()
  await page.getByRole('menuitemradio', { name: '한국어' }).click()
  await expect(page.getByRole('heading', { name: /다시 만나 반가워요/ })).toBeVisible()
  await expect(referenceLayer(page)).toBeHidden()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(referenceLayer(page)).toBeHidden()
  await expect(page.getByRole('heading', { name: /다시 만나 반가워요/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.screenshot({ path: `${evidenceRoot}/mobile-390x844.png`, fullPage: true })
})

function referenceLayer(page: Page) {
  return page.locator('.of-login-origin-reference-layer')
}
