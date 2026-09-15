import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: '../tests',
  testMatch: 'password-reset.spec.ts',
  workers: 2,
  reporter: 'line',
  use: { baseURL: 'http://localhost:3117', browserName: 'chromium' },
  webServer: {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    command: 'npx next start -p 3117',
    url: 'http://localhost:3117',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
