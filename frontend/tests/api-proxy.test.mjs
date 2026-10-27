import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Compile the route in memory: no generated test files or new dependencies.
const source = readFileSync(new URL('../app/api/[...path]/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
} }).outputText;
const route = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function setup(t, headers = {}) {
  const oldFetch = globalThis.fetch;
  const oldToken = process.env.DEMO_API_TOKEN;
  const oldBackend = process.env.BACKEND_API_URL;
  t.after(() => {
    globalThis.fetch = oldFetch;
    if (oldToken === undefined) delete process.env.DEMO_API_TOKEN;
    else process.env.DEMO_API_TOKEN = oldToken;
    if (oldBackend === undefined) delete process.env.BACKEND_API_URL;
    else process.env.BACKEND_API_URL = oldBackend;
  });
  process.env.DEMO_API_TOKEN = 'server-only-test-token';
  process.env.BACKEND_API_URL = 'http://backend:8000';
  return {
    method: 'GET', body: null,
    nextUrl: new URL('http://localhost:3018/api/assets?company_id=2'),
    headers: new Headers({ host: '127.0.0.1:3018', ...headers }),
  };
}
const context = (path) => ({ params: Promise.resolve({ path }) });

test('one-click demo rebuild forwards POST with the server credential', async (t) => {
  const request = setup(t, { origin: 'http://127.0.0.1:3018' });
  request.method = 'POST';
  request.nextUrl = new URL('http://localhost:3018/api/demo/seed');
  globalThis.fetch = async (url, options) => {
    assert.equal(url.href, 'http://backend:8000/api/demo/seed');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.get('X-Demo-Token'), 'server-only-test-token');
    return Response.json({ rebuilt: true, counts: { risk_scenarios: 6 } });
  };
  const response = await route.POST(request, context(['demo', 'seed']));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).rebuilt, true);
});

test('proxy injects only the server token and does not return credential headers', async (t) => {
  const request = setup(t, { 'x-demo-token': 'attacker-supplied' });
  globalThis.fetch = async (url, options) => {
    assert.equal(url.href, 'http://backend:8000/api/assets?company_id=2');
    assert.equal(options.headers.get('X-Demo-Token'), 'server-only-test-token');
    assert.equal(options.redirect, 'manual');
    return new Response('[]', { headers: { 'X-Demo-Token': 'server-only-test-token' } });
  };
  const response = await route.GET(request, context(['assets']));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-Demo-Token'), null);
  assert.equal(await response.text(), '[]');
});

test('same-origin uploads work even when Next normalizes the hostname', async (t) => {
  const request = setup(t, { origin: 'http://127.0.0.1:3018', 'content-type': 'text/csv' });
  request.method = 'POST';
  request.body = new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('csv-data'));
    controller.close();
  } });
  globalThis.fetch = async (url, options) => {
    assert.equal(url.pathname, '/api/assets/import-csv');
    assert.equal(new TextDecoder().decode(options.body), 'csv-data');
    return new Response('{}', { status: 200 });
  };
  assert.equal((await route.POST(request, context(['assets', 'import-csv']))).status, 200);
});

test('cross-origin requests are rejected before forwarding', async (t) => {
  const request = setup(t, { origin: 'https://untrusted.example' });
  globalThis.fetch = () => assert.fail('must not forward');
  assert.equal((await route.GET(request, context(['assets']))).status, 403);
});

test('unconfigured token fails closed', async (t) => {
  const request = setup(t);
  delete process.env.DEMO_API_TOKEN;
  globalThis.fetch = () => assert.fail('must not forward');
  assert.equal((await route.GET(request, context(['assets']))).status, 503);
});

test('oversized streaming upload is rejected before forwarding', async (t) => {
  const request = setup(t);
  request.method = 'POST';
  request.body = new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 64 * 1024 + 1));
    controller.close();
  } });
  globalThis.fetch = () => assert.fail('must not forward');
  assert.equal((await route.POST(request, context(['assets', 'import-csv']))).status, 413);
});

test('AI requests retain client cancellation without cutting off the model chain', async (t) => {
  const request = setup(t);
  request.signal = new AbortController().signal;
  globalThis.fetch = async (url, options) => {
    assert.equal(url.pathname, '/api/ai/explain-risk');
    assert.equal(options.signal, request.signal);
    return Response.json({model:'template', explanation:'Calculated risk remains material.'});
  };
  assert.equal((await route.GET(request, context(['ai','explain-risk']))).status, 200);
});
