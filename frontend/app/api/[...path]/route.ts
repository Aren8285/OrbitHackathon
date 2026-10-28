import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 2 * 1024 * 1024 + 64 * 1024;
const resources = new Set([
  'assets', 'vulnerabilities', 'controls', 'risk', 'optimizer',
  'remediations', 'ai', 'assumptions', 'simulation', 'demo', 'health',
]);

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (!resources.has(path[0]) || path.some((part) => !/^[A-Za-z0-9._-]+$/.test(part) || part === '.' || part === '..')) {
    return Response.json({ detail: 'Not found' }, { status: 404 });
  }
  // The shared demo is public through this UI; prevent cross-origin browser use.
  const origin = request.headers.get('origin');
  // Next.js can normalize nextUrl's hostname; browsers use the actual Host.
  const browserOrigin = `${request.nextUrl.protocol}//${request.headers.get('host')}`;
  if (origin && origin !== browserOrigin) {
    return Response.json({ detail: 'Origin not allowed' }, { status: 403 });
  }
  const token = process.env.DEMO_API_TOKEN;
  if (!token) return Response.json({ detail: 'Demo access is not configured' }, { status: 503 });
  const backend = process.env.BACKEND_API_URL ?? 'http://127.0.0.1:8000';
  const target = new URL(path[0] === 'health' ? '/health' : `/api/${path.map(encodeURIComponent).join('/')}`, backend);
  target.search = request.nextUrl.search;
  const headers = new Headers({ accept: 'application/json', 'X-Demo-Token': token });
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  let body: Uint8Array | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.body) {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return Response.json({ detail: 'Upload too large' }, { status: 413 });
      }
      chunks.push(chunk.value);
    }
    body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  }
  try {
    const response = await fetch(target, {
      method: request.method, headers, body: body as BodyInit | undefined,
      cache: 'no-store', redirect: 'manual', signal: path[0] === 'ai' ? request.signal : AbortSignal.timeout(35_000),
    });
    const responseHeaders = new Headers({
      'content-type': response.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    });
    const retryAfter = response.headers.get('retry-after');
    if (retryAfter) responseHeaders.set('retry-after', retryAfter);
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch {
    return Response.json({ detail: 'Backend unavailable' }, { status: 502 });
  }
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE, proxy as PATCH };
