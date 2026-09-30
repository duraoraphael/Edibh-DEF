import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "dashboard-distributions.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { ...devices["Desktop Chrome"] },
});
