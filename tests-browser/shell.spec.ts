import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('development shell is reachable, truthful and accessible',async({page})=>{await page.goto('/');await expect(page.getByRole('heading',{name:/Follow the rule/})).toBeVisible();await expect(page.getByText('Development preview')).toBeVisible();expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);});
