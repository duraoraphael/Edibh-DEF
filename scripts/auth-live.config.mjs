import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '../tests', testMatch: 'auth-production.live.ts',
  workers: 1, timeout: 120000, reporter: 'line',
  expect: { timeout: 35000 },
  use: { baseURL: process.env.AUTH_TEST_BASE_URL || 'https://fluxocriticos.vercel.app',
    ...(process.env.AUTH_TEST_BROWSER === 'brave'
      ? { launchOptions: { executablePath: 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe' } }
      : { channel: process.env.AUTH_TEST_BROWSER === 'edge' ? 'msedge' : 'chrome' }),
    trace: 'off', screenshot: 'off', video: 'off' },
});
