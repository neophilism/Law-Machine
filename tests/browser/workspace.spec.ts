import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('credential-free shell and health route work', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('See how a law works.');
  await expect(page.getByText('No actual filings are accepted.', { exact: false })).toBeVisible();
  const response = await request.get('/api/health');
  expect((await response.json()).simulationAvailable).toBe(false);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
