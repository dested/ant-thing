import { expect, test } from '@playwright/test'

// First, while the database is empty: a colony that delivers in a later test adds a line to this page.
test('the puzzle list shows the built-in puzzles', async ({ page }) => {
  await page.goto('/puzzles')
  await expect(page.getByRole('link', { name: /Sofa in the hallway/ })).toBeVisible()
  await expect(page).toHaveScreenshot('puzzles.png', { fullPage: true })
})

test('the lab runs on the home page', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Piano movers' })).toBeVisible()
  await expect(page.getByLabel('The arena, seen from above')).toBeVisible()
  // The colony is live: ants find the load and start carrying it.
  await page.getByRole('button', { name: '64×' }).click()
  await expect(page.getByText('Carrying').locator('..').locator('dd')).not.toHaveText('0', {
    timeout: 30_000,
  })
  await expect(page.getByRole('heading', { name: 'What one ant does' })).toBeVisible()
})

test('a built puzzle is checked, published and playable', async ({ page }) => {
  await page.goto('/build')
  await expect(page.getByText('There is a way through')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('textbox', { name: 'Name' }).fill('Smoke test doorway')
  await page.getByRole('button', { name: 'Publish' }).click()
  await page.waitForURL(/\/p\/[a-z0-9]+$/, { timeout: 60_000 })
  await expect(page.getByRole('heading', { name: 'Smoke test doorway' })).toBeVisible()
})

test('unknown route returns a 404 with the not-found page', async ({ page }) => {
  const res = await page.goto('/this-page-does-not-exist')
  expect(res?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: 'Nothing here' })).toBeVisible()
  await expect(page).toHaveScreenshot('not-found.png', { fullPage: true })
})
