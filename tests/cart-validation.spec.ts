import { expect, test } from '@playwright/test';

test.describe('Add one product and validate cart', () => {
  test('Add one Blue Top and verify its cart details', { tag: '@poc' }, async ({ page }) => {
    // 1. Open the cart first in this test's isolated Playwright context.
    await page.goto('/view_cart');

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

    // 3. Fail before any cart mutation unless the cart contains no product rows.
    const cartRows = page.locator('#cart_info_table tbody tr');
    await expect(cartRows).toHaveCount(0);
    await expect(page.getByText('Cart is empty!')).toBeVisible();

    let addAttempted = false;
    try {
      // 4. Navigate to the catalogue and add one Blue Top from its product card.
      await page.goto('/products');
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
      const blueTopCard = page.locator('.product-image-wrapper').filter({ hasText: 'Blue Top' }).first();
      await expect(blueTopCard).toBeVisible();
      addAttempted = true;
      await blueTopCard.getByText('Add to cart', { exact: true }).first().click({ timeout: 10000 });
      await expect(page.getByRole('heading', { name: 'Added!' })).toBeVisible();
      await page.getByRole('link', { name: 'View Cart' }).click();

      // 5. Verify the single Blue Top row, quantity, unit price and total.
      const blueTopRow = page.locator('#product-1');
      await expect(cartRows).toHaveCount(1);
      await expect(blueTopRow.getByRole('heading', { name: 'Blue Top', exact: true })).toBeVisible();
      await expect(blueTopRow.locator('.cart_quantity button')).toHaveText('1');
      await expect(blueTopRow.locator('.cart_price')).toContainText('Rs. 500');
      await expect(blueTopRow.locator('.cart_total')).toContainText('Rs. 500');
    } finally {
      if (addAttempted) {
        // 6. Remove only the Blue Top row created in this empty, isolated cart.
        await page.goto('/view_cart');
        const createdBlueTopRow = page.locator('#product-1');
        if (await createdBlueTopRow.count() > 0) {
          await expect(createdBlueTopRow.getByRole('heading', { name: 'Blue Top', exact: true })).toBeVisible();
          await createdBlueTopRow.locator('.cart_quantity_delete').click();
        }
        await expect(cartRows).toHaveCount(0);
        await expect(page.getByText('Cart is empty!')).toBeVisible();
      }
    }
  });
});
