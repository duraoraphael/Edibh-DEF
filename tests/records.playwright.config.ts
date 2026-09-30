import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".", testMatch: "record-edit-history.spec.ts", workers: 1,
  reporter: "list", timeout: 30_000,
  use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:3200", screenshot: "only-on-failure" },
});
