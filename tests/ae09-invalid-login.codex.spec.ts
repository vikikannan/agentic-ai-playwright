import { expect, test } from '@playwright/test';

async function resolveConsent(page: import('@playwright/test').Page) {
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
}

test('AE-09: Login with invalid credentials [CODEX]', async ({ page }) => {
  await page.goto('/login');
  await resolveConsent(page);

  const loginForm = page.locator('form').filter({ has: page.locator('[data-qa="login-email"]') });
  await expect(loginForm.getByRole('heading', { name: 'Login to your account' })).toBeVisible();
  await loginForm.locator('[data-qa="login-email"]').fill('invalid-login-poc@example.invalid');
  await loginForm.locator('[data-qa="login-password"]').fill('SyntheticInvalidPassword-9284');
  await loginForm.getByRole('button', { name: 'Login' }).click();

  await expect(page.getByText('Your email or password is incorrect!', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Logout' })).toHaveCount(0);
  await expect(page.locator('[data-qa="login-email"]')).toBeVisible();
});
