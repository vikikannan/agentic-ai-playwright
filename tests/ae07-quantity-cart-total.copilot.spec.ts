import { expect, test } from '@playwright/test';

test('AE-07: Set quantity and verify cart total [COPILOT]', async ({ page }) => {
  await page.goto('/view_cart', { waitUntil: 'domcontentloaded' });

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

  const cartRows = page.locator('#cart_info_table tbody tr');
  await expect(cartRows).toHaveCount(0);
  await expect(page.getByText('Cart is empty!')).toBeVisible();

  let addAttempted = false;
  try {
    await page.goto('/product_details/1', { waitUntil: 'domcontentloaded' });

    const productInformation = page.locator('.product-information');
    await expect(productInformation.getByRole('heading', { name: 'Blue Top', exact: true })).toBeVisible();
    await expect(productInformation).toContainText('Rs. 500');

    await page.locator('#quantity').fill('3');
    await expect(page.locator('#quantity')).toHaveValue('3');

    addAttempted = true;
    await productInformation.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByRole('heading', { name: 'Added!' })).toBeVisible();
    await page.getByRole('link', { name: 'View Cart' }).click();

    const blueTopRow = page.locator('#product-1');
    await expect(cartRows).toHaveCount(1);
    await expect(blueTopRow.getByRole('heading', { name: 'Blue Top', exact: true })).toBeVisible();
    await expect(blueTopRow.locator('.cart_quantity button')).toHaveText('3');
    await expect(blueTopRow.locator('.cart_price')).toHaveText('Rs. 500');
    await expect(blueTopRow.locator('.cart_total')).toHaveText('Rs. 1500');
  } finally {
    if (addAttempted) {
      await page.goto('/view_cart', { waitUntil: 'domcontentloaded' });
      const blueTopRow = page.locator('#product-1');
      if (await blueTopRow.count() > 0) {
        await expect(blueTopRow.getByRole('heading', { name: 'Blue Top', exact: true })).toBeVisible();
        await blueTopRow.locator('.cart_quantity_delete').click();
      }
      await expect(cartRows).toHaveCount(0);
      await expect(page.getByText('Cart is empty!')).toBeVisible();
    }
  }
});
