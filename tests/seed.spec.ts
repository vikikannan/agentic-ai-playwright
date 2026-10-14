import { test, expect } from '@playwright/test';

test('loads the Automation Exercise home page', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL('https://www.automationexercise.com/');
  await expect(page).toHaveTitle('Automation Exercise');
});
