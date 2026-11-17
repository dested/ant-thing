import { expect, test } from '@playwright/test'

// Named to run after smoke.spec.ts: its first test screenshots the puzzle list while the database
// is empty, and a colony that delivers on the home page here would add a line to it.

test('a visitor joins a room holding the load, pulls it, and lets go', async ({ page }) => {
  await page.goto('/people')
  // A room's first round is the warm-up puzzle, and a newcomer arrives with a grip on the load.
  await expect(page.getByRole('heading', { name: 'Doorway' })).toBeVisible()
  const hold = page.getByRole('button', { name: 'Let go' }).last()
  await expect(hold).toBeEnabled()
  const round = page.getByText('Round', { exact: true }).locator('..').locator('dd')
  await expect(round).toHaveText('1')

  // The clock waits for the first pull.
  const clock = page.locator('aside p.font-display').first()
  await expect(clock).toHaveText('0:00')
  await page.keyboard.down('ArrowRight')
  await expect(clock).not.toHaveText('0:00', { timeout: 15_000 })
  await page.keyboard.up('ArrowRight')

  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Grab' }).last()).toBeVisible()
})

test('sound is off until it is turned on', async ({ page }) => {
  await page.goto('/people')
  const sound = page.getByRole('button', { name: 'Sound' }).last()
  await expect(sound).toHaveAttribute('aria-pressed', 'false')
  await sound.click()
  await expect(sound).toHaveAttribute('aria-pressed', 'true')
  // The choice is remembered in this browser.
  await page.reload()
  await expect(page.getByRole('button', { name: 'Sound' }).last()).toHaveAttribute(
    'aria-pressed',
    'true'
  )
})

test('the home page leads to the rooms and plots people against the colony', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'The people are whoever is here' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Minutes to get the load home' })).toBeVisible()
  await page.getByRole('link', { name: 'Join a room' }).click()
  await page.waitForURL(/\/people$/)
})
