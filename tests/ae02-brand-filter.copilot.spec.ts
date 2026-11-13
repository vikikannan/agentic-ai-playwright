import { expect, test } from '@playwright/test';

test('AE-02: Filter products by brand [COPILOT]', async ({ page }) => {
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

  const poloBrand = page.locator('.brands-name').getByRole('link', { name: /Polo/ });
  await poloBrand.click();

  await expect(page).toHaveURL(/\/brand_products\/Polo\/?$/);
  const productListing = page.locator('.features_items');
  await expect(productListing.getByRole('heading', { name: /BRAND\s*-\s*Polo PRODUCTS/i })).toBeVisible();
  await expect(productListing.locator('.product-image-wrapper').filter({ hasText: 'Blue Top' })).toBeVisible();
});
