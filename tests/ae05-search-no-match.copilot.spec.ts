import { expect, test } from '@playwright/test';

test('AE-05: Search with no matching product [COPILOT]', async ({ page }) => {
  await page.goto('/products', { waitUntil: 'domcontentloaded' });

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
    for (let index = 0; index < await optionalPurposes.count(); index += 1) {
      const purpose = optionalPurposes.nth(index);
      if (await purpose.getAttribute('aria-pressed') === 'true') {
        await purpose.locator('..').click();
      }
    }

    await preferencesDialog.getByRole('button', { name: 'Confirm choices' }).click();
    await expect(consentDialog).toHaveCount(0);
  }

  const searchTerm = 'NoSuchProductXYZ123';
  await page.getByRole('textbox', { name: 'Search Product' }).fill(searchTerm);
  await page.locator('#submit_search').click();

  await expect(page).toHaveURL(/\/products\?search=NoSuchProductXYZ123(?:&|$)/);
  const productListing = page.locator('.features_items');
  await expect(productListing.getByRole('heading', { name: 'Searched Products' })).toBeVisible();
  await expect(productListing.locator('.product-image-wrapper')).toHaveCount(0);
});
