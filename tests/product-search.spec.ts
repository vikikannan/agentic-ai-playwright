import { expect, test } from '@playwright/test';

test.describe('Search for a matching product and verify the result', () => {
  test('Search for a matching product and verify the result', async ({ page }) => {
    // 1. Navigate to the product catalogue for AE-04.
    await page.goto('/products');

    const consentDialog = page.getByRole('dialog', {
      name: 'This site asks for consent to use your data',
    });
    if (await consentDialog.isVisible()) {
      // 2. Set optional data-use preferences to off as explicitly approved.
      await consentDialog.getByRole('button', { name: 'Manage options' }).click();
      const preferencesDialog = page.getByRole('dialog', { name: 'Manage your data' });
      await expect(preferencesDialog).toBeVisible();

      const optionalPurposes = preferencesDialog.getByRole('button', {
        name: /^(Consent|Legitimate interest)\b/,
      });
      const purposeCount = await optionalPurposes.count();
      for (let index = 0; index < purposeCount; index += 1) {
        const purpose = optionalPurposes.nth(index);
        if (await purpose.getAttribute('aria-pressed') === 'true') {
          await purpose.locator('..').click();
        }
      }

      await preferencesDialog.getByRole('button', { name: 'Confirm choices' }).click();
      await expect(consentDialog).toHaveCount(0);
    }

    // 3. Enter the observed catalogue product name in the accessible search textbox.
    await page.getByRole('textbox', { name: 'Search Product' }).fill('Blue Top');

    // 4. Submit the Blue Top catalogue search using the visible search control.
    await page.locator('#submit_search').click();

    // 5. Verify the search results section heading is visible.
    await expect(page).toHaveURL(
      url => url.pathname === '/products' && url.searchParams.get('search') === 'Blue Top',
    );
    await expect(page.getByRole('heading', { name: 'Searched Products' })).toBeVisible();

    // 6. Verify a result containing the matching product name and price.
    const matchingProduct = page.locator('.product-image-wrapper').filter({ hasText: 'Blue Top' });
    await expect(matchingProduct).toBeVisible();
    await expect(matchingProduct).toContainText('Blue Top');
    await expect(matchingProduct).toContainText('Rs. 500');
  });
});
