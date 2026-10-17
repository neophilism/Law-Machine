import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('real Chromium worker completes a source-labelled fictional trace without freezing navigation',async({page})=>{
  await page.goto('/worker-preview');
  await expect(page.getByRole('heading',{level:1})).toContainText('Simulation responsiveness');
  await page.getByRole('button',{name:'Run short fictional fixture'}).click();
  await expect(page.getByTestId('worker-status')).toHaveText('Completed 120 of 120 fictional events',{timeout:30000});
  await expect(page.getByTestId('worker-diagnostic')).toHaveText('');
  await expect(page.getByRole('link',{name:'Law Machine'})).toHaveAttribute('href','/');
  expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
});
test('cancelled generation cannot append events to a newer run',async({page})=>{
  await page.goto('/worker-preview');
  await page.getByRole('button',{name:'Run long fictional fixture'}).click();
  await expect(page.getByTestId('worker-status')).toContainText('Processing');
  await page.getByRole('button',{name:'Cancel current run'}).click();
  await expect(page.getByTestId('worker-status')).toHaveText('Run cancelled');
  await page.getByRole('button',{name:'Run short fictional fixture'}).click();
  await expect(page.getByTestId('worker-status')).toHaveText('Completed 120 of 120 fictional events',{timeout:30000});
  await page.waitForTimeout(250);
  await expect(page.getByTestId('worker-status')).toHaveText('Completed 120 of 120 fictional events');
});
