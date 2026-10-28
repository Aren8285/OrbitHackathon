/**
 * Playwright E2E configuration (task item 8).
 *
 * - Starts a real backend on 127.0.0.1:8010 with a temporary SQLite file DB
 *   deleted at the start of every run.
 * - Starts `next dev` on http://localhost:3010 with BACKEND_API_URL pointing at
 *   the temporary backend. DEMO_API_TOKEN is read from frontend/.env.local and
 *   only ever kept in this process's environment — it is never printed, never
 *   hardcoded, and never written to any output file.
 * - The demo token is passed to tests solely through process.env so the
 *   no-leak test can search browser content for it.
 */
import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const BACKEND = path.join(ROOT, 'backend');
// Unique file per runner process: a stale DB from a crashed previous run can
// never feed this run. Stale files from older runs are removed (best effort)
// in tests/e2e/global-setup.ts.
const E2E_DB = path.join(BACKEND, `tmp_e2e_seed_${Date.now()}.db`);
const PORT = 3010;
const BACKEND_PORT = 8010;

// Load credentials from an env file if present. Values are never logged.
for (const envFile of [path.join(ROOT, '.env'), path.join(__dirname, '.env.local')]) {
  if (!fs.existsSync(envFile)) continue;
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && !match[2].startsWith('#')) {
      if (process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
}

// NOTE: deliberately no DB deletion here — this module is re-imported by test
// workers while the backend web server may already hold the SQLite file open.
// Cleanup lives in tests/e2e/global-setup.ts, which runs before any server.

if (!process.env.DEMO_API_TOKEN) {
  throw new Error('DEMO_API_TOKEN missing from frontend/.env.local; cannot run e2e suite');
}

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  globalSetup: path.join(__dirname, 'tests', 'e2e', 'global-setup.ts'),
  webServer: [
    {
      command: `".venv/Scripts/python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port ${BACKEND_PORT} --workers 1`,
      cwd: BACKEND,
      url: `http://127.0.0.1:${BACKEND_PORT}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL: `sqlite:///${E2E_DB.replace(/\\/g, '/')}`,
      },
    },
    {
      command: `npm run dev -- --port ${PORT}`,
      cwd: __dirname,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        BACKEND_API_URL: `http://127.0.0.1:${BACKEND_PORT}`,
        DEMO_API_TOKEN: process.env.DEMO_API_TOKEN!,
      },
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
