import { expect, test } from "@playwright/test";

test("admin can login, navigate to case editor, and logout", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Admin Login" })).toBeVisible();
  await page.locator('input[type="email"]').fill("admin@salarysafe.dev");
  await page.locator('input[type="password"]').fill("admin123!");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/cases$/);
  await expect(page.getByRole("heading", { name: "Cases" })).toBeVisible();

  const openLink = page.getByRole("link", { name: "Open" }).first();
  await expect(openLink).toBeVisible();
  await openLink.click();

  await expect(page.getByRole("heading", { name: "Case Editor" })).toBeVisible();
  await page.getByRole("link", { name: "Back to Cases" }).click();

  await expect(page).toHaveURL(/\/cases$/);
  await page.getByRole("button", { name: "Logout" }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Admin Login" })).toBeVisible();
});
