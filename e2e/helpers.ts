import { Page } from '@playwright/test';

export const ADMIN = {
  email: process.env.ADMIN_EMAIL ?? '',
  password: process.env.ADMIN_PASSWORD ?? '',
};

export const OPERATOR = {
  email: process.env.OPERATOR_EMAIL ?? '',
  password: process.env.OPERATOR_PASSWORD ?? '',
};

export async function login(page: Page, email: string, password: string) {
  if (!email || !password) throw new Error('Configure las credenciales E2E mediante variables de entorno.');
  await page.goto('/login');
  await page.getByPlaceholder('usuario@ejemplo.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/dashboard');
}

export async function loginAsAdmin(page: Page) {
  await login(page, ADMIN.email, ADMIN.password);
}

export async function loginAsOperator(page: Page) {
  await login(page, OPERATOR.email, OPERATOR.password);
}
