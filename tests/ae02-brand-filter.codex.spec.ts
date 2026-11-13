import { expect, test } from '@playwright/test';

test.skip('AE-02: Filter products by brand [CODEX]', async ({ page }) => {
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
    for (let index = 0; index < await optionalPurposes.count(); index += 1) {
      const purpose = optionalPurposes.nth(index);
      if (await purpose.getAttribute('aria-pressed') === 'true') {
        await purpose.locator('..').click();
      }
    }
    await preferencesDialog.getByRole('button', { name: 'Confirm choices' }).click();
    await expect(consentDialog).toHaveCount(0);
  }

  const brands = page.locator('#brands_products');
  await expect(brands.getByRole('heading', { name: 'Brands' })).toBeVisible();
  await brands.getByRole('link', { name: /Polo/ }).click();

  await expect(page).toHaveURL(url => url.pathname === '/brand_products/1');
  await expect(page.getByRole('heading', { name: 'Brand - Polo Products', exact: true })).toBeVisible();
  const productResults = page.locator('.features_items');
  const blueTopCard = productResults.locator('.product-image-wrapper').filter({ hasText: 'Blue Top' });
  await expect(blueTopCard).toBeVisible();
  await expect(blueTopCard).toContainText('Blue Top');
});
