import { expect, test } from '@playwright/test';

test.describe('Filter products by brand', () => {
  test('AE-02: Filter products by brand [CLAUDE]', { tag: '@poc' }, async ({ page }) => {
    // Pages are opened at DOMContentLoaded: the full "load" event waits for third-party ad scripts
    // (observed at 20-48 s on /products), which alone can exceed the 30 s test timeout.
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

    // 1. Navigate to the full product catalogue.
    await page.goto('/products', { waitUntil: 'domcontentloaded' });

    // 3. Locate the Brands section and select Polo.
    const brandsSection = page.locator('.brands_products');
    await expect(brandsSection.getByRole('heading', { name: 'Brands', exact: true })).toBeVisible();
    const poloBrandLink = brandsSection.getByRole('link', { name: /\bPolo$/i });

    // The click can be intercepted by a Google ad vignette (#google_vignette); retry once only in that case.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await poloBrandLink.click();
      // Wait for the brand page's DOM (not the ad-heavy load event), bounded by the test timeout.
      await page.waitForURL(
        url =>
          url.pathname === '/brand_products/Polo' ||
          (url.pathname === '/products' && url.hash === '#google_vignette'),
        { waitUntil: 'domcontentloaded' },
      );

      if (new URL(page.url()).hash !== '#google_vignette') {
        break;
      }

      if (attempt === 0) {
        await page.goto('/products', { waitUntil: 'domcontentloaded' });
      }
    }

    // 4. Verify the observed brand route, heading and breadcrumb reflect the selected brand.
    //    The pathname is read directly: toHaveURL would also wait for the ad-heavy load event.
    await expect(page.getByRole('heading', { name: 'Brand - Polo Products', exact: true })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/brand_products/Polo');
    await expect(page.locator('.breadcrumb')).toContainText('Polo');

    // 5. Verify Blue Top is listed within the product results container.
    const productListing = page.locator('.features_items');
    const blueTopCard = productListing.locator('.product-image-wrapper').filter({ hasText: 'Blue Top' });
    await expect(blueTopCard).toBeVisible();
    await expect(blueTopCard).toContainText('Rs. 500');
  });
});
