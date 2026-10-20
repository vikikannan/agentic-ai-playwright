import { expect, test } from '@playwright/test';

test.describe('View product details', () => {
  test('View the details for Blue Top', { tag: '@poc' }, async ({ page }) => {
    // 1. Navigate to the product catalogue.
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

    // 3. Open Blue Top's detail page from its product card.
    const blueTopCard = page.locator('.product-image-wrapper').filter({ hasText: 'Blue Top' });
    await expect(blueTopCard).toBeVisible();
    await blueTopCard.getByRole('link', { name: /View Product/ }).click();

    // 4. Verify the detail route and the observed Blue Top product information.
    await expect(page).toHaveURL(/\/product_details\/1$/);
    const productInformation = page.locator('.product-information');
    await expect(productInformation.getByRole('heading', { name: 'Blue Top', exact: true })).toBeVisible();
    await expect(productInformation).toContainText('Rs. 500');
    await expect(productInformation.getByText('Category: Women > Tops', { exact: true })).toBeVisible();
    await expect(productInformation.getByText('Availability: In Stock', { exact: true })).toBeVisible();
    await expect(productInformation.getByText('Condition: New', { exact: true })).toBeVisible();
    await expect(productInformation.getByText('Brand: Polo', { exact: true })).toBeVisible();
  });
});
