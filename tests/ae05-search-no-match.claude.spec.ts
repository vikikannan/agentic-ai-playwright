import { expect, test } from '@playwright/test';

test.describe('Search with no matching product', () => {
  test('AE-05: Search with no matching product [CLAUDE]', { tag: '@poc' }, async ({ page }) => {
    const searchTerm = 'NoSuchProductXYZ123';

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

    // 1. Navigate to the product catalogue.
    await page.goto('/products', { waitUntil: 'domcontentloaded' });

    // 3. Search for a term that matches no catalogue product.
    await page.getByRole('textbox', { name: 'Search Product' }).fill(searchTerm);
    await page.locator('#submit_search').click();

    // 4. Verify the search results page is shown and reflects the searched term.
    //    These checks run first so an error or overload page can never pass as "zero results".
    //    waitForURL waits for the results page's DOM; toHaveURL would also wait for the ad-heavy load event.
    await page.waitForURL(
      url => url.pathname === '/products' && url.searchParams.get('search') === searchTerm,
      { waitUntil: 'domcontentloaded' },
    );
    await expect(page.getByRole('heading', { name: 'Searched Products', exact: true })).toBeVisible();

    // 5. Verify no product cards are listed inside the product listing container.
    //    Scoping to .features_items excludes injected advertisements and sidebar content.
    const productListing = page.locator('.features_items');
    await expect(productListing).toBeVisible();
    await expect(productListing.locator('.product-image-wrapper')).toHaveCount(0);
    await expect(productListing.locator('.productinfo')).toHaveCount(0);
  });
});
