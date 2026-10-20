import { test, expect } from '@playwright/test';

const baseURL = 'https://automationexercise.com';

test.describe('Automation Exercise API tests', () => {
  test('API-01: Get all products', async ({ request }) => {
    const response = await request.get(
      `${baseURL}/api/productsList`
    );

    expect(response.status()).toBe(200);

    const body = await response.json();

    expect(body.responseCode).toBe(200);
    expect(Array.isArray(body.products)).toBe(true);
    expect(body.products.length).toBeGreaterThan(0);

    for (const product of body.products) {
      expect(product.id).toBeDefined();
      expect(product.name).toEqual(expect.any(String));
      expect(product.price).toEqual(expect.any(String));
    }
  });

  test('API-02: Search product without required parameter', async ({ request }) => {
    const response = await request.post(
      `${baseURL}/api/searchProduct`,
      { form: {} }
    );

    expect(response.status()).toBe(200);

    const body = await response.json();

    expect(body.responseCode).toBe(400);
    expect(body.message).toContain(
      'search_product parameter is missing'
    );
  });
});
