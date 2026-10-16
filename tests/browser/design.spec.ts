import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('preview tabs, explanation dialog, keyboard focus and accessibility', async ({ page }) => {
  await page.goto('/design');
  await expect(page.getByRole('heading', {level:1})).toHaveText('A clearer path through the law.');
  await expect(page.getByText('Hypothetical example')).toBeVisible();
  const first = page.getByRole('tab', {name:'Follow a claim'});
  const middle = page.getByRole('tab', {name:'Explore institutions'});
  const last = page.getByRole('tab', {name:'Inspect sources'});
  await first.focus();
  await first.press('ArrowRight');
  await expect(middle).toBeFocused();
  await expect(middle).toHaveAttribute('aria-selected','true');
  await middle.press('End');
  await expect(last).toBeFocused();
  await expect(page.getByText('Source unavailable:', {exact:false})).toBeVisible();
  const trigger = page.getByRole('button', {name:'What am I seeing?'});
  await trigger.click();
  const dialog = page.getByRole('dialog', {name:'About this preview'});
  await expect(dialog).toBeVisible();
  await expect(new AxeBuilder({ page }).analyze()).resolves.toHaveProperty('violations', []);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(page.getByRole('button', {name:'Run simulation'})).toBeDisabled();
});

test('mobile/reduced-motion layout remains readable and keyboard usable', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/design');
  await expect(page.getByRole('tab', {name:'Follow a claim'})).toBeVisible();
  await expect(page.getByText('No actual filings are accepted.',{exact:false})).toBeVisible();
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflows).toBe(false);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
