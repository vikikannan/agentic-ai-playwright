import { expect, test } from '@playwright/test';

test.describe('Filter products by category', () => {
  test('Filter to Women Tops and verify Blue Top is listed', { tag: '@poc' }, async ({ page }) => {
    // 1. Navigate to the full product catalogue.
    await page.goto('/products');

    const consentDialog = page.getByRole('dialog', {
      name: 'This site asks for consent to use your data',
    });
    if (await consentDialog.isVisible()) {
      // 2. Turn optional data-use preferences off using the previously approved controls.
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

    // 3. Expand Women and select its exact Tops subcategory.
    const categoryControls = page.locator('#accordian');
    await categoryControls.getByRole('link', { name: /Women/ }).click();
    await page.getByRole('link', { name: 'Tops', exact: true }).click();

    // 4. Verify the category route, heading, breadcrumb and a relevant product.
    await expect(page).toHaveURL(url => url.pathname === '/category_products/2');
    await expect(page.getByRole('heading', { name: 'Women - Tops Products', exact: true })).toBeVisible();
    await expect(page.getByText('Women > Tops', { exact: true })).toBeVisible();

    const blueTopCard = page.locator('.product-image-wrapper').filter({ hasText: 'Blue Top' });
    await expect(blueTopCard).toBeVisible();
  });
});
