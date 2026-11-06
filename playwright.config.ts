import { defineConfig, devices } from '@playwright/test';

const target = process.env.APP_TARGET || 'react';
const v4Root = process.env.V4_ROOT || '';
const port = target === 'v4' ? 4173 : 4174;

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}/`,
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
    timezoneId: 'America/New_York',
    locale: 'en-US',
  },
  projects: [{ name: target, use: { ...devices['Desktop Chrome'] } }],
  webServer: target === 'v4'
    ? { command: `node tests/e2e/static-server.mjs ${port} ${v4Root}`, url: `http://127.0.0.1:${port}/index.html`, reuseExistingServer: false, stdout: 'ignore', stderr: 'ignore' }
    : { command: `npm run build && npx vite preview --port ${port} --strictPort --host 127.0.0.1`, url: `http://127.0.0.1:${port}/`, reuseExistingServer: false, timeout: 180_000, stdout: 'ignore' },
});
