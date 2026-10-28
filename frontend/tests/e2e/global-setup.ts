/**
 * Global setup: best-effort removal of stale temporary test databases from
 * earlier runs before the web servers start. Each run uses its own uniquely
 * named SQLite file (see playwright.config.ts), so a locked stale file cannot
 * affect this run; failures to remove it are ignored.
 */
import { expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BACKEND = path.resolve(__dirname, '..', '..', '..', 'backend'); // tests/e2e -> frontend -> repo root

for (const name of fs.readdirSync(BACKEND)) {
  if (/^tmp_e2e_seed_.*\.db(-wal|-shm)?$/.test(name)) {
    try {
      fs.rmSync(path.join(BACKEND, name), { force: true });
    } catch {
      /* still locked by a stale process; harmless for this run */
    }
  }
}

export default function globalSetup(): void {
  if (!process.env.DEMO_API_TOKEN || process.env.DEMO_API_TOKEN.length < 8) {
    throw new Error('DEMO_API_TOKEN missing/short; check frontend/.env.local');
  }
  expect(Boolean(process.env.DEMO_API_TOKEN)).toBe(true);
}
