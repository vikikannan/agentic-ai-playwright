import { expect, test } from '@playwright/test';

test('AE-09: Login with invalid credentials [COPILOT]', async ({ page }) => {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });

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

  const loginForm = page.locator('form[action="/login"]');
  await loginForm.getByRole('textbox', { name: 'Email Address' }).fill('poc-invalid-ae09@example.invalid');
  await loginForm.getByRole('textbox', { name: 'Password' }).fill('synthetic-invalid-AE09');
  await loginForm.getByRole('button', { name: 'Login' }).click();

  await expect(page).toHaveURL(/\/login\/?$/);
  await expect(loginForm.getByText('Your email or password is incorrect!', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Logged in as/ })).toHaveCount(0);
});
