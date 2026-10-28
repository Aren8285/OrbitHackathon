import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

async function load(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
}
const { matchesExposure, toggleConstraint } = await load('../lib/view-model.ts');
const { formatCurrency, formatCurrencyCompact, formatNumber, severityLevel } = await load('../lib/format.ts');

test('exposure filtering retains matching assets and rejects the opposite exposure', () => {
  assert.equal(matchesExposure(true, 'internet'), true);
  assert.equal(matchesExposure(false, 'internet'), false);
  assert.equal(matchesExposure(false, 'internal'), true);
  assert.equal(matchesExposure(true, 'internal'), false);
  assert.equal(matchesExposure(true, ''), true);
  assert.equal(matchesExposure(false, ''), true);
});

test('must-have and exclude toggle off and remain mutually exclusive', () => {
  let state = toggleConstraint([], [], 'mfa', 'required');
  assert.deepEqual(state, { required: ['mfa'], excluded: [] });
  state = toggleConstraint(state.required, state.excluded, 'mfa', 'excluded');
  assert.deepEqual(state, { required: [], excluded: ['mfa'] });
  state = toggleConstraint(state.required, state.excluded, 'mfa', 'excluded');
  assert.deepEqual(state, { required: [], excluded: [] });
});

test('money uses Indian compact units, including small and negative amounts, while counts stay numeric', () => {
  assert.equal(formatCurrency(1_000_000), '₹10.00L');
  assert.equal(formatCurrencyCompact(10_000_000), '₹1.00Cr');
  assert.equal(formatCurrency(50_000), '₹0.50L');
  assert.equal(formatCurrency(-50_000), '₹-0.50L');
  assert.equal(formatCurrency(0), '₹0.00L');
  assert.equal(formatNumber(10000), '10,000');
});

test('normalized CVSS distinguishes low, medium, high and critical findings', () => {
  assert.equal(severityLevel(2 / 10), 'low');
  assert.equal(severityLevel(4 / 10), 'medium');
  assert.equal(severityLevel(6 / 10), 'high');
  assert.equal(severityLevel(9.8 / 10), 'critical');
});
