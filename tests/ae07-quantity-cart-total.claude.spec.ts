import { expect, test } from '@playwright/test';

test.describe('Set product quantity and verify cart total', () => {
  test('AE-07: Set product quantity and verify cart total [CLAUDE]', { tag: '@poc' }, async ({ page }) => {
    // Pages are opened at DOMContentLoaded: the full "load" event waits for third-party ad scripts
    // (observed at 20-48 s on this site), which alone can exceed the 30 s test timeout.
    // Because the page is no longer fully loaded, the consent dialog may appear at any time,
    // so the approved consent steps are registered as a locator handler instead of a one-off check.
    const consentDialog = page.getByRole('dialog', {
      name: 'This site asks for consent to use your data',
    });
    await page.addLocatorHandler(consentDialog, async () => {
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
    });

    // 1. Open the cart first in this test's isolated Playwright context.
    await page.goto('/view_cart', { waitUntil: 'domcontentloaded' });

    // 3. Fail before any cart mutation unless the cart contains no product rows.
    const cartRows = page.locator('#cart_info_table tbody tr');
    await expect(cartRows).toHaveCount(0);
    await expect(page.getByText('Cart is empty!')).toBeVisible();

    let addAttempted = false;
    try {
      // 4. Open the Blue Top details page directly and verify the expected product.
      await page.goto('/product_details/1', { waitUntil: 'domcontentloaded' });
      const productInformation = page.locator('.product-information');
      await expect(productInformation.getByRole('heading', { name: 'Blue Top', exact: true })).toBeVisible();
      await expect(productInformation).toContainText('Rs. 500');

      // 5. Set the quantity to 3 and add the product to the cart.
      const quantity = productInformation.getByRole('spinbutton');
      await quantity.fill('3');
      await expect(quantity).toHaveValue('3');
      addAttempted = true;
      await productInformation.getByRole('button', { name: 'Add to cart' }).click();
      await expect(page.getByRole('heading', { name: 'Added!' })).toBeVisible();

      // 6. Navigate to the cart.
      await page.getByRole('link', { name: 'View Cart' }).click();
      // Wait for the target page's DOM (not the ad-heavy load event), bounded by the test timeout.
      await page.waitForURL(url => url.pathname === '/view_cart', { waitUntil: 'domcontentloaded' });

      // 7. Verify the single Blue Top row with the specified quantity, unit price and total.
      const blueTopRow = page.locator('#product-1');
      await expect(cartRows).toHaveCount(1);
      await expect(blueTopRow.getByRole('heading', { name: 'Blue Top', exact: true })).toBeVisible();
      await expect(blueTopRow.locator('.cart_quantity button')).toHaveText('3');
      await expect(blueTopRow.locator('.cart_price')).toHaveText('Rs. 500');
      await expect(blueTopRow.locator('.cart_total')).toHaveText('Rs. 1500');
    } finally {
      if (addAttempted) {
        // 8. Remove only the Blue Top row added to this empty, isolated cart and verify the cart is empty.
        await page.goto('/view_cart', { waitUntil: 'domcontentloaded' });
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
