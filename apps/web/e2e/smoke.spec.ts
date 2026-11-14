import { expect, test } from '@playwright/test'

test('home page renders', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Ant Thing' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open dashboard' })).toBeVisible()
  await expect(page).toHaveScreenshot('home.png', { fullPage: true })
})

test('unknown route returns a 404 with the not-found page', async ({ page }) => {
  const res = await page.goto('/this-page-does-not-exist')
  expect(res?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: '404' })).toBeVisible()
  await expect(page).toHaveScreenshot('not-found.png', { fullPage: true })
})
