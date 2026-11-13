import { expect, test } from '@playwright/test';

// Playwright traces record fill() values and request bodies, which would expose the POC password
// in reports and CI artifacts (the project config traces on first retry). Disable tracing for this file only.
test.use({ trace: 'off' });

test.describe('Valid login and checkout review', () => {
  // The POC account and its server-side cart are shared state: never run this test in parallel.
  test.describe.configure({ mode: 'serial' });

  test('AE-10: Valid login and checkout review [CLAUDE]', { tag: '@poc' }, async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'AE-10 uses the shared POC account and runs in Chromium only.');
    // Login, cart, product, cart and checkout pages on this ad-heavy site do not reliably fit in the default 30 s.
    test.setTimeout(90_000);

    // Credentials come only from the environment (loaded with node --env-file); they are never logged.
    const email = process.env.AE_POC_EMAIL;
    const password = process.env.AE_POC_PASSWORD;
    if (!email || !password) {
      throw new Error('AE_POC_EMAIL and AE_POC_PASSWORD must be set (for example via node --env-file=.env).');
    }

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

    // 1. Navigate to the Signup / Login page.
    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    // 3. Log in with the dedicated POC test account.
    await expect(page.getByRole('heading', { name: 'Login to your account', exact: true })).toBeVisible();
    const loginForm = page.locator('form[action="/login"]');
    await loginForm.locator('[data-qa="login-email"]').fill(email);
    await loginForm.locator('[data-qa="login-password"]').fill(password);
    await loginForm.getByRole('button', { name: 'Login' }).click();
    // A successful login redirects to the home page (observed); wait for its DOM, bounded by the test timeout.
    // A failed login stays on /login, so this wait times out and the test fails here rather than later.
    await page.waitForURL(url => url.pathname === '/', { waitUntil: 'domcontentloaded' });

    // 4. Verify authentication through the observable logged-in navigation state.
    const navigation = page.locator('.shop-menu');
    await expect(navigation.getByText(/Logged in as/)).toBeVisible();
    await expect(navigation.getByRole('link', { name: 'Logout' })).toBeVisible();
    await expect(navigation.getByRole('link', { name: /Signup \/ Login/ })).toHaveCount(0);

    let addAttempted = false;
    try {
      // 5. Require a known, empty starting cart; unrelated items are never removed by this test.
      await page.goto('/view_cart', { waitUntil: 'domcontentloaded' });
      const cartRows = page.locator('#cart_info_table tbody tr');
      await expect(
        cartRows,
        'The POC account cart must be empty before AE-10 runs; clear it manually if a previous run was interrupted.',
      ).toHaveCount(0);

      // 6. Add one Blue Top from its product details page.
      await page.goto('/product_details/1', { waitUntil: 'domcontentloaded' });
      const productInformation = page.locator('.product-information');
      await expect(productInformation.getByRole('heading', { name: 'Blue Top', exact: true })).toBeVisible();
      addAttempted = true;
      await productInformation.getByRole('button', { name: 'Add to cart' }).click();
      await expect(page.getByRole('heading', { name: 'Added!' })).toBeVisible();

      // 7. Navigate to the cart and proceed to checkout.
      // Navigations wait for the target page's DOM (not the ad-heavy load event), bounded by the test timeout.
      await page.getByRole('link', { name: 'View Cart' }).click();
      await page.waitForURL(url => url.pathname === '/view_cart', { waitUntil: 'domcontentloaded' });
      await expect(cartRows).toHaveCount(1);
      await page.getByText('Proceed To Checkout', { exact: true }).click();

      // 8. Verify the checkout review page and its order details. Place Order is never clicked.
      await page.waitForURL(url => url.pathname === '/checkout', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'Address Details', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Review Your Order', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Your delivery address', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Your billing address', exact: true })).toBeVisible();

      const orderRows = page.locator('#cart_info tbody tr');
      await expect(orderRows).toHaveCount(2);
      const blueTopOrderRow = page.locator('#cart_info #product-1');
      await expect(blueTopOrderRow.getByRole('heading', { name: 'Blue Top', exact: true })).toBeVisible();
      await expect(blueTopOrderRow.locator('.cart_description')).toContainText('Women > Tops');
      await expect(blueTopOrderRow.locator('.cart_price')).toHaveText('Rs. 500');
      await expect(blueTopOrderRow.locator('.cart_quantity button')).toHaveText('1');
      await expect(blueTopOrderRow.locator('.cart_total')).toHaveText('Rs. 500');

      const totalAmountRow = orderRows.filter({ hasText: 'Total Amount' });
      await expect(totalAmountRow.locator('.cart_total_price')).toHaveText('Rs. 500');
      await expect(page.getByRole('link', { name: 'Place Order' })).toBeVisible();
    } finally {
      // 9. Remove only the Blue Top row added by this test and confirm the cart is empty.
      //    No logout step: the browser context (and its session) is discarded after the test.
      if (addAttempted) {
        await page.goto('/view_cart', { waitUntil: 'domcontentloaded' });
        const createdBlueTopRow = page.locator('#product-1');
        if (await createdBlueTopRow.count() > 0) {
          await expect(createdBlueTopRow.getByRole('heading', { name: 'Blue Top', exact: true })).toBeVisible();
          await createdBlueTopRow.locator('.cart_quantity_delete').click();
        }
        await expect(page.locator('#cart_info_table tbody tr')).toHaveCount(0);
        await expect(page.getByText('Cart is empty!')).toBeVisible();
      }
    }
  });
});
