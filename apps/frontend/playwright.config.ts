import { defineConfig } from "@playwright/test";

const baseURL = process.env.SMOKE_BASE_URL ?? "http://localhost";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  retries: 0,
  workers: 1,
  use: {
    baseURL,
    headless: true,
  },
  reporter: [["list"]],
});
