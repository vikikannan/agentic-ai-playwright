import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

const { Given, When, Then } = createBdd();

Given('the visitor is on the products page', async ({ page }) => {
  await page.goto('/products');

  const consentDialog = page.getByRole('dialog', {
    name: 'This site asks for consent to use your data',
  });
  if (await consentDialog.isVisible()) {
    await consentDialog.getByRole('button', { name: 'Manage options' }).click();
    const preferencesDialog = page.getByRole('dialog', { name: 'Manage your data' });
    await expect(preferencesDialog).toBeVisible();

    const optionalPurposes = preferencesDialog.getByRole('button', {
      name: /^(Consent|Legitimate interest)\b/,
    });
    const purposeCount = await optionalPurposes.count();
    for (let index = 0; index < purposeCount; index += 1) {
      const purpose = optionalPurposes.nth(index);
      if (await purpose.getAttribute('aria-pressed') === 'true') {
        await purpose.locator('..').click();
      }
    }

    await preferencesDialog.getByRole('button', { name: 'Confirm choices' }).click();
    await expect(consentDialog).toHaveCount(0);
  }
});

When('the visitor searches for {string}', async ({ page }, productName: string) => {
  await page.getByRole('textbox', { name: 'Search Product' }).fill(productName);
  await page.locator('#submit_search').click();
});

Then('the search results should be displayed', async ({ page }) => {
  await expect(page).toHaveURL(
    url => url.pathname === '/products' && url.searchParams.get('search') === 'Blue Top',
  );
  await expect(page.getByRole('heading', { name: 'Searched Products' })).toBeVisible();
});

Then('the results should contain {string}', async ({ page }, productName: string) => {
  const matchingProduct = page.locator('.product-image-wrapper').filter({ hasText: productName });
  await expect(matchingProduct).toBeVisible();
  await expect(matchingProduct).toContainText(productName);
});

Then('the product price should be {string}', async ({ page }, price: string) => {
  const matchingProduct = page.locator('.product-image-wrapper').filter({ hasText: 'Blue Top' });
  await expect(matchingProduct).toContainText(price);
});
