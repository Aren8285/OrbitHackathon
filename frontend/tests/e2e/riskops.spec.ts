/**
 * RiskOps end-to-end suite (task item 8).
 *
 * Runs against dev servers started by playwright.config.ts: a fresh backend
 * SQLite file plus Next dev. The order matters: the dashboard-empty test must
 * run before the demo seed test. DEMO_API_TOKEN travels only in process.env
 * and is never printed; the no-leak test searches rendered content and every
 * recorded network payload for it.
 */
import { expect, test, type Page } from '@playwright/test';

const DEMO_TOKEN = process.env.DEMO_API_TOKEN ?? '';

/* Test (i) support: record every response body seen by a page. */
function trackPayloads(page: Page, seen: { value: string }) {
  page.on('response', async (response) => {
    try {
      const headers = response.headers();
      const type = headers['content-type'] ?? '';
      if (/^application\/javascript|^text\/html|^application\/json|^text\/plain/.test(type)) {
        seen.value += '\n' + (await response.text());
      }
    } catch {
      /* detached responses are fine to skip */
    }
  });
}

test.describe.serial('RiskOps dashboard', () => {
  const payloads = { value: '' };

  test.beforeEach(async ({ page }) => {
    trackPayloads(page, payloads);
  });

  test('(a) empty dashboard shows the empty state', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('No data yet. Load the FinPay demo')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Load FinPay demo' })).toBeVisible();
  });

  test('(b) Load FinPay demo fills KPIs and top risks', async ({ page }) => {
    await page.goto('/');
    const start = Date.now();
    await page.getByRole('button', { name: 'Load FinPay demo' }).click();
    await expect(page.getByText('Expected annual loss')).toBeVisible();
    const elapsedSeconds = Math.round((Date.now() - start) / 1000);
    await expect(page.getByText('P95 annual loss')).toBeVisible();
    await expect(page.getByText('Top 5 risks')).toBeVisible();
    // KPI values are formatted currency, never "—"
    await expect(page.locator('.kpi-value').first()).toContainText(/₹[0-9]/);
    // record the timing without failing on load speed
    await test.info().attach(`demo-load-${elapsedSeconds}s.txt`, {
      body: Buffer.from(`Load FinPay demo visible KPIs after ${elapsedSeconds}s`),
      contentType: 'text/plain',
    });
  });

  test('(c) payment database shows P0 and lakh/crore loss range', async ({ page }) => {
    await page.goto('/');
    const row = page.locator('table tbody tr', { hasText: 'Payment Processing Database' }).first();
    await expect(row).toBeVisible();
    await expect(row.locator('.priority-p0')).toHaveText(/P0/);
    // P50/P95 in the summary cards or the top-risks row use L/Cr compact INR
    await expect(row).toContainText(/₹[0-9.]+(L|Cr)/);
    await expect(page.locator('.kpi-value').first()).toContainText(/₹[0-9.]+(L|Cr)/);
  });

  test('(d) assets: sort, internet filter, row details', async ({ page }) => {
    await page.goto('/assets');
    await expect(page.getByRole('heading', { name: 'Assets' })).toBeVisible();
    // sort by name asc -> desc and observe the first row change
    const firstRowName = page.locator('table tbody tr').first().locator('td').first();
    await page.getByRole('button', { name: /Asset/ }).first().click();
    const ascName = await firstRowName.textContent();
    await page.getByRole('button', { name: /Asset/ }).first().click();
    const descName = await firstRowName.textContent();
    expect(ascName && descName && ascName.trim() !== descName.trim()).toBe(true);

    // internet-facing filter
    await page.getByLabel('Exposure').selectOption('internet');
    await expect(page.locator('table tbody tr td', { hasText: 'Internet' }).first()).toBeVisible();
    const rows = await page.locator('table tbody tr').count();
    expect(rows).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Clear filters' }).click();

    // open details dialog from a row click
    await page.locator('table tbody tr').first().click();
    const details = page.locator('dialog[open]');
    await expect(details).toBeVisible();
    await expect(details.getByRole('heading', { name: 'Vulnerabilities' })).toBeVisible();
    await details.getByRole('button', { name: 'Close' }).click();
  });

  test('(e) vulnerabilities shows KEV badge, CVSS and priority', async ({ page }) => {
    await page.goto('/vulnerabilities');
    await expect(page.locator('.kev-tag').first()).toHaveText('KEV');
    await expect(page.locator('table tbody tr').first()).toContainText(/CVSS|\d\.\d/);
    await expect(page.locator('.priority-tag').first()).toBeVisible();
  });

  test('(f) optimizer: slider, asset selector, must-have/exclude', async ({ page }) => {
    await page.goto('/optimizer');
    await expect(page.getByRole('heading', { name: 'Budget optimizer' })).toBeVisible();

    const lossAfter = async () =>
      (await page.getByText('Expected loss after').locator('xpath=following-sibling::p').textContent()) ?? '';
    const slider = page.locator('input[type="range"]');

    const readings: string[] = [];
    for (const budget of ['1000000', '5000000', '10000000']) {
      await expect(page.getByText('Expected loss after')).toBeVisible();
      const previousLoss = await lossAfter();
      await slider.fill(budget);
      // Wait for the debounced request to change the visible result.
      await expect.poll(lossAfter).not.toBe(previousLoss);
      readings.push(await lossAfter());
    }
    expect(new Set(readings).size).toBe(3); // all three changed the after-loss

    // asset selector
    await page.getByLabel('Asset').selectOption({ index: 1 });
    await expect(page.getByText('Expected loss after')).toBeVisible();

    // must-have and exclude toggles stay in sync with the checkboxes
    const mustHave = page.locator('input[aria-label^="Must-have"]').first();
    const exclude = page.locator('input[aria-label^="Exclude"]').first();
    await mustHave.check();
    await expect(mustHave).toBeChecked();
    await exclude.check();
    await expect(exclude).toBeChecked();
  });

  test('(g) remediation: completed then verified changes group', async ({ page }) => {
    await page.goto('/remediation');
    const select = page.locator('select[aria-label^="Status for task"]').first();
    const key = await select.getAttribute('aria-label');
    expect(key).toContain('Status for task');
    await select.selectOption('completed');
    // filter by the section's own heading, not its text: every status select
    // contains an "Completed"/"Verified" <option>, which hasText would match
    const sectionFor = (heading: string) =>
      page.locator('section').filter({ has: page.getByRole('heading', { name: new RegExp(`^${heading} \\(\\d+\\)$`) }) });
    const completed = sectionFor('Completed');
    await expect(completed.locator(`select[aria-label="${key}"]`)).toBeVisible();
    await completed.locator(`select[aria-label="${key}"]`).selectOption('verified');
    await expect(
      sectionFor('Verified').locator(`select[aria-label="${key}"]`),
    ).toBeVisible();
  });

  test('(h) explain risk shows text and source label', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Generate explanation' }).click();
    await expect(page.locator('pre').first()).not.toBeEmpty();
    await expect(page.getByText(/Model: (template|[a-z0-9.-]+)/)).toBeVisible();
  });

  test('(i) no demo token or API key in page source or network payloads', async ({ page }) => {
    for (const route of ['/', '/assets', '/vulnerabilities', '/scenarios', '/optimizer', '/remediation']) {
      await page.goto(route);
    }
    expect(DEMO_TOKEN.length).toBeGreaterThan(8); // guarding empty-check in the test
    expect(payloads.value).not.toContain(DEMO_TOKEN);
    expect(payloads.value).not.toContain('GEMINI_API_KEY');
    const html = payloads.value.length;
    await test.info().attach('payload-audit.txt', {
      body: Buffer.from(`audited ${html} characters of html/js/json payloads`),
      contentType: 'text/plain',
    });
  });
});
