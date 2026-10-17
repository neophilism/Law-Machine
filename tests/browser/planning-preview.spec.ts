import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('planning inventory exposes all 14 cases without misleading source claims',async({page})=>{
 await page.goto('/planning-preview');
 await expect(page.getByRole('heading',{level:1})).toHaveText('What might the model explore?');
 await expect(page.getByText('No verified legislative source is attached.')).toBeVisible();
 await expect(page.locator('.planning-list > li')).toHaveCount(14);
 await expect(page.getByText('source-anchored cases')).toBeVisible();
 await expect(page.getByRole('note')).toContainText('Nothing here can be executed');
 await expect(page.locator('meta[name=robots]')).toHaveAttribute('content',/noindex/);
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
});
test('deep links pin the hypothetical case and do not invent sources',async({page,request})=>{
 await page.goto('/planning-preview/complete-wrong-agency');
 await expect(page.getByRole('heading',{level:1})).toContainText('wrong agency');
 await expect(page.getByRole('heading',{name:'Unresolved source questions'})).toBeVisible();
 await expect(page.getByRole('note')).toContainText('No verified provision');
 await expect(page.getByRole('link',{name:'Back to planning inventory'})).toBeVisible();
 const bad=await request.get('/planning-preview/does-not-exist');
 expect(bad.status()).toBe(404);
});
