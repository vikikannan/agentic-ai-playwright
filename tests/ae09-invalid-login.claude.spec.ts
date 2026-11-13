import { expect, test } from '@playwright/test';

test.describe('Login with invalid credentials', () => {
  test('AE-09: Login with invalid credentials [CLAUDE]', { tag: '@poc' }, async ({ page }) => {
    // Synthetic, non-personal data: the reserved .invalid TLD cannot belong to a real mailbox.
    const invalidEmail = 'poc.invalid.user@example.invalid';
    const invalidPassword = 'Invalid-Password-123';

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

    // 3. Locate the existing login form.
    await expect(page.getByRole('heading', { name: 'Login to your account', exact: true })).toBeVisible();
    const loginForm = page.locator('form[action="/login"]');

    // 4. Enter synthetic invalid credentials and submit exactly one login attempt.
    await loginForm.locator('[data-qa="login-email"]').fill(invalidEmail);
    await loginForm.locator('[data-qa="login-password"]').fill(invalidPassword);
    await loginForm.getByRole('button', { name: 'Login' }).click();

    // 5. Verify the observed error message is shown within the login form.
    await expect(loginForm.getByText('Your email or password is incorrect!', { exact: true })).toBeVisible();

    // 6. Verify the visitor remains unauthenticated.
    //    The pathname is read directly once the error is shown: toHaveURL would also wait for the ad-heavy load event.
    expect(new URL(page.url()).pathname).toBe('/login');
    const navigation = page.locator('.shop-menu');
    await expect(navigation.getByRole('link', { name: /Signup \/ Login/ })).toBeVisible();
    await expect(navigation.getByText(/Logged in as/)).toHaveCount(0);
    await expect(navigation.getByRole('link', { name: 'Logout' })).toHaveCount(0);
  });
});
