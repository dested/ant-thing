// demo: the template Post demo's flow; deleted by `bun run demo:drop`.
import { expect, test } from '@playwright/test'

test('the Post demo creates and lists a post, flagged as a template', async ({ page }) => {
  await page.goto('/dashboard')

  await expect(page.getByText('Template demo · delete before shipping')).toBeVisible()
  await page.getByLabel('Title').fill('Hello world')
  await page.getByLabel('Content').fill('My first post on the new stack.')
  await page.getByRole('button', { name: 'Post' }).click()
  await expect(page.getByText('My first post on the new stack.')).toBeVisible()

  // A hard reload server-renders the list (posts.list prefetched in the loader).
  await page.reload()
  await expect(page.getByText('My first post on the new stack.')).toBeVisible()
})
